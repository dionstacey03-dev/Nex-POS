import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getPool } from '../../../db';
import { requireBusinessRole } from '../../_lib/authz';
import { calculateTaxMinorUnits, formatMinorUnits, parseMoneyToMinorUnits } from '../../_lib/money';

const productLineSchema = z.object({
  kind: z.literal('product'),
  productId: z.string().uuid(),
  quantity: z.number().finite().positive().max(99999).refine((value) => Math.round(value * 1000) > 0),
}).strict();
const customLineSchema = z.object({
  kind: z.literal('custom'),
  name: z.string().trim().min(1).max(140),
  sku: z.string().trim().max(64).optional().default(''),
  unitPrice: z.number().finite().nonnegative().max(100000000),
  quantity: z.number().finite().positive().max(99999).refine((value) => Math.round(value * 1000) > 0),
}).strict();

const payloadSchema = z.object({
  requestId: z.string().trim().min(12).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  items: z.array(z.discriminatedUnion('kind', [productLineSchema, customLineSchema])).min(1).max(100),
  customerId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  discountType: z.enum(['fixed', 'percent']).optional().default('fixed'),
  discountValue: z.number().finite().nonnegative().max(100000000).optional().default(0),
  paymentMethod: z.enum(['cash', 'card', 'other']),
  amountTendered: z.number().finite().nonnegative().optional().default(0),
  paymentReference: z.string().trim().max(100).optional(),
}).strict();

type ProductRow = {
  id: string; name: string; sku: string; selling_price: string;
  purchase_price: string; stock_quantity: string; location_id: string | null;
};

