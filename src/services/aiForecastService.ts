import { Category, Product, PurchaseOrder, Sale } from '../types/nexpos';
import { auth } from '../lib/firebase';
import { roundMoney } from '../utils/currency';
import { calculateInventoryProjections } from '../utils/inventoryProjection';

export type ForecastTrendDirection = 'accelerating' | 'steady' | 'slowing' | 'idle';
export type ForecastUrgency = 'critical' | 'high' | 'moderate' | 'watch';
export type ForecastConfidence = 'high' | 'medium' | 'low';

export interface SkuVelocitySnapshot {
  product: Product;
  categoryName: string;
  incomingPoQty: number;
  unitsSold7d: number;
  unitsSold14d: number;
  unitsSold30d: number;
  dailyVelocity7d: number;
  dailyVelocity14d: number;
  dailyVelocity30d: number;
  trendDirection: ForecastTrendDirection;
  velocityDeltaPct: number | null;
  baselineDaysRemaining: number | null;
}

export interface AiRestockSuggestion {
  product: Product;
  snapshot: SkuVelocitySnapshot;
  urgency: ForecastUrgency;
  recommendedReorderDate: string;
  optimalOrderQty: number;
  estimatedPoCost: number;
  estimatedDaysUntilStockout: number;
  projectedCoverageDays: number;
  confidence: ForecastConfidence;
  reasoning: string;
}

export interface AiStockForecastResult {
  generatedAt: string;
  model: string;
  dataSignature: string;
  leadTimeDays: number;
  portfolioSummary: string;
  demandHighlights: string[];
  suggestions: AiRestockSuggestion[];
}

