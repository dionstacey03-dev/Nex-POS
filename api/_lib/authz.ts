import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from '../../auth';
import { getPool } from '../../db';

export type BusinessRole = 'owner' | 'admin' | 'manager' | 'cashier';

export function requestHeaders(input: VercelRequest['headers']): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) headers.set(key, key.toLowerCase() === 'cookie' ? value.join('; ') : value.join(', '));
    else if (typeof value === 'string') headers.set(key, value);
  }
  return headers;
}

export async function requireBusinessRole(
  req: VercelRequest,
  res: VercelResponse,
  businessId: string,
  allowedRoles: BusinessRole[],
): Promise<{ userId: string; name: string; role: BusinessRole } | null> {
  const session = await auth.api.getSession({ headers: requestHeaders(req.headers) });
  if (!session?.user?.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.business_id', businessId]);
    const membership = await client.query<{ role: BusinessRole; active: boolean }>(
      'SELECT role, active FROM business_memberships WHERE business_id = $1::uuid AND user_id = $2',
      [businessId, session.user.id],
    );
    await client.query('COMMIT');

    const member = membership.rows[0];
    if (!member?.active) {
      res.status(403).json({ error: 'You do not have access to this business.' });
      return null;
    }
    if (!allowedRoles.includes(member.role)) {
      res.status(403).json({ error: 'Your business role cannot perform this action.' });
      return null;
    }
    return { userId: session.user.id, name: session.user.name, role: member.role };
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    res.status(503).json({ error: 'Unable to verify business access right now.' });
    return null;
  } finally {
    client.release();
  }
}
