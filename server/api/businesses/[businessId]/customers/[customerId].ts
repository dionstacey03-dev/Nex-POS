import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(160).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one customer field to update.',
});
const fields: Record<string, string> = {
  name: 'name', phone: 'phone', email: 'email', address: 'address',
};

export default async function customer(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  const customerId = String(req.query.customerId ?? '');
  if (!uuid.test(businessId) || !uuid.test(customerId)) {
    return res.status(400).json({ error: 'Invalid business or customer identifier.' });
  }
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager', 'cashier']);
  if (!actor) return;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid customer update.', issues: parsed.error.issues });

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const current = await client.query(
      'SELECT id FROM customers WHERE business_id = $1::uuid AND id = $2::uuid FOR UPDATE',
      [businessId, customerId],
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Customer not found.' });
    }
    const entries = Object.entries(parsed.data) as Array<[keyof typeof parsed.data, unknown]>;
    const assignments = entries.map(([key], index) => `${fields[key]} = $${index + 3}`);
    const updated = await client.query(
      `UPDATE customers SET ${assignments.join(', ')},updated_at = now()
       WHERE business_id = $1::uuid AND id = $2::uuid
       RETURNING id,business_id AS "businessId",name,phone,email,address,
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId,customerId,...entries.map(([,value])=>value)],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'customer.updated','customer',customerId,JSON.stringify({ changedFields: entries.map(([key])=>key) })],
    );
    await client.query('COMMIT');
    return res.status(200).json({ customer: updated.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'The customer request could not be completed.' });
  } finally {
    client.release();
  }
}
