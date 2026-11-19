import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../../../db/index.js';
import { requireBusinessRole } from '../../../../../api/_lib/authz.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(160).optional(),
  address: z.string().trim().max(300).optional(),
}).strict();

export default async function customers(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  if (!uuid.test(businessId)) return res.status(400).json({ error: 'Invalid business identifier.' });
  const actor = await requireBusinessRole(
    req, res, businessId,
    req.method === 'GET' ? ['owner', 'admin', 'manager', 'cashier'] : ['owner', 'admin', 'manager', 'cashier'],
  );
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    if (req.method === 'GET') {
      const result = await client.query(
        `SELECT id,business_id AS "businessId",name,phone,email,address,
          created_at AS "createdAt",updated_at AS "updatedAt"
         FROM customers WHERE business_id = $1::uuid ORDER BY name LIMIT 1000`,
        [businessId],
      );
      await client.query('COMMIT');
      return res.status(200).json({ customers: result.rows });
    }
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid customer details.', issues: parsed.error.issues });
    }
    const data = parsed.data;
    const inserted = await client.query(
      `INSERT INTO customers (business_id,name,phone,email,address)
       VALUES ($1::uuid,$2,$3,$4,$5)
       RETURNING id,business_id AS "businessId",name,phone,email,address,
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId,data.name,data.phone ?? null,data.email ?? null,data.address ?? null],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'customer.created','customer',inserted.rows[0].id,JSON.stringify({ name: data.name })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ customer: inserted.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'The customer request could not be completed.' });
  } finally {
    client.release();
  }
}
