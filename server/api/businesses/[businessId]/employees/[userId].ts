import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const schema = z.object({
  role: z.enum(['admin', 'manager', 'cashier']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide a role or status to update.',
});

export default async function updateEmployee(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  const userId = String(req.query.userId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId) || !userId || userId.length > 128) {
    return res.status(400).json({ error: 'Invalid business or employee identifier.' });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid employee update.', issues: parsed.error.issues });
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin']);
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const target = await client.query<{ role: string; active: boolean }>(
      'SELECT role,active FROM business_memberships WHERE business_id=$1::uuid AND user_id=$2 FOR UPDATE',
      [businessId,userId],
    );
    if (!target.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Employee membership not found.' });
    }
    const current = target.rows[0];
    if (current.role === 'owner' || userId === actor.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Owner and self-membership changes must be handled through the account owner workflow.' });
    }
    if (actor.role !== 'owner' && current.role === 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the business owner can manage administrator memberships.' });
    }
    const nextRole = parsed.data.role ?? current.role;
    if (actor.role !== 'owner' && nextRole === 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the business owner can assign administrator access.' });
    }
    const nextActive = parsed.data.status === undefined ? current.active : parsed.data.status === 'active';
    await client.query(
      'UPDATE business_memberships SET role=$1::business_role,active=$2,updated_at=now() WHERE business_id=$3::uuid AND user_id=$4',
      [nextRole,nextActive,businessId,userId],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'employee.updated','business_membership',userId,JSON.stringify({ previousRole: current.role, role: nextRole, previousActive: current.active, active: nextActive })],
    );
    const result = await client.query(
      `SELECT m.user_id AS uid,m.business_id AS "businessId",u.name,u.email,m.role,
        CASE WHEN m.active THEN 'active' ELSE 'inactive' END AS status,
        m.created_at AS "createdAt",m.updated_at AS "updatedAt"
       FROM business_memberships m JOIN "user" u ON u.id=m.user_id
       WHERE m.business_id=$1::uuid AND m.user_id=$2`,
      [businessId,userId],
    );
    await client.query('COMMIT');
    return res.status(200).json({ employee: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Employee membership could not be updated.' });
  } finally {
    client.release();
  }
}
