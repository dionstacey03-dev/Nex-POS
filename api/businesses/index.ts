import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { auth } from '../../auth';
import { getPool } from '../../db';
import { requestHeaders } from '../_lib/authz';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  businessType: z.enum(['retail', 'cafe', 'pharmacy', 'apparel', 'electronics', 'general']).default('general'),
  currency: z.string().regex(/^[A-Z]{3}$/).default('LKR'),
  taxRate: z.number().finite().min(0).max(100).default(0),
  timezone: z.string().trim().min(1).max(64).default('Asia/Colombo'),
}).strict();

export default async function businesses(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const session = await auth.api.getSession({ headers: requestHeaders(req.headers) });
  if (!session?.user?.id) return res.status(401).json({ error: 'Authentication required.' });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [session.user.id]);

    if (req.method === 'GET') {
      const result = await client.query(
        `SELECT b.id,b.name,b.business_type AS "businessType",b.currency,b.tax_rate AS "taxRate",m.role
         FROM business_memberships m
         JOIN businesses b ON b.id = m.business_id
         WHERE m.user_id = $1 AND m.active = true
         ORDER BY b.created_at ASC`,
        [session.user.id],
      );
      await client.query('COMMIT');
      return res.status(200).json({ businesses: result.rows });
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid business details.', issues: parsed.error.issues });
    }

    const created = await client.query(
      `INSERT INTO businesses (name,business_type,currency,tax_rate,timezone,owner_user_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,name,business_type AS "businessType",currency,tax_rate AS "taxRate"`,
      [parsed.data.name,parsed.data.businessType,parsed.data.currency,parsed.data.taxRate,parsed.data.timezone,session.user.id],
    );
    const business = created.rows[0];
    await client.query("SELECT set_config('app.business_id', $1, true)", [business.id]);
    await client.query(
      'INSERT INTO business_memberships (business_id,user_id,role,active) VALUES ($1::uuid,$2,\'owner\',true)',
      [business.id,session.user.id],
    );
    await client.query(
      'INSERT INTO inventory_locations (business_id,name,is_default) VALUES ($1::uuid,$2,true)',
      [business.id,'Main location'],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id) VALUES ($1::uuid,$2,$3,$4,$5)',
      [business.id,session.user.id,'business.created','business',business.id],
    );
    await client.query('COMMIT');
    return res.status(201).json({ business: { ...business, role: 'owner' } });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Business workspace could not be saved.' });
  } finally {
    client.release();
  }
}
