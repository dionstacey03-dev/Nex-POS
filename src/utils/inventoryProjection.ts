import { Product, PurchaseOrder, Sale } from '../types/nexpos';
import { roundMoney } from './currency';

export interface ProjectionParams {
  lookbackDays: number;
  leadTimeDays: number;
  safetyBufferDays: number;
  targetCoverageDays: number;
  locationId?: string;
  now?: Date;
}

export type ProjectionUrgency =
  | 'trigger_now'
  | 'order_soon'
  | 'covered_by_po'
  | 'healthy'
  | 'no_velocity';

export interface ProductProjection {
  product: Product;
  unitsSoldInWindow: number;
  dailyVelocity: number;
  incomingPoQty: number;
  effectiveStock: number;
  daysRemainingOnHand: number | null;
  daysRemainingTotal: number | null;
  estimatedStockoutDate: string | null;
  reorderPointUnits: number;
  daysUntilPoTrigger: number | null;
  nextPoTriggerDate: string | null;
  suggestedOrderQty: number;
  estimatedPoCost: number;
  urgency: ProjectionUrgency;
}

export interface InventoryProjectionSummary {
  totalTrackedSkus: number;
  triggerNowCount: number;
  orderSoonCount: number;
  coveredByPoCount: number;
  averageCoverageDays: number | null;
  totalSuggestedPoSpend: number;
}

function addDaysIso(baseDate: Date, days: number): string {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString();
}

const URGENCY_RANK: Record<ProjectionUrgency, number> = {
  trigger_now: 0,
  order_soon: 1,
  covered_by_po: 2,
  healthy: 3,
  no_velocity: 4,
};

