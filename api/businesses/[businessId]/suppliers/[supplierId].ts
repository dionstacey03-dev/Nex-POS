import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../../db';
import { requireBusinessRole } from '../../../_lib/authz';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const updateSchema = z.object({
  companyName: z.string().trim().min(1).max(140).optional(),
  contactPerson: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(160).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one supplier field to update.',
});
const fields: Record<string, string> = {
  companyName: 'company_name', contactPerson: 'contact_person', phone: 'phone', email: 'email', address: 'address',
};

export default async function supplier(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  const supplierId = String(req.query.supplierId ?? '');
  if (!uuid.test(businessId) || !uuid.test(supplierId)) {
    return res.status(400).json({ error: 'Invalid business or supplier identifier.' });
  }
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager']);
  if (!actor) return;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid supplier update.', issues: parsed.error.issues });

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const current = await client.query(
      'SELECT id FROM suppliers WHERE business_id = $1::uuid AND id = $2::uuid FOR UPDATE',
      [businessId, supplierId],
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    const entries = Object.entries(parsed.data) as Array<[keyof typeof parsed.data, unknown]>;
    const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 3}`);
    const updated = await client.query(
      `UPDATE suppliers SET ${assignments.join(', ')},updated_at = now()
       WHERE business_id = $1::uuid AND id = $2::uuid
       RETURNING id,business_id AS "businessId",company_name AS "companyName",
         contact_person AS "contactPerson",phone,email,address,
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId,supplierId,...entries.map(([,value])=>value)],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'supplier.updated','supplier',supplierId,JSON.stringify({ changedFields: entries.map(([key])=>key) })],
    );
    await client.query('COMMIT');
    return res.status(200).json({ supplier: updated.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'The supplier request could not be completed.' });
  } finally {
    client.release();
  }
}
