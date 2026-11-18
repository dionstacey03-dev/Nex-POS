import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPool } from '../../../db';
import { requireBusinessRole } from '../../_lib/authz';

export default async function workspace(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const businessId = String(req.query.businessId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return res.status(400).json({ error: 'Invalid business identifier.' });
  const actor = await requireBusinessRole(req, res, businessId, ['owner','admin','manager','cashier']);
  if (!actor) return;

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [actor.userId]);

    const [business,categories,locations,products,customers,suppliers,employees,sales,movements,purchases] = await Promise.all([
      client.query(
        `SELECT id,name,business_type AS "businessType",owner_user_id AS "ownerUid",currency,
          tax_rate::float8 AS "taxRate",timezone,settings,created_at AS "createdAt",updated_at AS "updatedAt"
         FROM businesses WHERE id = $1::uuid`,[businessId]),
      client.query(
        `SELECT id,business_id AS "businessId",name,description,color,active,sort_order AS "sortOrder",
          created_at AS "createdAt",updated_at AS "updatedAt"
         FROM categories WHERE business_id = $1::uuid ORDER BY sort_order,name LIMIT 500`,[businessId]),
      client.query(
        `SELECT id,business_id AS "businessId",name,address,is_default AS "isDefault",
          created_at AS "createdAt",updated_at AS "updatedAt"
         FROM inventory_locations WHERE business_id = $1::uuid ORDER BY is_default DESC,name LIMIT 100`,[businessId]),
      client.query(
        `SELECT id,business_id AS "businessId",category_id AS "categoryId",location_id AS "locationId",
          name,description,sku,barcode,purchase_price::float8 AS "purchasePrice",
          selling_price::float8 AS "sellingPrice",stock_quantity::float8 AS "stockQuantity",
          min_stock_level::float8 AS "minStockLevel",image_url AS "imageUrl",active,
          created_at AS "createdAt",updated_at AS "updatedAt"
         FROM products WHERE business_id = $1::uuid ORDER BY name LIMIT 1000`,[businessId]),
      client.query(
        `SELECT c.id,c.business_id AS "businessId",c.name,c.phone,c.email,c.address,
          COALESCE(a.total_spent,0)::float8 AS "totalSpent",COALESCE(a.orders_count,0)::int AS "ordersCount",
          a.last_purchase_at AS "lastPurchaseAt",c.created_at AS "createdAt",c.updated_at AS "updatedAt"
         FROM customers c LEFT JOIN (
           SELECT customer_id,SUM(grand_total) FILTER (WHERE status = 'completed') AS total_spent,
             COUNT(*) FILTER (WHERE status = 'completed') AS orders_count,
             MAX(created_at) FILTER (WHERE status = 'completed') AS last_purchase_at
           FROM sales WHERE business_id = $1::uuid AND customer_id IS NOT NULL GROUP BY customer_id
         ) a ON a.customer_id = c.id
         WHERE c.business_id = $1::uuid ORDER BY c.name LIMIT 1000`,[businessId]),
      client.query(
        `SELECT id,business_id AS "businessId",company_name AS "companyName",contact_person AS "contactPerson",
          phone,email,address,created_at AS "createdAt",updated_at AS "updatedAt"
         FROM suppliers WHERE business_id = $1::uuid ORDER BY company_name LIMIT 500`,[businessId]),
      client.query(
        `SELECT m.user_id AS uid,m.business_id AS "businessId",u.name,u.email,m.role,
          CASE WHEN m.active THEN 'active' ELSE 'inactive' END AS status,
          m.created_at AS "createdAt",m.updated_at AS "updatedAt"
         FROM business_memberships m JOIN "user" u ON u.id = m.user_id
         WHERE m.business_id = $1::uuid ORDER BY u.name LIMIT 500`,[businessId]),
      client.query(
        `SELECT s.id,s.business_id AS "businessId",s.receipt_number AS "receiptNumber",
          s.cashier_user_id AS "cashierUid",u.name AS "cashierName",s.customer_id AS "customerId",
          c.name AS "customerName",s.location_id AS "locationId",s.subtotal::float8,
          s.discount_amount::float8 AS "discountAmount",s.discount_type AS "discountType",s.discount_value::float8 AS "discountValue",s.tax_rate::float8 AS "taxRate",
          s.tax_amount::float8 AS "taxAmount",s.grand_total::float8 AS "grandTotal",
          s.currency,s.payment_method AS "paymentMethod",s.amount_tendered::float8 AS "amountTendered",
          s.change_due::float8 AS "changeDue",s.payment_reference AS "paymentReference",s.status,
          s.created_at AS "createdAt",
          COALESCE(json_agg(json_build_object('productId',si.product_id,'name',si.product_name,'sku',si.sku,
            'quantity',si.quantity,'unitPrice',si.unit_price,'costPrice',si.unit_cost,'lineTotal',si.line_total,
            'isCustom',si.is_custom)) FILTER (WHERE si.id IS NOT NULL),'[]'::json) AS items
         FROM sales s LEFT JOIN sale_items si ON si.business_id=s.business_id AND si.sale_id=s.id
         LEFT JOIN "user" u ON u.id=s.cashier_user_id LEFT JOIN customers c ON c.id=s.customer_id AND c.business_id=s.business_id
         WHERE s.business_id=$1::uuid GROUP BY s.id,u.name,c.name ORDER BY s.created_at DESC LIMIT 200`,[businessId]),
      client.query(
        `SELECT id,business_id AS "businessId",product_id AS "productId",location_id AS "locationId",
          product_name AS "productName",movement_type AS type,quantity_delta::float8 AS "quantityDelta",previous_stock::float8 AS "previousStock",
          new_stock::float8 AS "newStock",reference_type AS "referenceType",reference_id AS "referenceId",
          reason,actor_user_id AS "actorUid",actor_name AS "actorName",created_at AS "createdAt"
         FROM inventory_movements WHERE business_id=$1::uuid ORDER BY created_at DESC LIMIT 500`,[businessId]),
      client.query(
        `SELECT p.id,p.business_id AS "businessId",p.purchase_number AS "purchaseNumber",
          p.supplier_id AS "supplierId",s.company_name AS "supplierName",p.location_id AS "locationId",
          p.status,p.total_cost::float8 AS "totalCost",p.created_by_user_id AS "createdByUid",
          p.created_at AS "createdAt",p.updated_at AS "updatedAt",
          COALESCE(json_agg(json_build_object('id',pi.id,'productId',pi.product_id,'productName',pi.product_name,'sku',pi.sku,
            'quantity',pi.quantity_ordered,'quantityReceived',pi.quantity_received,
            'unitCost',pi.unit_cost,'lineTotal',pi.quantity_ordered * pi.unit_cost)) FILTER (WHERE pi.id IS NOT NULL),'[]'::json) AS items
         FROM purchase_orders p JOIN suppliers s ON s.business_id=p.business_id AND s.id=p.supplier_id
         LEFT JOIN purchase_order_items pi ON pi.business_id=p.business_id AND pi.purchase_order_id=p.id
         WHERE p.business_id=$1::uuid GROUP BY p.id,s.company_name ORDER BY p.created_at DESC LIMIT 200`,[businessId]),
    ]);

    if (!business.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Business not found.' });
    }
    await client.query('COMMIT');
    return res.status(200).json({
      business: business.rows[0], categories: categories.rows, locations: locations.rows,
      products: products.rows, customers: customers.rows, suppliers: suppliers.rows,
      employees: employees.rows, sales: sales.rows, stockMovements: movements.rows,
      purchases: purchases.rows, limits: { products: 1000, customers: 1000, sales: 200, stockMovements: 500, purchases: 200 },
    });
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return res.status(500).json({ error: 'Workspace data could not be loaded.' });
  } finally {
    client.release();
  }
}
