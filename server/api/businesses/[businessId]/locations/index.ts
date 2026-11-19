import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().max(300).optional(),
  isDefault: z.boolean().optional(),
}).strict();

export default async function locations(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  if (!uuid.test(businessId)) return res.status(400).json({ error: 'Invalid business identifier.' });
  const actor = await requireBusinessRole(
    req, res, businessId,
    req.method === 'GET' ? ['owner', 'admin', 'manager', 'cashier'] : ['owner', 'admin', 'manager'],
  );
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    if (req.method === 'GET') {
      const result = await client.query(
        `SELECT id,business_id AS "businessId",name,address,is_default AS "isDefault",
          created_at AS "createdAt",updated_at AS "updatedAt"
         FROM inventory_locations WHERE business_id = $1::uuid
         ORDER BY is_default DESC,name LIMIT 250`,
        [businessId],
      );
      await client.query('COMMIT');
      return res.status(200).json({ locations: result.rows });
    }
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid inventory location details.', issues: parsed.error.issues });
    }
    const data = parsed.data;
    if (data.isDefault) {
      await client.query('UPDATE inventory_locations SET is_default = false,updated_at = now() WHERE business_id = $1::uuid AND is_default = true', [businessId]);
    }
    const inserted = await client.query(
      `INSERT INTO inventory_locations (business_id,name,address,is_default)
       VALUES ($1::uuid,$2,$3,$4)
       RETURNING id,business_id AS "businessId",name,address,is_default AS "isDefault",
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [businessId,data.name,data.address ?? null,data.isDefault ?? false],
    );
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'location.created','inventory_location',inserted.rows[0].id,JSON.stringify({ name: data.name, isDefault: data.isDefault ?? false })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ location: inserted.rows[0] });
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