export interface RequestAiForecastParams {
  businessId: string;
  businessName: string;
  businessType: string;
  currency: string;
  products: Product[];
  categories: Category[];
  sales: Sale[];
  purchases: PurchaseOrder[];
  leadTimeDays: number;
  safetyBufferDays?: number;
  targetCoverageDays?: number;
  signal?: AbortSignal;
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildForecastDataSignature(params: {
  businessId: string;
  products: Product[];
  sales: Sale[];
  purchases: PurchaseOrder[];
  leadTimeDays: number;
}): string {
  const activeProducts = params.products.filter((p) => p.active);
  const stockSum = activeProducts.reduce((sum, p) => sum + p.stockQuantity + p.minStockLevel, 0);
  const completedSales = params.sales.filter((s) => s.status === 'completed');
  const openPos = params.purchases.filter((po) => po.status === 'ordered');
  const openPoUnits = openPos.reduce(
    (sum, po) => sum + po.items.reduce((iSum, item) => iSum + item.quantity, 0),
    0
  );
  const latestSaleAt = completedSales[0]?.createdAt ?? '';

  return [
    params.businessId,
    activeProducts.length,
    stockSum,
    completedSales.length,
    latestSaleAt,
    openPos.length,
    openPoUnits,
    params.leadTimeDays,
  ].join('|');
}

export function buildMultiWindowSnapshots(params: {
  products: Product[];
  categories: Category[];
  sales: Sale[];
  purchases: PurchaseOrder[];
  leadTimeDays: number;
  safetyBufferDays: number;
  targetCoverageDays: number;
  now?: Date;
}): SkuVelocitySnapshot[] {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const msDay = 24 * 60 * 60 * 1000;
  const cut7 = nowMs - 7 * msDay;
  const cut14 = nowMs - 14 * msDay;
  const cut30 = nowMs - 30 * msDay;

  const categoryMap = new Map<string, string>();
  for (const c of params.categories) {
    categoryMap.set(c.id, c.name);
  }

  const sold7 = new Map<string, number>();
  const sold14 = new Map<string, number>();
  const sold30 = new Map<string, number>();

  for (const sale of params.sales) {
    if (sale.status !== 'completed') continue;
    const saleMs = Date.parse(sale.createdAt);
    if (!Number.isFinite(saleMs) || saleMs > nowMs || saleMs < cut30) continue;

    for (const item of sale.items) {
      if (item.isCustom) continue;
      const qty = Math.max(0, item.quantity);
      sold30.set(item.productId, (sold30.get(item.productId) ?? 0) + qty);
      if (saleMs >= cut14) {
        sold14.set(item.productId, (sold14.get(item.productId) ?? 0) + qty);
      }
      if (saleMs >= cut7) {
        sold7.set(item.productId, (sold7.get(item.productId) ?? 0) + qty);
      }
    }
  }

  const { projections } = calculateInventoryProjections(
    params.products,
    params.sales,
    params.purchases,
    {
      lookbackDays: 14,
      leadTimeDays: params.leadTimeDays,
      safetyBufferDays: params.safetyBufferDays,
      targetCoverageDays: params.targetCoverageDays,
      now,
    }
  );

  const projById = new Map(projections.map((p) => [p.product.id, p]));

  const snapshots: SkuVelocitySnapshot[] = params.products
    .filter((p) => p.active)
    .map((product) => {
      const unitsSold7d = sold7.get(product.id) ?? 0;
      const unitsSold14d = sold14.get(product.id) ?? 0;
      const unitsSold30d = sold30.get(product.id) ?? 0;

      const dailyVelocity7d = roundRate(unitsSold7d / 7);
      const dailyVelocity14d = roundRate(unitsSold14d / 14);
      const dailyVelocity30d = roundRate(unitsSold30d / 30);

      let trendDirection: ForecastTrendDirection = 'idle';
      let velocityDeltaPct: number | null = null;

      if (unitsSold30d === 0 && unitsSold7d === 0) {
        trendDirection = 'idle';
      } else if (dailyVelocity30d === 0 && dailyVelocity7d > 0) {
        trendDirection = 'accelerating';
        velocityDeltaPct = 100;
      } else if (dailyVelocity30d > 0) {
        const delta = ((dailyVelocity7d - dailyVelocity30d) / dailyVelocity30d) * 100;
        velocityDeltaPct = Math.round(delta);
        if (delta >= 15) trendDirection = 'accelerating';
        else if (delta <= -15) trendDirection = 'slowing';
        else trendDirection = 'steady';
      }

      const baseline = projById.get(product.id);

      return {
        product,
        categoryName: categoryMap.get(product.categoryId) ?? 'General',
        incomingPoQty: baseline?.incomingPoQty ?? 0,
        unitsSold7d,
        unitsSold14d,
        unitsSold30d,
        dailyVelocity7d,
        dailyVelocity14d,
        dailyVelocity30d,
        trendDirection,
        velocityDeltaPct,
        baselineDaysRemaining: baseline?.daysRemainingTotal ?? null,
      };
    });

  // Prioritize active risk & moving SKUs so the prompt stays compact and high-signal
  snapshots.sort((a, b) => {
    const aRisk = a.product.stockQuantity <= a.product.minStockLevel ? 1 : 0;
    const bRisk = b.product.stockQuantity <= b.product.minStockLevel ? 1 : 0;
    if (aRisk !== bRisk) return bRisk - aRisk;

    const aDays = a.baselineDaysRemaining ?? 9999;
    const bDays = b.baselineDaysRemaining ?? 9999;
    if (aDays !== bDays) return aDays - bDays;

    return b.unitsSold30d - a.unitsSold30d;
  });

  return snapshots;
}

export async function fetchAiStockForecast(
  params: RequestAiForecastParams
): Promise<AiStockForecastResult> {
  const safetyBufferDays = params.safetyBufferDays ?? 7;
  const targetCoverageDays = params.targetCoverageDays ?? 30;
  const now = new Date();

  const snapshots = buildMultiWindowSnapshots({
    products: params.products,
    categories: params.categories,
    sales: params.sales,
    purchases: params.purchases,
    leadTimeDays: params.leadTimeDays,
    safetyBufferDays,
    targetCoverageDays,
    now,
  });

  if (snapshots.length === 0) {
    return {
      generatedAt: now.toISOString(),
      model: 'gemini-4-hydrogen',
      dataSignature: buildForecastDataSignature(params),
      leadTimeDays: params.leadTimeDays,
      portfolioSummary:
        'Add active products to your catalog to generate AI-powered restock recommendations.',
      demandHighlights: [],
      suggestions: [],
    };
  }

  const topSnapshots = snapshots.slice(0, 40);
  const snapshotById = new Map(topSnapshots.map((s) => [s.product.id, s]));

  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('Sign in to your Firebase business workspace to use AI forecasting.');
  }
  const idToken = await currentUser.getIdToken();

