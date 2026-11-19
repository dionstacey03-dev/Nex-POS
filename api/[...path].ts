import type { VercelRequest, VercelResponse } from '@vercel/node';
import categories from '../server/api/businesses/[businessId]/categories/index.js';
import category from '../server/api/businesses/[businessId]/categories/[categoryId].js';
import checkout from '../server/api/businesses/[businessId]/checkout.js';
import customers from '../server/api/businesses/[businessId]/customers/index.js';
import customer from '../server/api/businesses/[businessId]/customers/[customerId].js';
import employee from '../server/api/businesses/[businessId]/employees/[userId].js';
import invitations from '../server/api/businesses/[businessId]/invitations.js';
import locations from '../server/api/businesses/[businessId]/locations/index.js';
import location from '../server/api/businesses/[businessId]/locations/[locationId].js';
import products from '../server/api/businesses/[businessId]/products/index.js';
import product from '../server/api/businesses/[businessId]/products/[productId].js';
import stockAdjustments from '../server/api/businesses/[businessId]/products/[productId]/stock-adjustments.js';
import purchaseOrders from '../server/api/businesses/[businessId]/purchase-orders/index.js';
import receivePurchase from '../server/api/businesses/[businessId]/purchase-orders/[purchaseOrderId]/receive.js';
import refundSale from '../server/api/businesses/[businessId]/sales/[saleId]/refund.js';
import settings from '../server/api/businesses/[businessId]/settings.js';
import suppliers from '../server/api/businesses/[businessId]/suppliers/index.js';
import supplier from '../server/api/businesses/[businessId]/suppliers/[supplierId].js';
import workspace from '../server/api/businesses/[businessId]/workspace.js';

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;
type Route = { pattern: string[]; handler: Handler; params: string[] };

const routes: Route[] = [
  { pattern: ['businesses', ':businessId', 'workspace'], handler: workspace, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'settings'], handler: settings, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'checkout'], handler: checkout, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'invitations'], handler: invitations, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'categories'], handler: categories, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'categories', ':categoryId'], handler: category, params: ['businessId', 'categoryId'] },
  { pattern: ['businesses', ':businessId', 'customers'], handler: customers, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'customers', ':customerId'], handler: customer, params: ['businessId', 'customerId'] },
  { pattern: ['businesses', ':businessId', 'employees', ':userId'], handler: employee, params: ['businessId', 'userId'] },
  { pattern: ['businesses', ':businessId', 'locations'], handler: locations, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'locations', ':locationId'], handler: location, params: ['businessId', 'locationId'] },
  { pattern: ['businesses', ':businessId', 'products'], handler: products, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'products', ':productId'], handler: product, params: ['businessId', 'productId'] },
  { pattern: ['businesses', ':businessId', 'products', ':productId', 'stock-adjustments'], handler: stockAdjustments, params: ['businessId', 'productId'] },
  { pattern: ['businesses', ':businessId', 'purchase-orders'], handler: purchaseOrders, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'purchase-orders', ':purchaseOrderId', 'receive'], handler: receivePurchase, params: ['businessId', 'purchaseOrderId'] },
  { pattern: ['businesses', ':businessId', 'sales', ':saleId', 'refund'], handler: refundSale, params: ['businessId', 'saleId'] },
  { pattern: ['businesses', ':businessId', 'suppliers'], handler: suppliers, params: ['businessId'] },
  { pattern: ['businesses', ':businessId', 'suppliers', ':supplierId'], handler: supplier, params: ['businessId', 'supplierId'] },
];

export default async function businessApi(req: VercelRequest, res: VercelResponse) {
  const rawPath = req.query.path;
  const segments = (Array.isArray(rawPath) ? rawPath : typeof rawPath === 'string' ? rawPath.split('/') : [])
    .map((part) => String(part)).filter(Boolean);

  for (const route of routes) {
    if (route.pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matches = true;
    for (let i = 0; i < route.pattern.length; i++) {
      const expected = route.pattern[i];
      if (expected.startsWith(':')) params[expected.slice(1)] = segments[i];
      else if (expected !== segments[i]) { matches = false; break; }
    }
    if (!matches) continue;
    const routedReq = Object.assign(Object.create(req), {
      query: { ...req.query, ...params },
    }) as VercelRequest;
    return route.handler(routedReq, res);
  }

  return res.status(404).json({ error: 'API route not found.' });
}
