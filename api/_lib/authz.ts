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
    const rate = await client.query<{ request_count: number }>(
      `INSERT INTO api_rate_limits (user_id,route_key,window_started_at,request_count)
       VALUES ($1,$2,date_trunc('minute',now()),1)
       ON CONFLICT (user_id,route_key) DO UPDATE SET
         request_count = CASE
           WHEN api_rate_limits.window_started_at < date_trunc('minute',now()) THEN 1
           ELSE api_rate_limits.request_count + 1
         END,
         window_started_at = CASE
           WHEN api_rate_limits.window_started_at < date_trunc('minute',now()) THEN date_trunc('minute',now())
           ELSE api_rate_limits.window_started_at
         END
       RETURNING request_count`,
      [session.user.id, 'business-api'],
    );
    if (rate.rows[0].request_count > 120) {
      await client.query('COMMIT');
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'Too many business API requests. Please try again shortly.' });
      return null;
    }

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
