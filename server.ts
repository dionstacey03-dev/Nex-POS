import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createVerify } from 'node:crypto';
import firebaseConfig from './firebase-applet-config.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lightweight per-instance abuse protection for the metered AI endpoint.
// For multi-instance production deployments, also configure an edge/API
// gateway quota because this in-memory limiter is intentionally not distributed.
const forecastRateLimits = new Map<string, { count: number; resetAt: number }>();
const FORECAST_RATE_WINDOW_MS = 60_000;
const FORECAST_RATE_LIMIT = 12;

interface SkuForecastInput {
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  currentStock: number;
  minStockLevel: number;
  incomingPoQty: number;
  purchasePrice: number;
  sellingPrice: number;
  unitsSold7d: number;
  unitsSold14d: number;
  unitsSold30d: number;
  dailyVelocity7d: number;
  dailyVelocity14d: number;
  dailyVelocity30d: number;
  trendDirection: 'accelerating' | 'steady' | 'slowing' | 'idle';
  baselineDaysRemaining: number | null;
}

interface ForecastRequestBody {
  businessId?: string;
  businessName?: string;
  businessType?: string;
  currency?: string;
  todayIso?: string;
  leadTimeDays?: number;
  safetyBufferDays?: number;
  targetCoverageDays?: number;
  skuMetrics?: SkuForecastInput[];
}

interface RawAiSuggestion {
  productId: string;
  urgency: 'critical' | 'high' | 'moderate' | 'watch';
  recommendedReorderDate: string;
  optimalOrderQty: number;
  estimatedDaysUntilStockout: number;
  projectedCoverageDays: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

interface RawAiForecastPayload {
  portfolioSummary: string;
  demandHighlights: string[];
  suggestions: RawAiSuggestion[];
}

let firebaseCertCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebaseSigningCertificates(): Promise<Record<string, string>> {
  if (firebaseCertCache && firebaseCertCache.expiresAt > Date.now()) {
    return firebaseCertCache.certs;
  }

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw Object.assign(new Error('Unable to retrieve Firebase signing certificates.'), {
      statusCode: 503,
    });
  }

  const certs = (await response.json()) as Record<string, string>;
  const maxAge = response.headers.get('cache-control')?.match(/max-age=(\\d+)/i);
  const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;
  firebaseCertCache = { certs, expiresAt: Date.now() + Math.max(60_000, ttlMs) };
  return certs;
}

interface FirebaseTokenClaims {
  aud: string;
  iss: string;
  sub: string;
  exp: number;
  iat: number;
  auth_time: number;
}

async function verifyFirebaseIdToken(token: string): Promise<FirebaseTokenClaims> {
  const parts = token.split('.');
  if (parts.length !== 3 || !firebaseConfig?.projectId) {
    throw new Error('Invalid Firebase authentication token.');
  }

  let header: { alg?: string; kid?: string };
  let claims: FirebaseTokenClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Firebase authentication token.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase authentication token.');
  }

  const certs = await getFirebaseSigningCertificates();
  const certificate = certs[header.kid];
  if (!certificate) throw new Error('Unknown Firebase signing key.');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (!verifier.verify(certificate, Buffer.from(parts[2], 'base64url'))) {
    throw new Error('Invalid Firebase authentication signature.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.aud !== firebaseConfig.projectId ||
    claims.iss !== `https://securetoken.google.com/${firebaseConfig.projectId}` ||
    typeof claims.sub !== 'string' ||
    claims.sub.length === 0 ||
    claims.sub.length > 128 ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    !Number.isFinite(claims.iat) ||
    claims.iat > now + 60 ||
    !Number.isFinite(claims.auth_time) ||
    claims.auth_time > now + 60
  ) {
    throw new Error('Firebase authentication token is expired or invalid for this project.');
  }

  return claims;
}

