import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../../db';
import { requireBusinessRole } from '../../../_lib/authz';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  sku: z.string().trim().min(1).max(64).optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  purchasePrice: z.number().finite().min(0).max(999999999999).optional(),
  sellingPrice: z.number().finite().min(0).max(999999999999).optional(),
  minStockLevel: z.number().finite().min(0).max(100000000).optional(),
  imageUrl: z.string().url().max(1000).nullable().optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one product field to update.',
});

const fields: Record<string, string> = {
  name: 'name',
  description: 'description',
  categoryId: 'category_id',
  locationId: 'location_id',
  sku: 'sku',
  barcode: 'barcode',
  purchasePrice: 'purchase_price',
  sellingPrice: 'selling_price',
  minStockLevel: 'min_stock_level',
  imageUrl: 'image_url',
  active: 'active',
};

export default async function product(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const businessId = String(req.query.businessId ?? '');
  const productId = String(req.query.productId ?? '');
  if (!uuid.test(businessId) || !uuid.test(productId)) {
    return res.status(400).json({ error: 'Invalid business or product identifier.' });
  }

  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;

  const parsed = req.method === 'PATCH' ? updateSchema.safeParse(req.body) : undefined;
  if (parsed && !parsed.success) {
    return res.status(400).json({ error: 'Invalid product update.', issues: parsed.error.issues });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);

    const current = await client.query<{
      id: string;
      name: string;
      sku: string;
      stock_quantity: string;
      active: boolean;
    }>(
      'SELECT id,name,sku,stock_quantity::text,active FROM products WHERE business_id = $1::uuid AND id = $2::uuid FOR UPDATE',
      [businessId, productId],
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found.' });
    }

    if (req.method === 'DELETE') {
      if (!current.rows[0].active) {
        await client.query('COMMIT');
        return res.status(200).json({ deleted: true, alreadyInactive: true });
      }
      if (Number(current.rows[0].stock_quantity) !== 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A product with remaining stock cannot be archived. Adjust or sell its stock first.' });
      }
      await client.query(
        'UPDATE products SET active = false, updated_at = now() WHERE business_id = $1::uuid AND id = $2::uuid',
        [businessId, productId],
      );
      await client.query(
        'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
        [businessId, actor.userId, 'product.archived', 'product', productId, JSON.stringify({ name: current.rows[0].name, sku: current.rows[0].sku })],
      );
      await client.query('COMMIT');
      return res.status(200).json({ deleted: true, archived: true });
    }

    const data = parsed!.data;
    if (data.active === false && current.rows[0].active && Number(current.rows[0].stock_quantity) !== 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A product with remaining stock cannot be archived.' });
    }

    const entries = Object.entries(data) as Array<[keyof typeof data, unknown]>;
    const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 3}`);
    const values = entries.map(([, value]) => value);
    const updated = await client.query(
      `UPDATE products SET ${assignments.join(', ')}, updated_at = now()
       WHERE business_id = $1::uuid AND id = $2::uuid
       RETURNING id,business_id AS "businessId",name,description,category_id AS "categoryId",
         location_id AS "locationId",sku,barcode,purchase_price::float8 AS "purchasePrice",
         selling_price::float8 AS "sellingPrice",stock_quantity::float8 AS "stockQuantity",
         min_stock_level::float8 AS "minStockLevel",image_url AS "imageUrl",active,
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId, productId, ...values],
    );

    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId, actor.userId, 'product.updated', 'product', productId, JSON.stringify({ changedFields: entries.map(([key]) => key) })],
    );
    await client.query('COMMIT');
    return res.status(200).json({ product: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const code = (error as { code?: string }).code;
    if (code === '23505') return res.status(409).json({ error: 'A product with this SKU or barcode already exists in this business.' });
    if (code === '23503') return res.status(400).json({ error: 'The selected category or location does not belong to this business.' });
    return res.status(500).json({ error: 'The product request could not be completed.' });
  } finally {
    client.release();
  }
}
