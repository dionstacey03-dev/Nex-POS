import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const productSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(500).optional(),
  categoryId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(64),
  barcode: z.string().trim().max(64).optional(),
  purchasePrice: z.number().finite().min(0).max(999999999999),
  sellingPrice: z.number().finite().min(0).max(999999999999),
  minStockLevel: z.number().finite().min(0).max(100000000).default(0),
  imageUrl: z.string().url().max(1000).optional(),
}).strict();

export default async function products(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const businessId = String(req.query.businessId ?? '');
  if (!uuid.test(businessId)) return res.status(400).json({ error: 'Invalid business identifier.' });

  const actor = await requireBusinessRole(
    req,
    res,
    businessId,
    req.method === 'GET' ? ['owner', 'admin', 'manager', 'cashier'] : ['owner', 'admin', 'manager'],
  );
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);

    if (req.method === 'GET') {
      const canViewCost = actor.role !== 'cashier';
      const result = await client.query(
        `SELECT id,business_id AS "businessId",name,description,category_id AS "categoryId",
          location_id AS "locationId",sku,barcode,
          ${canViewCost ? 'purchase_price::float8' : 'NULL::float8'} AS "purchasePrice",
          selling_price::float8 AS "sellingPrice",stock_quantity::float8 AS "stockQuantity",
          min_stock_level::float8 AS "minStockLevel",image_url AS "imageUrl",active,
          created_at AS "createdAt",updated_at AS "updatedAt"
         FROM products WHERE business_id = $1::uuid
         ORDER BY name LIMIT 1000`,
        [businessId],
      );
      await client.query('COMMIT');
      return res.status(200).json({ products: result.rows });
    }

    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid product details.', issues: parsed.error.issues });
    }

    const data = parsed.data;
    const inserted = await client.query(
      `INSERT INTO products (
        business_id,category_id,location_id,name,description,sku,barcode,
        purchase_price,selling_price,stock_quantity,min_stock_level,image_url,active
      ) VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,0,$10,$11,true)
      RETURNING id,business_id AS "businessId",name,description,category_id AS "categoryId",
        location_id AS "locationId",sku,barcode,purchase_price::float8 AS "purchasePrice",
        selling_price::float8 AS "sellingPrice",stock_quantity::float8 AS "stockQuantity",
        min_stock_level::float8 AS "minStockLevel",image_url AS "imageUrl",active,
        created_at AS "createdAt",updated_at AS "updatedAt"`,
      [
        businessId,data.categoryId,data.locationId ?? null,data.name,data.description ?? null,
        data.sku,data.barcode || null,data.purchasePrice,data.sellingPrice,data.minStockLevel,
        data.imageUrl ?? null,
      ],
    );

    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'product.created','product',inserted.rows[0].id,JSON.stringify({ sku: data.sku })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ product: inserted.rows[0] });
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
