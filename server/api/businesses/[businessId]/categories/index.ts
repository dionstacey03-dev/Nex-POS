import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  color: z.string().trim().max(30).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict();

export default async function categories(req: VercelRequest, res: VercelResponse) {
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
      const result = await client.query(
        `SELECT id,business_id AS "businessId",name,description,color,active,
          sort_order AS "sortOrder",created_at AS "createdAt",updated_at AS "updatedAt"
         FROM categories WHERE business_id = $1::uuid
         ORDER BY sort_order,name LIMIT 500`,
        [businessId],
      );
      await client.query('COMMIT');
      return res.status(200).json({ categories: result.rows });
    }

    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid category details.', issues: parsed.error.issues });
    }
    const data = parsed.data;
    const inserted = await client.query(
      `INSERT INTO categories (business_id,name,description,color,sort_order,active)
       VALUES ($1::uuid,$2,$3,$4,$5,true)
       RETURNING id,business_id AS "businessId",name,description,color,active,
         sort_order AS "sortOrder",created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId,data.name,data.description ?? null,data.color ?? null,data.sortOrder ?? 0],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'category.created','category',inserted.rows[0].id,JSON.stringify({ name: data.name })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ category: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'A category with this name already exists in this business.' });
    }
    return res.status(500).json({ error: 'The category request could not be completed.' });
  } finally {
    client.release();
  }
}