export default async function checkout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const businessId = String(req.query.businessId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    return res.status(400).json({ error: 'Invalid business identifier.' });
  }
  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid checkout request.', issues: parsed.error.issues });

  const actor = await requireBusinessRole(req, res, businessId, ['owner', 'admin', 'manager', 'cashier']);
  if (!actor) return;

  if (actor.role === 'cashier' && (parsed.data.discountValue > 0 || parsed.data.items.some((item) => item.kind === 'custom'))) return res.status(403).json({ error: 'Cashiers cannot apply discounts or create custom-price items.' });
  if (parsed.data.discountType === 'percent' && parsed.data.discountValue > 100) return res.status(400).json({ error: 'Percentage discount cannot exceed 100%.' });
  const requestFingerprint = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [businessId + ':' + parsed.data.requestId]);

    const prior = await client.query(
      'SELECT id, receipt_number, grand_total, currency, status, created_at, request_fingerprint FROM sales WHERE business_id = $1::uuid AND request_id = $2',
      [businessId, parsed.data.requestId],
    );
    if (prior.rowCount) {
      if (prior.rows[0].request_fingerprint !== requestFingerprint) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The checkout request ID was already used for a different transaction.' });
      }
      await client.query('COMMIT');
      return res.status(200).json({ sale: prior.rows[0], alreadyProcessed: true });
    }

    const quantities = new Map<string, number>();
    for (const item of parsed.data.items) {
      if (item.kind !== 'product') continue;
      const quantity = Math.round(item.quantity * 1000) / 1000;
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + quantity);
    }
    const productIds = [...quantities.keys()].sort();
    const productResult = productIds.length ? await client.query<ProductRow>(
      'SELECT id, name, sku, selling_price::text, purchase_price::text, stock_quantity::text, location_id FROM products WHERE business_id = $1::uuid AND id = ANY($2::uuid[]) AND active = true ORDER BY id FOR UPDATE',
      [businessId, productIds],
    ) : { rows: [] as ProductRow[] };
    // Recheck after row locks: concurrent retries wait for the first checkout,
    // then return its result instead of decrementing inventory twice.
    const concurrentPrior = await client.query(
      'SELECT id, receipt_number, grand_total, currency, status, created_at, request_fingerprint FROM sales WHERE business_id = $1::uuid AND request_id = $2',
      [businessId, parsed.data.requestId],
    );
    if (concurrentPrior.rowCount) {
      if (concurrentPrior.rows[0].request_fingerprint !== requestFingerprint) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The checkout request ID was already used for a different transaction.' });
      }
      await client.query('COMMIT');
      return res.status(200).json({ sale: concurrentPrior.rows[0], alreadyProcessed: true });
    }

    if (productResult.rows.length !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'One or more products are unavailable.' });
    }

    const businessResult = await client.query<{ currency: string; tax_rate: string }>(
      'SELECT currency, tax_rate::text FROM businesses WHERE id = $1::uuid',
      [businessId],
    );
    const business = businessResult.rows[0];
    if (!business) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Business not found.' });
    }

    let subtotalMinor = 0;
    const productLineItems = productResult.rows.map((product) => {
      const quantity = quantities.get(product.id)!;
      if (Number(product.stock_quantity) < quantity) throw new Error('INSUFFICIENT_STOCK:' + product.name);
      const unitPriceMinor = parseMoneyToMinorUnits(product.selling_price);
      const unitCostMinor = parseMoneyToMinorUnits(product.purchase_price);
      const lineTotalMinor = Math.round(unitPriceMinor * quantity);
      subtotalMinor += lineTotalMinor;
      return { product, productId: product.id, name: product.name, sku: product.sku, quantity, unitPriceMinor, unitCostMinor, lineTotalMinor, isCustom: false };
    });
    const customLineItems = parsed.data.items.filter((item) => item.kind === 'custom').map((item) => {
      const quantity = Math.round(item.quantity * 1000) / 1000;
      const unitPriceMinor = parseMoneyToMinorUnits(item.unitPrice);
      const lineTotalMinor = Math.round(unitPriceMinor * quantity);
      subtotalMinor += lineTotalMinor;
      return { product: null, productId: null, name: item.name, sku: item.sku, quantity, unitPriceMinor, unitCostMinor: 0, lineTotalMinor, isCustom: true };
    });
    const lineItems = [...productLineItems, ...customLineItems];
    const discountMinor = parsed.data.discountType === 'percent'
      ? Math.round(subtotalMinor * parsed.data.discountValue / 100)
      : parseMoneyToMinorUnits(parsed.data.discountValue);
    if (discountMinor > subtotalMinor) throw new Error('DISCOUNT_EXCEEDS_SUBTOTAL');
    const taxableMinor = subtotalMinor - discountMinor;
    const taxMinor = calculateTaxMinorUnits(taxableMinor, business.tax_rate);
    const totalMinor = taxableMinor + taxMinor;
    const tenderedMinor = parseMoneyToMinorUnits(parsed.data.amountTendered);
    if (parsed.data.paymentMethod === 'cash' && tenderedMinor < totalMinor) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cash tendered is less than the amount due.' });
    }
    if (parsed.data.paymentMethod !== 'cash' && parsed.data.amountTendered > 0) {
      // For non-cash methods, amountTendered is not treated as proof of settlement.
    }

    if (parsed.data.customerId) {
      const customer = await client.query(
        'SELECT id FROM customers WHERE business_id = $1::uuid AND id = $2::uuid FOR KEY SHARE',
        [businessId, parsed.data.customerId],
      );
      if (!customer.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Customer does not belong to this business.' });
      }
    }

    const saleId = crypto.randomUUID();
    const receiptNumber = 'NX-' + new Date().toISOString().slice(0, 10).replaceAll('-', '') + '-' + saleId.slice(0, 8).toUpperCase();
    const saleResult = await client.query(
      `INSERT INTO sales (id,business_id,receipt_number,request_id,request_fingerprint,cashier_user_id,customer_id,location_id,subtotal,discount_amount,discount_type,discount_value,tax_rate,tax_amount,grand_total,currency,payment_method,amount_tendered,change_due,payment_reference,status)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::uuid,$8::uuid,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'completed')
       RETURNING id,receipt_number,grand_total,currency,status,created_at`,
      [saleId,businessId,receiptNumber,parsed.data.requestId,requestFingerprint,actor.userId,parsed.data.customerId ?? null,parsed.data.locationId ?? null,
       formatMinorUnits(subtotalMinor),formatMinorUnits(discountMinor),parsed.data.discountType,parsed.data.discountValue,business.tax_rate,formatMinorUnits(taxMinor),formatMinorUnits(totalMinor),business.currency,
       parsed.data.paymentMethod,formatMinorUnits(tenderedMinor),formatMinorUnits(Math.max(0,tenderedMinor-totalMinor)),parsed.data.paymentReference ?? null],
    );

    for (const line of lineItems) {
      await client.query(
        `INSERT INTO sale_items (business_id,sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total,is_custom)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10)`,
        [businessId,saleId,line.productId,line.name,line.sku,line.quantity,formatMinorUnits(line.unitPriceMinor),formatMinorUnits(line.unitCostMinor),formatMinorUnits(line.lineTotalMinor),line.isCustom],
      );
      await client.query(
        'UPDATE products SET stock_quantity = $1, updated_at = now() WHERE business_id = $2::uuid AND id = $3::uuid',
        [newStock,businessId,line.product.id],
      );
      await client.query(
        `INSERT INTO inventory_movements (business_id,product_id,product_name,location_id,movement_type,quantity_delta,previous_stock,new_stock,reference_type,reference_id,reason,actor_user_id,actor_name)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'sale',$5,$6,$7,'sale',$8::uuid,$9,$10,$11)`,
        [businessId,line.product.id,line.product.name,line.product.location_id,line.quantity * -1,line.product.stock_quantity,newStock,saleId,'POS sale ' + receiptNumber,actor.userId,actor.name],
      );
    }

    await client.query(
      'INSERT INTO audit_logs (business_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)',
      [businessId,actor.userId,'sale.completed','sale',saleId,JSON.stringify({ receiptNumber, itemCount: lineItems.length, customItemCount: customLineItems.length, discount: formatMinorUnits(discountMinor), total: formatMinorUnits(totalMinor) })],
    );
    await client.query('COMMIT');
    return res.status(201).json({ sale: saleResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const message = error instanceof Error ? error.message : '';
    if (message === 'DISCOUNT_EXCEEDS_SUBTOTAL') return res.status(400).json({ error: 'Discount cannot exceed the sale subtotal.' });
    if (message.startsWith('INSUFFICIENT_STOCK:')) return res.status(409).json({ error: 'Insufficient stock for ' + message.slice('INSUFFICIENT_STOCK:'.length) + '.' });
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'This checkout request has already been processed.' });
    return res.status(500).json({ error: 'Checkout could not be completed. No changes were saved.' });
  } finally {
    client.release();
  }
}
