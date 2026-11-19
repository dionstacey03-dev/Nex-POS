import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../auth';
import health from '../api/health';
import businesses from '../api/businesses/index';
import workspace from '../server/api/businesses/[businessId]/workspace';
import checkout from '../server/api/businesses/[businessId]/checkout';
import adjustStock from '../server/api/businesses/[businessId]/products/[productId]/stock-adjustments';
import refundSale from '../server/api/businesses/[businessId]/sales/[saleId]/refund';
import createPurchaseOrder from '../server/api/businesses/[businessId]/purchase-orders/index';
import receivePurchase from '../server/api/businesses/[businessId]/purchase-orders/[purchaseOrderId]/receive';

process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';

const app = express();
const call = (handler: (req: VercelRequest, res: VercelResponse) => unknown) =>
  (req: express.Request, res: express.Response) =>
    Promise.resolve(handler(req as unknown as VercelRequest, res as unknown as VercelResponse)).catch(() => {
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
    });

app.all('/api/auth/*', toNodeHandler(auth));
app.use(express.json({ limit: '256kb' }));
app.all('/api/health', call(health));
app.all('/api/businesses', call(businesses));
app.all('/api/businesses/:businessId/workspace', call(workspace));
app.all('/api/businesses/:businessId/checkout', call(checkout));
app.all('/api/businesses/:businessId/products/:productId/stock-adjustments', call(adjustStock));
app.all('/api/businesses/:businessId/sales/:saleId/refund', call(refundSale));
app.all('/api/businesses/:businessId/purchase-orders', call(createPurchaseOrder));
app.all('/api/businesses/:businessId/purchase-orders/:purchaseOrderId/receive', call(receivePurchase));

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
app.use(vite.middlewares);

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  process.stdout.write('NexPOS V2 development server listening on http://localhost:' + port + '\n');
});
