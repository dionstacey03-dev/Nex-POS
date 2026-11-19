import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { auth } from '../../auth';
import { getPool } from '../../db';
import { requestHeaders } from '../_lib/authz';

const schema = z.object({ businessId: z.string().uuid(), token: z.string().min(32).max(128) }).strict();

export default async function acceptInvitation(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid invitation token.' });
  const session = await auth.api.getSession({ headers: requestHeaders(req.headers) });
  if (!session?.user?.id || !session.user.email) {
    return res.status(401).json({ error: 'Sign in with the invited email address before accepting this invitation.' });
  }
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [parsed.data.businessId]);
    const invitation = await client.query<{
      id: string; business_id: string; email: string; role: 'admin' | 'manager' | 'cashier';
    }>(
      'SELECT id,business_id,email,role FROM business_invitations WHERE business_id=$1::uuid AND token_hash=$2 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE',
      [parsed.data.businessId,tokenHash],
    );
    const invite = invitation.rows[0];
    if (!invite) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invitation is invalid, expired, or already used.' });
    }
    if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Sign in using the email address this invitation was sent to.' });
    }
    await client.query("SELECT set_config('app.business_id', $1, true)", [invite.business_id]);
    await client.query(
      `INSERT INTO business_memberships (business_id,user_id,role,active)
       VALUES ($1::uuid,$2,$3,true)
       ON CONFLICT (business_id,user_id) DO UPDATE SET role=EXCLUDED.role,active=true,updated_at=now()`,
      [invite.business_id,session.user.id,invite.role],
    );
    await client.query('UPDATE business_invitations SET accepted_at=now() WHERE id=$1::uuid', [invite.id]);
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id) VALUES ($1::uuid,$2,$3,$4,$5)',
      [invite.business_id,session.user.id,'employee.invitation_accepted','business_membership',session.user.id],
    );
    await client.query('COMMIT');
    return res.status(200).json({ accepted: true, businessId: invite.business_id, role: invite.role });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Invitation could not be accepted.' });
  } finally {
    client.release();
  }
}
