import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '@/db';
import { requireBusinessRole } from '@/api/_lib/authz';

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  businessType: z.enum(['retail', 'cafe', 'pharmacy', 'apparel', 'electronics', 'general']).optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).email().nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  taxRate: z.number().finite().min(0).max(100).optional(),
  receiptHeader: z.string().trim().max(300).nullable().optional(),
  receiptFooter: z.string().trim().max(300).nullable().optional(),
  lowStockAlertEnabled: z.boolean().optional(),
  lowStockAlertEmail: z.string().trim().max(160).email().nullable().optional(),
  lowStockAlertTime: z.string().trim().max(10).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one business setting to update.',
});

export default async function businessSettings(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) {
    return res.status(400).json({ error: 'Invalid business identifier.' });
  }
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid business settings.', issues: parsed.error.issues });
  }
  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin']);
  if (!actor) return;

  const { name, businessType, currency, taxRate, ...extraSettings } = parsed.data;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const result = await client.query(
      `UPDATE businesses
       SET name = COALESCE($1, name),
           business_type = COALESCE($2, business_type),
           currency = COALESCE($3, currency),
           tax_rate = COALESCE($4, tax_rate),
           settings = settings || $5::jsonb,
           updated_at = now()
       WHERE id = $6::uuid
       RETURNING id,name,business_type AS "businessType",currency,tax_rate::float8 AS "taxRate",
         timezone,settings,updated_at AS "updatedAt"`,
      [name ?? null,businessType ?? null,currency ?? null,taxRate ?? null,JSON.stringify(extraSettings),businessId],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Business not found.' });
    }
    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'business.settings_updated','business',businessId,JSON.stringify({ changedFields: Object.keys(parsed.data) })],
    );
    await client.query('COMMIT');
    return res.status(200).json({ business: result.rows[0] });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Business settings could not be updated.' });
  } finally {
    client.release();
  }
}
