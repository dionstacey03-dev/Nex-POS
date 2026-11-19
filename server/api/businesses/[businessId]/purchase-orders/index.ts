import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../../../db/index.js';
import { requireBusinessRole } from '../../../../../api/_lib/authz.js';
import { parseMoneyToMinorUnits, formatMinorUnits } from '../../../../../api/_lib/money.js';

const schema = z.object({
  supplierId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().finite().positive().max(1000000),
    unitCost: z.number().finite().nonnegative().max(100000000),
  }).strict()).min(1).max(200),
}).strict();

export default async function createPurchaseOrder(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) return res.status(400).json({ error: 'Invalid business identifier.' });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid purchase order.', issues: parsed.error.issues });
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const supplier = await client.query('SELECT company_name FROM suppliers WHERE business_id = $1::uuid AND id = $2::uuid', [businessId,parsed.data.supplierId]);
    if (!supplier.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Supplier does not belong to this business.' });
    }
    if (parsed.data.locationId) {
      const location = await client.query('SELECT id FROM inventory_locations WHERE business_id = $1::uuid AND id = $2::uuid', [businessId,parsed.data.locationId]);
      if (!location.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Location does not belong to this business.' });
      }
    }
    const products = [...new Set(parsed.data.items.map((item) => item.productId))].sort();
    const productRows = await client.query<{ id: string; name: string; sku: string }>('SELECT id,name,sku FROM products WHERE business_id = $1::uuid AND id = ANY($2::uuid[]) AND active = true', [businessId,products]);
    if (productRows.rows.length !== products.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'One or more products are unavailable in this business.' });
    }

    const poId = crypto.randomUUID();
    const purchaseNumber = 'PO-' + new Date().toISOString().slice(0,10).replaceAll('-','') + '-' + poId.slice(0,8).toUpperCase();
    const totalMinor = parsed.data.items.reduce((sum,item) => {
      const cost = parseMoneyToMinorUnits(item.unitCost);
      return sum + Math.round(cost * item.quantity);
    },0);
    await client.query(
      `INSERT INTO purchase_orders (id,business_id,purchase_number,supplier_id,location_id,status,total_cost,created_by_user_id)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,'ordered',$6,$7)`,
      [poId,businessId,purchaseNumber,parsed.data.supplierId,parsed.data.locationId ?? null,formatMinorUnits(totalMinor),actor.userId],
    );
    for (const item of parsed.data.items) {
      const product = productRows.rows.find((row) => row.id === item.productId)!;
      await client.query(
        `INSERT INTO purchase_order_items (business_id,purchase_order_id,product_id,product_name,sku,quantity_ordered,unit_cost)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7)`,
        [businessId,poId,item.productId,product.name,product.sku,Math.round(item.quantity * 1000) / 1000,formatMinorUnits(parseMoneyToMinorUnits(item.unitCost))],
      );
    }
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'purchase_order.created','purchase_order',poId,JSON.stringify({ purchaseNumber, itemCount: parsed.data.items.length })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ purchaseOrder: { id: poId, purchaseNumber, status: 'ordered', totalCost: formatMinorUnits(totalMinor) } });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Purchase order could not be created.' });
  } finally {
    client.release();
  }
}