async function isActiveBusinessMember(
  businessId: string,
  uid: string,
  token: string
): Promise<boolean> {
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const documentUrl =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents/businesses/${encodeURIComponent(businessId)}` +
    `/employees/${encodeURIComponent(uid)}`;

  const response = await fetch(documentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404 || response.status === 403) return false;
  if (!response.ok) {
    throw Object.assign(new Error('Unable to verify business membership with Firestore.'), {
      statusCode: 503,
    });
  }

  const employee = (await response.json()) as {
    fields?: { status?: { stringValue?: string } };
  };
  return employee.fields?.status?.stringValue === 'active';
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw Object.assign(
      new Error('GEMINI_API_KEY is not configured on the server environment.'),
      { statusCode: 503 }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

function sanitizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, num));
}

function extractHttpStatus(err: unknown): { status: number; message: string } {
  const anyErr = err as { statusCode?: number; status?: number; message?: string };
  const rawMessage = anyErr?.message || 'Unexpected error while generating AI stock forecast.';
  const explicitStatus = anyErr?.statusCode ?? anyErr?.status;

  if (explicitStatus && explicitStatus >= 400 && explicitStatus < 600) {
    return { status: explicitStatus, message: rawMessage };
  }
  if (/429|quota|rate limit/i.test(rawMessage)) {
    return { status: 429, message: 'AI forecast rate limit reached. Please try again in a moment.' };
  }
  if (/401|403|api key|permission/i.test(rawMessage)) {
    return { status: 403, message: 'Server Gemini API key is invalid or lacks permissions.' };
  }
  if (/404|not found/i.test(rawMessage)) {
    return { status: 502, message: 'Configured Gemini forecasting model was unavailable.' };
  }
  return { status: 500, message: rawMessage };
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.post('/api/ai/stock-forecast', async (req: Request, res: Response) => {
    const now = Date.now();
    const rateKey = req.ip || req.socket.remoteAddress || 'unknown';
    const rateState = forecastRateLimits.get(rateKey);
    if (!rateState || rateState.resetAt <= now) {
      forecastRateLimits.set(rateKey, { count: 1, resetAt: now + FORECAST_RATE_WINDOW_MS });
    } else if (rateState.count >= FORECAST_RATE_LIMIT) {
      res.setHeader('Retry-After', String(Math.ceil((rateState.resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many AI forecast requests. Please try again shortly.' });
      return;
    } else {
      rateState.count += 1;
    }

    // Bound the limiter's memory use on long-lived server instances.
    if (forecastRateLimits.size > 10_000) {
      for (const [key, value] of forecastRateLimits) {
        if (value.resetAt <= now) forecastRateLimits.delete(key);
      }
    }

    try {
      const body = (req.body ?? {}) as ForecastRequestBody;
      const businessId =
        typeof body.businessId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(body.businessId)
          ? body.businessId
          : '';
      const authorization = req.get('authorization') ?? '';
      const tokenMatch = authorization.match(/^Bearer\\s+(.+)$/i);
      if (!businessId || !tokenMatch) {
        res.status(401).json({ error: 'Sign in to a business workspace to use AI forecasting.' });
        return;
      }

      let tokenClaims: FirebaseTokenClaims;
      try {
        tokenClaims = await verifyFirebaseIdToken(tokenMatch[1]);
      } catch {
        res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
        return;
      }

      let isMember = false;
      try {
        isMember = await isActiveBusinessMember(businessId, tokenClaims.sub, tokenMatch[1]);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 503;
        res.status(status).json({ error: 'Unable to verify your business access right now.' });
        return;
      }
      if (!isMember) {
        res.status(403).json({ error: 'You are not an active member of this business workspace.' });
        return;
      }

      const rawMetrics = Array.isArray(body.skuMetrics) ? body.skuMetrics : [];
      if (rawMetrics.length > 40) {
        res.status(400).json({ error: 'A maximum of 40 products can be forecast at once.' });
        return;
      }
      if (rawMetrics.some((item) => !item || typeof item !== 'object')) {
        res.status(400).json({ error: 'The product metrics payload is invalid.' });
        return;
      }
      if (rawMetrics.some((item) => typeof item.productId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.productId))) {
        res.status(400).json({ error: 'Each product must include a valid product ID.' });
        return;
      }
      const skuMetrics: SkuForecastInput[] = rawMetrics.map((item) => ({
        productId: item.productId,
        name: String(item.name ?? 'Unnamed product').slice(0, 140),
        sku: String(item.sku ?? '').slice(0, 64),
        categoryName: String(item.categoryName ?? 'General').slice(0, 80),
        currentStock: sanitizeNumber(item.currentStock, 0, 0, 10_000_000),
        minStockLevel: sanitizeNumber(item.minStockLevel, 0, 0, 10_000_000),
        incomingPoQty: sanitizeNumber(item.incomingPoQty, 0, 0, 10_000_000),
        purchasePrice: sanitizeNumber(item.purchasePrice, 0, 0, 1_000_000_000),
        sellingPrice: sanitizeNumber(item.sellingPrice, 0, 0, 1_000_000_000),
        unitsSold7d: sanitizeNumber(item.unitsSold7d, 0, 0, 10_000_000),
        unitsSold14d: sanitizeNumber(item.unitsSold14d, 0, 0, 10_000_000),
        unitsSold30d: sanitizeNumber(item.unitsSold30d, 0, 0, 10_000_000),
        dailyVelocity7d: sanitizeNumber(item.dailyVelocity7d, 0, 0, 10_000_000),
        dailyVelocity14d: sanitizeNumber(item.dailyVelocity14d, 0, 0, 10_000_000),
        dailyVelocity30d: sanitizeNumber(item.dailyVelocity30d, 0, 0, 10_000_000),
        trendDirection:
          item.trendDirection === 'accelerating' ||
          item.trendDirection === 'steady' ||
          item.trendDirection === 'slowing' ||
          item.trendDirection === 'idle'
            ? item.trendDirection
            : 'steady',
        baselineDaysRemaining:
          item.baselineDaysRemaining === null
            ? null
            : sanitizeNumber(item.baselineDaysRemaining, 0, 0, 3650),
      }));

      if (skuMetrics.length === 0) {
        res.status(400).json({
          error: 'At least one active SKU metric is required to generate an AI stock forecast.',
        });
        return;
      }

      const leadTimeDays = sanitizeNumber(body.leadTimeDays, 5, 0, 90);
      const safetyBufferDays = sanitizeNumber(body.safetyBufferDays, 7, 0, 60);
      const targetCoverageDays = sanitizeNumber(body.targetCoverageDays, 30, 7, 180);
      const todayIso =
        typeof body.todayIso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.todayIso)
          ? body.todayIso.slice(0, 10)
          : new Date().toISOString().slice(0, 10);

      const ai = getAiClient();

      const promptContext = {
        businessName: body.businessName || 'NexPOS Store',
        businessType: body.businessType || 'retail',
        currency: typeof body.currency === 'string' ? body.currency.slice(0, 10) : 'LKR',
        todayDate: todayIso,
        planningParameters: {
          supplierLeadTimeDays: leadTimeDays,
          safetyBufferDays,
          targetPostDeliveryCoverageDays: targetCoverageDays,
        },
        skus: skuMetrics.map((item) => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          category: item.categoryName,
          onHand: item.currentStock,
          minStockLevel: item.minStockLevel,
          incomingOpenPoQty: item.incomingPoQty,
          unitCost: item.purchasePrice,
          sellingPrice: item.sellingPrice,
          unitsSoldLast7d: item.unitsSold7d,
          unitsSoldLast14d: item.unitsSold14d,
          unitsSoldLast30d: item.unitsSold30d,
          velocityPerDay7d: item.dailyVelocity7d,
          velocityPerDay14d: item.dailyVelocity14d,
          velocityPerDay30d: item.dailyVelocity30d,
          trendDirection: item.trendDirection,
          baselineDaysRemainingWithIncoming: item.baselineDaysRemaining,
        })),
      };

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Analyze this inventory and multi-window historical POS sales velocity snapshot, then produce actionable restock suggestions ordered by urgency.\n\nDATA:\n${JSON.stringify(promptContext)}`,
              },
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: [
            'You are a senior retail inventory planning and demand-forecasting specialist for NexPOS.',
            'Evaluate multi-window sales velocity (7d vs 14d vs 30d) to detect accelerating or slowing demand, current on-hand stock, incoming open PO quantities, minimum stock thresholds, supplier lead time, and safety buffer.',
            'Rules:',
            '1. Only emit productId values that exist verbatim in the input skus array.',
            '2. Focus suggestions on SKUs that need restocking now, within the next 21 days, are below minStockLevel, or have accelerating velocity that puts stock at risk. Include up to 10 highest-priority SKUs.',
            '3. Factor in incomingOpenPoQty so you do NOT recommend double-ordering stock already covered by an open Purchase Order.',
            '4. recommendedReorderDate must be "Immediate" if effective stock is already at/below reorder point or will breach leadTime+safetyBuffer within 1 day, otherwise provide an ISO date string YYYY-MM-DD >= todayDate.',
            '5. optimalOrderQty must be a positive integer >= 1 calibrated to cover (supplierLeadTimeDays + targetPostDeliveryCoverageDays) minus effective stock, adjusted up slightly for accelerating demand or conservatively for slow/idle SKUs.',
            '6. reasoning must be 1 concise, plain-language sentence citing concrete numbers (e.g., 7d vs 30d pace, current stock, or incoming PO). Do not invent facts.',
          ].join('\n'),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              portfolioSummary: {
                type: Type.STRING,
                description:
                  '2-sentence executive summary of overall stock risk, velocity shifts, and replenishment priority.',
              },
              demandHighlights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Up to 3 concise key demand/velocity takeaways across the catalog.',
              },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    urgency: {
                      type: Type.STRING,
                      enum: ['critical', 'high', 'moderate', 'watch'],
                    },
                    recommendedReorderDate: {
                      type: Type.STRING,
                      description: '"Immediate" or YYYY-MM-DD',
                    },
                    optimalOrderQty: { type: Type.INTEGER },
                    estimatedDaysUntilStockout: { type: Type.NUMBER },
                    projectedCoverageDays: { type: Type.INTEGER },
                    confidence: {
                      type: Type.STRING,
                      enum: ['high', 'medium', 'low'],
                    },
                    reasoning: { type: Type.STRING },
                  },
                  required: [
                    'productId',
                    'urgency',
                    'recommendedReorderDate',
                    'optimalOrderQty',
                    'estimatedDaysUntilStockout',
                    'projectedCoverageDays',
                    'confidence',
                    'reasoning',
                  ],
                },
              },
            },
            required: ['portfolioSummary', 'demandHighlights', 'suggestions'],
          },
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error('Gemini returned an empty forecast response.');
      }

      const parsed = JSON.parse(rawText) as RawAiForecastPayload;
      const validIds = new Set(skuMetrics.map((m) => m.productId));
      const seenIds = new Set<string>();

      const validSuggestions: RawAiSuggestion[] = (Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : []
      )
        .filter((s) => {
          if (!s || typeof s.productId !== 'string' || !validIds.has(s.productId)) return false;
          if (seenIds.has(s.productId)) return false;
          seenIds.add(s.productId);
          return true;
        })
        .map((s) => {
          const validUrgency =
            s.urgency === 'critical' ||
            s.urgency === 'high' ||
            s.urgency === 'moderate' ||
            s.urgency === 'watch'
              ? s.urgency
              : 'moderate';
          const validConfidence =
            s.confidence === 'high' || s.confidence === 'medium' || s.confidence === 'low'
              ? s.confidence
              : 'medium';

          const dateRaw =
            typeof s.recommendedReorderDate === 'string' ? s.recommendedReorderDate.trim() : '';
          const recommendedReorderDate =
            /^immediate$/i.test(dateRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
              ? /^immediate$/i.test(dateRaw)
                ? 'Immediate'
                : todayIso
              : dateRaw;

          return {
            productId: s.productId,
            urgency: validUrgency,
            recommendedReorderDate,
            optimalOrderQty: Math.round(sanitizeNumber(s.optimalOrderQty, 1, 1, 100000)),
            estimatedDaysUntilStockout:
              Math.round(sanitizeNumber(s.estimatedDaysUntilStockout, 0, 0, 3650) * 10) / 10,
            projectedCoverageDays: Math.round(
              sanitizeNumber(s.projectedCoverageDays, targetCoverageDays, 1, 365)
            ),
            confidence: validConfidence,
            reasoning:
              typeof s.reasoning === 'string' && s.reasoning.trim().length > 0
                ? s.reasoning.trim().slice(0, 320)
                : 'Recommended based on recent sales velocity and safety buffer.',
          };
        });

      res.json({
        generatedAt: new Date().toISOString(),
        model: 'gemini-4-hydrogen',
        portfolioSummary:
          typeof parsed.portfolioSummary === 'string' && parsed.portfolioSummary.trim()
            ? parsed.portfolioSummary.trim()
            : 'Forecast generated from recent multi-window sales velocity and current inventory levels.',
        demandHighlights: Array.isArray(parsed.demandHighlights)
          ? parsed.demandHighlights
              .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
              .slice(0, 3)
          : [],
        suggestions: validSuggestions,
      });
    } catch (err) {
      const { status, message } = extractHttpStatus(err);
      console.error('[NexPOS AI Forecast Error]', err);
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use(async (req: Request, res: Response, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const indexPath = path.resolve(__dirname, 'index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`NexPOS server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NexPOS server:', err);
  process.exit(1);
});