  const response = await fetch('/api/ai/stock-forecast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    signal: params.signal,
    body: JSON.stringify({
      businessId: params.businessId,
      businessName: params.businessName,
      businessType: params.businessType,
      currency: params.currency,
      todayIso: now.toISOString().slice(0, 10),
      leadTimeDays: params.leadTimeDays,
      safetyBufferDays,
      targetCoverageDays,
      skuMetrics: topSnapshots.map((s) => ({
        productId: s.product.id,
        name: s.product.name,
        sku: s.product.sku,
        categoryName: s.categoryName,
        currentStock: s.product.stockQuantity,
        minStockLevel: s.product.minStockLevel,
        incomingPoQty: s.incomingPoQty,
        purchasePrice: s.product.purchasePrice,
        sellingPrice: s.product.sellingPrice,
        unitsSold7d: s.unitsSold7d,
        unitsSold14d: s.unitsSold14d,
        unitsSold30d: s.unitsSold30d,
        dailyVelocity7d: s.dailyVelocity7d,
        dailyVelocity14d: s.dailyVelocity14d,
        dailyVelocity30d: s.dailyVelocity30d,
        trendDirection: s.trendDirection,
        baselineDaysRemaining: s.baselineDaysRemaining,
      })),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    generatedAt?: string;
    model?: string;
    portfolioSummary?: string;
    demandHighlights?: string[];
    suggestions?: Array<{
      productId: string;
      urgency: ForecastUrgency;
      recommendedReorderDate: string;
      optimalOrderQty: number;
      estimatedDaysUntilStockout: number;
      projectedCoverageDays: number;
      confidence: ForecastConfidence;
      reasoning: string;
    }>;
  };

  if (!response.ok) {
    throw new Error(payload.error || `AI forecast request failed (HTTP ${response.status}).`);
  }

  const urgencyRank: Record<ForecastUrgency, number> = {
    critical: 0,
    high: 1,
    moderate: 2,
    watch: 3,
  };

  const enrichedSuggestions: AiRestockSuggestion[] = (payload.suggestions ?? [])
    .map((item) => {
      const snap = snapshotById.get(item.productId);
      if (!snap) return null;
      const qty = Math.max(1, Math.round(item.optimalOrderQty));
      return {
        product: snap.product,
        snapshot: snap,
        urgency: item.urgency,
        recommendedReorderDate: item.recommendedReorderDate,
        optimalOrderQty: qty,
        estimatedPoCost: roundMoney(qty * snap.product.purchasePrice),
        estimatedDaysUntilStockout: item.estimatedDaysUntilStockout,
        projectedCoverageDays: item.projectedCoverageDays,
        confidence: item.confidence,
        reasoning: item.reasoning,
      };
    })
    .filter((item): item is AiRestockSuggestion => item !== null)
    .sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]);

  return {
    generatedAt: payload.generatedAt || now.toISOString(),
    model: payload.model || 'gemini-4-hydrogen',
    dataSignature: buildForecastDataSignature(params),
    leadTimeDays: params.leadTimeDays,
    portfolioSummary: payload.portfolioSummary || 'AI stock forecast complete.',
    demandHighlights: payload.demandHighlights ?? [],
    suggestions: enrichedSuggestions,
  };
}