export function calculateInventoryProjections(
  products: Product[],
  sales: Sale[],
  purchases: PurchaseOrder[],
  params: ProjectionParams
): {
  projections: ProductProjection[];
  summary: InventoryProjectionSummary;
} {
  const now = params.now ?? new Date();
  const lookbackDays = Math.max(1, Math.floor(params.lookbackDays));
  const leadTimeDays = Math.max(0, Math.floor(params.leadTimeDays));
  const safetyBufferDays = Math.max(0, Math.floor(params.safetyBufferDays));
  const targetCoverageDays = Math.max(1, Math.floor(params.targetCoverageDays));
  const scopedLoc =
    params.locationId && params.locationId !== 'all' ? params.locationId : undefined;

  const cutoffMs = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;

  // 1. Aggregate completed, non-custom units sold per productId within lookback window
  const soldByProduct = new Map<string, number>();
  for (const sale of sales) {
    if (sale.status !== 'completed') continue;
    if (scopedLoc && sale.locationId && sale.locationId !== scopedLoc) continue;
    const saleMs = Date.parse(sale.createdAt);
    if (!Number.isFinite(saleMs) || saleMs < cutoffMs || saleMs > now.getTime()) continue;

    for (const item of sale.items) {
      if (item.isCustom) continue;
      soldByProduct.set(
        item.productId,
        (soldByProduct.get(item.productId) ?? 0) + Math.max(0, item.quantity)
      );
    }
  }

  // 2. Aggregate incoming units from open ('ordered') Purchase Orders
  const incomingByProduct = new Map<string, number>();
  for (const po of purchases) {
    if (po.status !== 'ordered') continue;
    if (scopedLoc && po.locationId && po.locationId !== scopedLoc) continue;
    for (const item of po.items) {
      incomingByProduct.set(
        item.productId,
        (incomingByProduct.get(item.productId) ?? 0) + Math.max(0, item.quantity)
      );
    }
  }

  const scopedProducts = products.filter((p) => {
    if (!p.active) return false;
    if (scopedLoc && p.locationId !== scopedLoc) return false;
    return true;
  });

  const projections: ProductProjection[] = scopedProducts.map((product) => {
    const unitsSoldInWindow = soldByProduct.get(product.id) ?? 0;
    const rawVelocity = unitsSoldInWindow / lookbackDays;
    const dailyVelocity = Math.round(rawVelocity * 100) / 100;

    const incomingPoQty = incomingByProduct.get(product.id) ?? 0;
    const effectiveStock = product.stockQuantity + incomingPoQty;

    const daysRemainingOnHand =
      rawVelocity > 0 ? Math.round((product.stockQuantity / rawVelocity) * 10) / 10 : null;
    const daysRemainingTotal =
      rawVelocity > 0 ? Math.round((effectiveStock / rawVelocity) * 10) / 10 : null;

    const estimatedStockoutDate =
      daysRemainingTotal !== null
        ? addDaysIso(now, Math.min(3650, Math.round(daysRemainingTotal)))
        : null;

    const velocityReorderPoint = Math.ceil(rawVelocity * (leadTimeDays + safetyBufferDays));
    const reorderPointUnits = Math.max(product.minStockLevel, velocityReorderPoint);

    let daysUntilPoTrigger: number | null = null;
    let nextPoTriggerDate: string | null = null;

    if (rawVelocity > 0) {
      daysUntilPoTrigger = Math.floor((effectiveStock - reorderPointUnits) / rawVelocity);
      nextPoTriggerDate = addDaysIso(now, Math.max(0, daysUntilPoTrigger));
    } else if (product.stockQuantity <= product.minStockLevel && incomingPoQty === 0) {
      daysUntilPoTrigger = 0;
      nextPoTriggerDate = now.toISOString();
    }

    const targetStockUnits = Math.max(
      product.minStockLevel * 2,
      Math.ceil(rawVelocity * (targetCoverageDays + leadTimeDays))
    );
    const suggestedOrderQty = Math.max(0, targetStockUnits - effectiveStock);
    const estimatedPoCost = roundMoney(suggestedOrderQty * product.purchasePrice);

    let urgency: ProjectionUrgency;
    if (
      effectiveStock <= reorderPointUnits &&
      (rawVelocity > 0 || product.stockQuantity <= product.minStockLevel)
    ) {
      urgency = 'trigger_now';
    } else if (daysUntilPoTrigger !== null && daysUntilPoTrigger <= 7) {
      urgency = 'order_soon';
    } else if (incomingPoQty > 0 && product.stockQuantity <= reorderPointUnits) {
      urgency = 'covered_by_po';
    } else if (rawVelocity === 0) {
      urgency = 'no_velocity';
    } else {
      urgency = 'healthy';
    }

    return {
      product,
      unitsSoldInWindow,
      dailyVelocity,
      incomingPoQty,
      effectiveStock,
      daysRemainingOnHand,
      daysRemainingTotal,
      estimatedStockoutDate,
      reorderPointUnits,
      daysUntilPoTrigger,
      nextPoTriggerDate,
      suggestedOrderQty,
      estimatedPoCost,
      urgency,
    };
  });

  projections.sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rankDiff !== 0) return rankDiff;

    if (a.daysUntilPoTrigger !== null && b.daysUntilPoTrigger !== null) {
      if (a.daysUntilPoTrigger !== b.daysUntilPoTrigger) {
        return a.daysUntilPoTrigger - b.daysUntilPoTrigger;
      }
    }

    if (a.daysRemainingTotal !== null && b.daysRemainingTotal !== null) {
      return a.daysRemainingTotal - b.daysRemainingTotal;
    }

    return a.product.stockQuantity - b.product.stockQuantity;
  });

  const movingCoverages = projections
    .map((p) => p.daysRemainingTotal)
    .filter((d): d is number => d !== null);

  const averageCoverageDays =
    movingCoverages.length > 0
      ? Math.round(
          (movingCoverages.reduce((sum, d) => sum + d, 0) / movingCoverages.length) * 10
        ) / 10
      : null;

  const triggerNowItems = projections.filter((p) => p.urgency === 'trigger_now');
  const orderSoonItems = projections.filter((p) => p.urgency === 'order_soon');

  const totalSuggestedPoSpend = roundMoney(
    [...triggerNowItems, ...orderSoonItems].reduce((sum, p) => sum + p.estimatedPoCost, 0)
  );

  return {
    projections,
    summary: {
      totalTrackedSkus: projections.length,
      triggerNowCount: triggerNowItems.length,
      orderSoonCount: orderSoonItems.length,
      coveredByPoCount: projections.filter((p) => p.urgency === 'covered_by_po').length,
      averageCoverageDays,
      totalSuggestedPoSpend,
    },
  };
}
