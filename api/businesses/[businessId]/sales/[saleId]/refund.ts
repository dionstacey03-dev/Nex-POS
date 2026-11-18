import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../../../db';
import { requireBusinessRole } from '../../../../_lib/authz';

const schema = z.object({
  requestId: z.string().trim().min(12).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  reason: z.string().trim().min(1).max(240),
  refundMethod: z.enum(['cash', 'other']),
  paymentReference: z.string().trim().min(1).max(100).optional(),
}).strict();

export default async function refundSale(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  const saleId = String(req.query.saleId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(businessId) || !/^[0-9a-f-]{36}$/i.test(saleId)) {
    return res.status(400).json({ error: 'Invalid business or sale identifier.' });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid refund request.', issues: parsed.error.issues });
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const priorRequest = await client.query(
      'SELECT id, sale_id, amount, refund_method, created_at FROM refunds WHERE business_id = $1::uuid AND request_id = $2',
      [businessId,parsed.data.requestId],
    );
    if (priorRequest.rowCount) {
      if (priorRequest.rows[0].sale_id !== saleId) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This refund request ID belongs to another sale.' });
      }
      await client.query('COMMIT');
      return res.status(200).json({ refund: priorRequest.rows[0], alreadyRefunded: true });
    }

    const saleResult = await client.query<{
      id: string; status: string; payment_method: string; grand_total: string;
    }>(
      'SELECT id,status,payment_method,grand_total::text FROM sales WHERE business_id = $1::uuid AND id = $2::uuid FOR UPDATE',
      [businessId,saleId],
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found.' });
    }
    if (sale.status === 'refunded') {
      await client.query('COMMIT');
      return res.status(200).json({ alreadyRefunded: true });
    }
    if (sale.status !== 'completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only completed sales can be fully refunded.' });
    }
    if (sale.payment_method === 'card') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Card refunds require a configured payment gateway. No card funds have been returned.' });
    }

    const items = await client.query<{ product_id: string; quantity: string }>(
      'SELECT product_id, SUM(quantity)::text AS quantity FROM sale_items WHERE business_id = $1::uuid AND sale_id = $2::uuid AND product_id IS NOT NULL GROUP BY product_id ORDER BY product_id',
      [businessId,saleId],
    );
    const productIds = items.rows.map((row) => row.product_id);
    const products = productIds.length
      ? await client.query<{ id: string; stock_quantity: string; location_id: string | null; name: string }>(
          'SELECT id,stock_quantity::text,location_id,name FROM products WHERE business_id = $1::uuid AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE',
          [businessId,productIds],
        )
      : { rows: [] as { id: string; stock_quantity: string; location_id: string | null; name: string }[] };
    if (products.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A product from this sale no longer exists; manual inventory reconciliation is required.' });
    }

    const refund = await client.query(
      `INSERT INTO refunds (business_id,sale_id,request_id,amount,reason,refund_method,payment_reference,actor_user_id)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8)
       RETURNING id,sale_id,amount,refund_method,created_at`,
      [businessId,saleId,parsed.data.requestId,sale.grand_total,parsed.data.reason,parsed.data.refundMethod,parsed.data.paymentReference ?? null,actor.userId],
    );

    for (const item of items.rows) {
      const product = products.rows.find((row) => row.id === item.product_id)!;
      const quantity = Number(item.quantity);
      const previous = Number(product.stock_quantity);
      const next = Math.round((previous + quantity) * 1000) / 1000;
      await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at = now() WHERE business_id = $2::uuid AND id = $3::uuid',
        [next,businessId,product.id],
      );
      await client.query(
        `INSERT INTO inventory_movements (business_id,product_id,location_id,movement_type,quantity_delta,previous_stock,new_stock,reference_type,reference_id,reason,actor_user_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,'return',$4,$5,$6,'refund',$7::uuid,$8,$9)`,
        [businessId,product.id,product.location_id,quantity,previous,next,saleId,'Refund ' + saleId,actor.userId],
      );
    }

    await client.query('UPDATE sales SET status = \'refunded\' WHERE business_id = $1::uuid AND id = $2::uuid',[businessId,saleId]);
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'sale.refunded','sale',saleId,JSON.stringify({ refundId: refund.rows[0].id, amount: sale.grand_total, refundMethod: parsed.data.refundMethod })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ refund: refund.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'This sale has already been refunded.' });
    return res.status(500).json({ error: 'Refund failed. No changes were saved.' });
  } finally {
    client.release();
  }
}
