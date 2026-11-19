import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../../../db';
import { requireBusinessRole } from '../../../../_lib/authz';

const schema = z.object({
  requestId: z.string().trim().min(12).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  items: z.array(z.object({
    purchaseOrderItemId: z.string().uuid(),
    quantity: z.number().finite().positive().max(1000000),
  }).strict()).min(1).max(200),
}).strict();

export default async function receivePurchase(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  const purchaseOrderId = String(req.query.purchaseOrderId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(purchaseOrderId)) {
    return res.status(400).json({ error: 'Invalid business or purchase order identifier.' });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid receiving request.', issues: parsed.error.issues });
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;

  const normalizedItems = parsed.data.items
    .map((item) => ({ purchaseOrderItemId: item.purchaseOrderItemId, quantity: Math.round(item.quantity * 1000) / 1000 }))
    .sort((a, b) => a.purchaseOrderItemId.localeCompare(b.purchaseOrderItemId));
  const requestFingerprint = createHash('sha256')
    .update(JSON.stringify({ purchaseOrderId, items: normalizedItems }))
    .digest('hex');

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const poResult = await client.query(
      'SELECT id,status,location_id FROM purchase_orders WHERE business_id = $1::uuid AND id = $2::uuid FOR UPDATE',
      [businessId,purchaseOrderId],
    );
    if (!poResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Purchase order not found.' });
    }
    const prior = await client.query(
      'SELECT id,purchase_order_id,created_at,request_fingerprint FROM purchase_receipts WHERE business_id = $1::uuid AND request_id = $2',
      [businessId,parsed.data.requestId],
    );
    if (prior.rowCount) {
      if (prior.rows[0].purchase_order_id !== purchaseOrderId || prior.rows[0].request_fingerprint !== requestFingerprint) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This receiving request ID was already used with a different purchase order or quantity payload.' });
      }
      await client.query('COMMIT');
      return res.status(200).json({ receipt: prior.rows[0], alreadyReceived: true });
    }
    if (!['ordered','partially_received'].includes(poResult.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This purchase order cannot receive more stock.' });
    }

    const itemIds = normalizedItems.map((item) => item.purchaseOrderItemId);
    if (itemIds.length !== new Set(itemIds).size) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Each purchase order line may appear only once per receipt.' });
    }
    const itemRows = await client.query<{
      id: string; product_id: string; quantity_ordered: string; quantity_received: string; unit_cost: string;
    }>(
      'SELECT id,product_id,quantity_ordered::text,quantity_received::text,unit_cost::text FROM purchase_order_items WHERE business_id = $1::uuid AND purchase_order_id = $2::uuid AND id = ANY($3::uuid[]) ORDER BY id FOR UPDATE',
      [businessId,purchaseOrderId,itemIds],
    );
    if (itemRows.rows.length !== itemIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A purchase order line was not found.' });
    }
    const quantities = new Map(normalizedItems.map((item) => [item.purchaseOrderItemId,item.quantity]));
    for (const item of itemRows.rows) {
      const incoming = quantities.get(item.id)!;
      if (Number(item.quantity_received) + incoming > Number(item.quantity_ordered)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Received quantity exceeds the outstanding purchase order quantity.' });
      }
    }

    const productIds = [...new Set(itemRows.rows.map((item) => item.product_id))].sort();
    const productRows = await client.query<{ id: string; stock_quantity: string; location_id: string | null; name: string }>(
      'SELECT id,stock_quantity::text,location_id,name FROM products WHERE business_id = $1::uuid AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE',
      [businessId,productIds],
    );
    if (productRows.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A product from this purchase order no longer exists.' });
    }
    if (poResult.rows[0].location_id && productRows.rows.some((product) => product.location_id !== poResult.rows[0].location_id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The purchase order location does not match every product inventory location. Correct the product locations or create a matching purchase order.' });
    }

    const receiptId = crypto.randomUUID();
    await client.query(
      'INSERT INTO purchase_receipts (id,business_id,purchase_order_id,request_id,request_fingerprint,received_by_user_id) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6)',
      [receiptId,businessId,purchaseOrderId,parsed.data.requestId,requestFingerprint,actor.userId],
    );
    for (const item of itemRows.rows) {
      const incoming = quantities.get(item.id)!;
      const product = productRows.rows.find((row) => row.id === item.product_id)!;
      const previous = Number(product.stock_quantity);
      const next = Math.round((previous + incoming) * 1000) / 1000;
      await client.query(
        'UPDATE purchase_order_items SET quantity_received = quantity_received + $1 WHERE business_id = $2::uuid AND id = $3::uuid',
        [incoming,businessId,item.id],
      );
      await client.query(
        'INSERT INTO purchase_receipt_items (business_id,receipt_id,purchase_order_item_id,product_id,quantity_received,unit_cost) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6)',
        [businessId,receiptId,item.id,item.product_id,incoming,item.unit_cost],
      );
      await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at = now() WHERE business_id = $2::uuid AND id = $3::uuid',
        [next,businessId,product.id],
      );
      await client.query(
        `INSERT INTO inventory_movements (business_id,product_id,product_name,location_id,movement_type,quantity_delta,previous_stock,new_stock,reference_type,reference_id,reason,actor_user_id,actor_name)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'purchase',$5,$6,$7,'purchase_receipt',$8::uuid,$9,$10,$11)`,
        [businessId,product.id,product.name,product.location_id,incoming,previous,next,receiptId,'Received purchase order ' + purchaseOrderId,actor.userId,actor.name],
      );
    }

    const remaining = await client.query(
      'SELECT COALESCE(SUM(quantity_ordered - quantity_received),0)::text AS remaining FROM purchase_order_items WHERE business_id = $1::uuid AND purchase_order_id = $2::uuid',
      [businessId,purchaseOrderId],
    );
    const nextStatus = Number(remaining.rows[0].remaining) === 0 ? 'received' : 'partially_received';
    await client.query('UPDATE purchase_orders SET status = $1, updated_at = now() WHERE business_id = $2::uuid AND id = $3::uuid',[nextStatus,businessId,purchaseOrderId]);
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'purchase_order.received','purchase_order',purchaseOrderId,JSON.stringify({ receiptId, itemCount: itemRows.rows.length })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ receipt: { id: receiptId, purchaseOrderId, status: nextStatus } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'This receipt request has already been processed.' });
    return res.status(500).json({ error: 'Purchase receiving failed. No changes were saved.' });
  } finally {
    client.release();
  }
}
