import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getPool } from '../../../../db/index.js';
import { requireBusinessRole } from '../../../../api/_lib/authz.js';

const schema = z.object({
  email: z.string().trim().email().max(160),
  role: z.enum(['admin', 'manager', 'cashier']),
}).strict();

export default async function createInvitation(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) {
    return res.status(400).json({ error: 'Invalid business identifier.' });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid invitation details.', issues: parsed.error.issues });
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin']);
  if (!actor) return;
  if (actor.role !== 'owner' && parsed.data.role === 'admin') {
    return res.status(403).json({ error: 'Only the owner can invite administrators.' });
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const existing = await client.query(
      'SELECT 1 FROM business_memberships m JOIN "user" u ON u.id=m.user_id WHERE m.business_id=$1::uuid AND lower(u.email)=lower($2) AND m.active=true',
      [businessId,parsed.data.email],
    );
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This person is already an active member of the business.' });
    }
    await client.query(
      'UPDATE business_invitations SET expires_at=now() WHERE business_id=$1::uuid AND lower(email)=lower($2) AND accepted_at IS NULL AND expires_at>now()',
      [businessId,parsed.data.email],
    );
    const result = await client.query(
      `INSERT INTO business_invitations (business_id,email,role,token_hash,invited_by_user_id,expires_at)
       VALUES ($1::uuid,$2,$3,$4,$5,now()+interval '7 days')
       RETURNING id,email,role,expires_at AS "expiresAt"`,
      [businessId,parsed.data.email.toLowerCase(),parsed.data.role,tokenHash,actor.userId],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'employee.invited','business_invitation',result.rows[0].id,JSON.stringify({ email: parsed.data.email.toLowerCase(), role: parsed.data.role })],
    );
    await client.query('COMMIT');
    return res.status(201).json({
      invitation: result.rows[0],
      invitationToken: token,
      delivery: 'manual',
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Employee invitation could not be created.' });
  } finally {
    client.release();
  }
}
