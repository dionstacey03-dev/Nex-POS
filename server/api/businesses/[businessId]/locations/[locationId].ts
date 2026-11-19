import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../../../db/index.js';
import { requireBusinessRole } from '../../../../../api/_lib/authz.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().max(300).nullable().optional(),
  isDefault: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one location field to update.',
});
const fields: Record<string, string> = { name: 'name', address: 'address', isDefault: 'is_default' };

export default async function location(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  const locationId = String(req.query.locationId ?? '');
  if (!uuid.test(businessId) || !uuid.test(locationId)) {
    return res.status(400).json({ error: 'Invalid business or location identifier.' });
  }
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid inventory location update.', issues: parsed.error.issues });

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const current = await client.query<{ id: string; name: string; is_default: boolean }>(
      'SELECT id,name,is_default FROM inventory_locations WHERE business_id = $1::uuid AND id = $2::uuid FOR UPDATE',
      [businessId,locationId],
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inventory location not found.' });
    }
    const data = parsed.data;
    if (data.isDefault === true) {
      await client.query(
        'UPDATE inventory_locations SET is_default = false,updated_at = now() WHERE business_id = $1::uuid AND id <> $2::uuid AND is_default = true',
        [businessId,locationId],
      );
    }
    const entries = Object.entries(data) as Array<[keyof typeof data, unknown]>;
    const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 3}`);
    const updated = await client.query(
      `UPDATE inventory_locations SET ${assignments.join(', ')},updated_at = now()
       WHERE business_id = $1::uuid AND id = $2::uuid
       RETURNING id,business_id AS "businessId",name,address,is_default AS "isDefault",
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId,locationId,...entries.map(([,value])=>value)],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'location.updated','inventory_location',locationId,JSON.stringify({ changedFields: entries.map(([key])=>key) })],
    );
    await client.query('COMMIT');
    return res.status(200).json({ location: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'The business can have only one default inventory location.' });
    }
    return res.status(500).json({ error: 'The inventory location request could not be completed.' });
  } finally {
    client.release();
  }
}
