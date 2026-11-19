import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const schema = z.object({
  requestId: z.string().trim().min(12).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(['in', 'out', 'adjustment']),
  quantityChange: z.number().finite().positive().max(1000000),
  reason: z.string().trim().min(1).max(240),
  locationId: z.string().uuid().optional(),
}).strict();

export default async function adjustStock(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  const productId = String(req.query.productId ?? '');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(businessId) || !uuid.test(productId)) {
    return res.status(400).json({ error: 'Invalid business or product identifier.' });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid stock adjustment.', issues: parsed.error.issues });
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const prior = await client.query(
      'SELECT new_stock, product_id FROM inventory_movements WHERE business_id = $1::uuid AND request_id = $2',
      [businessId, parsed.data.requestId],
    );
    if (prior.rowCount) {
      if (prior.rows[0].product_id !== productId) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This request ID belongs to another stock adjustment.' });
      }
      await client.query('COMMIT');
      return res.status(200).json({ stockQuantity: prior.rows[0].new_stock, alreadyApplied: true });
    }

    const result = await client.query<{ stock_quantity: string; name: string; location_id: string | null }>(
      'SELECT stock_quantity::text, name, location_id FROM products WHERE business_id = $1::uuid AND id = $2::uuid AND active = true FOR UPDATE',
      [businessId, productId],
    );
    const product = result.rows[0];
    if (!product) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found.' });
    }
    if (parsed.data.locationId && parsed.data.locationId !== product.location_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The selected location does not match this product inventory location.' });
    }

    const concurrentPrior = await client.query(
      'SELECT new_stock, product_id FROM inventory_movements WHERE business_id = $1::uuid AND request_id = $2',
      [businessId, parsed.data.requestId],
    );
    if (concurrentPrior.rowCount) {
      if (concurrentPrior.rows[0].product_id !== productId) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This request ID belongs to another stock adjustment.' });
      }
      await client.query('COMMIT');
      return res.status(200).json({ stockQuantity: concurrentPrior.rows[0].new_stock, alreadyApplied: true });
    }
    const previous = Number(product.stock_quantity);
    const quantity = Math.round(parsed.data.quantityChange * 1000) / 1000;
    const delta = parsed.data.type === 'in' ? quantity
      : parsed.data.type === 'out' ? -quantity
      : quantity - previous;
    const next = Math.round((previous + delta) * 1000) / 1000;
    if (delta === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The adjustment does not change stock.' });
    }
    if (next < 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The adjustment would create negative stock.' });
    }

    await client.query(
      'UPDATE products SET stock_quantity = $1, updated_at = now() WHERE business_id = $2::uuid AND id = $3::uuid',
      [next,businessId,productId],
    );
    await client.query(
      `INSERT INTO inventory_movements (business_id,product_id,product_name,location_id,movement_type,quantity_delta,previous_stock,new_stock,request_id,reason,actor_user_id,actor_name)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'adjustment',$5,$6,$7,$8,$9,$10,$11)`,
      [businessId,productId,product.name,product.location_id,delta,previous,next,parsed.data.requestId,parsed.data.reason,actor.userId,actor.name],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'inventory.adjusted','product',productId,JSON.stringify({ delta, previous, next, reason: parsed.data.reason })],
    );
    await client.query('COMMIT');
    return res.status(200).json({ stockQuantity: next });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'This stock adjustment request was already applied.' });
    return res.status(500).json({ error: 'Stock adjustment failed. No changes were saved.' });
  } finally {
    client.release();
  }
}
