import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  color: z.string().trim().max(30).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one category field to update.',
});

const fields: Record<string, string> = {
  name: 'name',
  description: 'description',
  color: 'color',
  sortOrder: 'sort_order',
  active: 'active',
};

export default async function category(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const businessId = String(req.query.businessId ?? '');
  const categoryId = String(req.query.categoryId ?? '');
  if (!uuid.test(businessId) || !uuid.test(categoryId)) {
    return res.status(400).json({ error: 'Invalid business or category identifier.' });
  }

  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;

  const parsed = req.method === 'PATCH' ? updateSchema.safeParse(req.body) : undefined;
  if (parsed && !parsed.success) {
    return res.status(400).json({ error: 'Invalid category update.', issues: parsed.error.issues });
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);

    const current = await client.query<{ id: string; name: string; active: boolean }>(
      'SELECT id,name,active FROM categories WHERE business_id = $1::uuid AND id = $2::uuid FOR UPDATE',
      [businessId, categoryId],
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Category not found.' });
    }

    const data = req.method === 'PATCH' ? parsed!.data : { active: false };
    if (data.active === false && current.rows[0].active) {
      const linked = await client.query(
        'SELECT 1 FROM products WHERE business_id = $1::uuid AND category_id = $2::uuid AND active = true LIMIT 1',
        [businessId, categoryId],
      );
      if (linked.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This category is assigned to active products. Reassign or archive those products before archiving the category.' });
      }
    }

    const entries = Object.entries(data) as Array<[keyof typeof data, unknown]>;
    const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 3}`);
    const values = entries.map(([, value]) => value);
    const updated = await client.query(
      `UPDATE categories SET ${assignments.join(', ')},updated_at = now()
       WHERE business_id = $1::uuid AND id = $2::uuid
       RETURNING id,business_id AS "businessId",name,description,color,active,
         sort_order AS "sortOrder",created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId,categoryId,...values],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,req.method === 'DELETE' ? 'category.archived' : 'category.updated','category',categoryId,JSON.stringify({ changedFields: entries.map(([key]) => key) })],
    );
    await client.query('COMMIT');
    return res.status(200).json({ category: updated.rows[0], archived: data.active === false });
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
