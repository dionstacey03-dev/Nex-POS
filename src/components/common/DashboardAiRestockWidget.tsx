import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  PackagePlus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import {
  AiRestockSuggestion,
  AiStockForecastResult,
  buildForecastDataSignature,
  fetchAiStockForecast,
  ForecastUrgency,
} from '../../services/aiForecastService';
import { PurchaseItem } from '../../types/nexpos';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { haptics } from '../../utils/haptics';
import { ProductThumbnail } from './ProductThumbnail';
import { StockThresholdBadge } from './StockThresholdBadge';

// Module-level cache keyed by businessId so navigating away & back to Dashboard is instant
const forecastCache = new Map<string, AiStockForecastResult>();

function formatReorderDate(raw: string): { label: string; isImmediate: boolean } {
  if (/^immediate$/i.test(raw)) {
    return { label: 'Order Today', isImmediate: true };
  }
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { label: raw, isImmediate: false };
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (raw <= todayStr) {
    return { label: 'Order Today', isImmediate: true };
  }
  return {
    label: parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    isImmediate: false,
  };
}

const URGENCY_META: Record<
  ForecastUrgency,
  { label: string; badgeClass: string; borderClass: string }
> = {
  critical: {
    label: 'Critical',
    badgeClass:
      'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800/80 text-red-700 dark:text-red-300',
    borderClass: 'border-red-200/90 dark:border-red-900/60',
  },
  high: {
    label: 'Order Soon',
    badgeClass:
      'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800/80 text-amber-800 dark:text-amber-300',
    borderClass: 'border-amber-200/90 dark:border-amber-900/50',
  },
  moderate: {
    label: 'Plan PO',
    badgeClass:
      'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/70 text-blue-700 dark:text-blue-300',
    borderClass: 'border-slate-200 dark:border-slate-800',
  },
  watch: {
    label: 'Monitor',
    badgeClass:
      'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
    borderClass: 'border-slate-200 dark:border-slate-800',
  },
};

export const DashboardAiRestockWidget: React.FC = () => {
  const {
    activeBusiness,
    products,
    categories,
    sales,
    purchases,
    suppliers,
    locations,
    can,
    createPurchaseOrder,
    setActiveSection,
  } = useNexPos();

  const businessId = activeBusiness?.id ?? 'default';
  const currency = activeBusiness?.currency ?? 'LKR';
  const canManagePurchases = can('manage_purchases');

  const [leadTimeDays, setLeadTimeDays] = useState<number>(5);
  const [forecast, setForecast] = useState<AiStockForecastResult | null>(
    () => forecastCache.get(businessId) ?? null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<boolean>(false);

  // Quick PO Modal State
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poLocationId, setPoLocationId] = useState('');
  const [poItems, setPoItems] = useState<PurchaseItem[]>([]);
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poNotice, setPoNotice] = useState<string | null>(null);
  const [orderedProductIds, setOrderedProductIds] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);

  const activeProductsCount = useMemo(
    () => products.filter((p) => p.active).length,
    [products]
  );

  const currentSignature = useMemo(
    () =>
      buildForecastDataSignature({
        businessId,
        products,
        sales,
        purchases,
        leadTimeDays,
      }),
    [businessId, products, sales, purchases, leadTimeDays]
  );

  const isStale = Boolean(forecast && forecast.dataSignature !== currentSignature);

  const runForecast = useCallback(
    async (explicitLeadTime?: number) => {
      if (!activeBusiness || activeProductsCount === 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const targetLeadTime = explicitLeadTime ?? leadTimeDays;
      setLoading(true);
      setErrorMsg(null);

      try {
        const result = await fetchAiStockForecast({
          businessId: activeBusiness.id,
          businessName: activeBusiness.name,
          businessType: activeBusiness.businessType,
          currency: activeBusiness.currency,
          products,
          categories,
          sales,
          purchases,
          leadTimeDays: targetLeadTime,
          safetyBufferDays: 7,
          targetCoverageDays: 30,
          signal: controller.signal,
        });

        forecastCache.set(activeBusiness.id, result);
        setForecast(result);
        setOrderedProductIds(new Set());
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setErrorMsg((err as Error).message || 'Unable to generate AI stock forecast.');
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [
      activeBusiness,
      activeProductsCount,
      products,
      categories,
      sales,
      purchases,
      leadTimeDays,
    ]
  );

  // Sync cached forecast when switching businesses & auto-run once if cache doesn't match business
  useEffect(() => {
    const cached = forecastCache.get(businessId) ?? null;
    setForecast(cached);
    setErrorMsg(null);
    setPoNotice(null);

    if (activeBusiness && activeProductsCount > 0 && !cached) {
      void runForecast(leadTimeDays);
    }

    return () => {
      abortRef.current?.abort();
    };
    // Intentionally trigger on businessId change or initial mount for that business
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const urgentSuggestions = useMemo(
    () =>
      (forecast?.suggestions ?? []).filter(
        (s) =>
          (s.urgency === 'critical' || s.urgency === 'high') &&
          !orderedProductIds.has(s.product.id)
      ),
    [forecast, orderedProductIds]
  );

  const visibleSuggestions = useMemo(() => {
    const list = forecast?.suggestions ?? [];
    return showAll ? list : list.slice(0, 4);
  }, [forecast, showAll]);

  const openPoModal = (targets: AiRestockSuggestion[]) => {
    if (targets.length === 0 || suppliers.length === 0) {
      haptics.warning();
      return;
    }
    haptics.medium();
    setPoSupplierId(suppliers[0]?.id ?? '');
    setPoLocationId(locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? '');
    setPoItems(
      targets.map((t) => ({
        productId: t.product.id,
        productName: t.product.name,
        sku: t.product.sku,
        quantity: Math.max(1, t.optimalOrderQty),
        unitCost: t.product.purchasePrice,
        lineTotal: roundMoney(Math.max(1, t.optimalOrderQty) * t.product.purchasePrice),
      }))
    );
    setPoModalOpen(true);
  };

  const updatePoItemQty = (productId: string, nextQty: number) => {
    const safeQty = Math.max(1, Math.floor(nextQty) || 1);
    setPoItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: safeQty,
              lineTotal: roundMoney(safeQty * item.unitCost),
            }
          : item
      )
    );
  };

  const handleConfirmPo = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === poSupplierId);
    if (!sup || poItems.length === 0) {
      haptics.warning();
      return;
    }

    setPoSubmitting(true);
    try {
      await createPurchaseOrder({
        supplierId: sup.id,
        supplierName: sup.companyName,
        locationId: poLocationId || undefined,
        items: poItems,
      });
      haptics.success();
      setOrderedProductIds((prev) => {
        const next = new Set(prev);
        for (const item of poItems) next.add(item.productId);
        return next;
      });
      setPoModalOpen(false);
      setPoNotice(
        `Restock PO created with ${sup.companyName} for ${poItems.length} ${
          poItems.length === 1 ? 'SKU' : 'SKUs'
        }.`
      );
    } catch {
      haptics.error();
    } finally {
      setPoSubmitting(false);
    }
  };

  const renderTrendChip = (s: AiRestockSuggestion) => {
    const { trendDirection, velocityDeltaPct, dailyVelocity7d } = s.snapshot;
    if (trendDirection === 'accelerating') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400">
          <ArrowUpRight className="w-3 h-3" />
          {dailyVelocity7d.toFixed(1)}/d
          {velocityDeltaPct !== null ? ` (+${velocityDeltaPct}%)` : ''}
        </span>
      );
    }
    if (trendDirection === 'slowing') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-medium text-amber-700 dark:text-amber-400">
          <ArrowDownRight className="w-3 h-3" />
          {dailyVelocity7d.toFixed(1)}/d
          {velocityDeltaPct !== null ? ` (${velocityDeltaPct}%)` : ''}
        </span>
      );
    }
    if (trendDirection === 'steady') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-mono font-medium text-slate-600 dark:text-slate-300">
          <Minus className="w-3 h-3" />
          {dailyVelocity7d.toFixed(1)}/d steady
        </span>
      );
    }
    return (
      <span className="text-[11px] font-mono text-slate-400">
        0/d recent
      </span>
    );
  };

  return (
    <section
      aria-label="AI Restock Suggestions"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                AI Restock Suggestions
              </h2>
              {isStale && !loading && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                  Sales/stock updated
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Optimal reorder dates &amp; quantities forecasted from 7d, 14d, and 30d sales velocity and incoming POs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Lead time</span>
            <select
              aria-label="Supplier lead time in days"
              value={leadTimeDays}
              onChange={(e) => {
                const nextLead = Number(e.target.value);
                haptics.selection();
                setLeadTimeDays(nextLead);
                void runForecast(nextLead);
              }}
              className="bg-transparent font-mono font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value={3}>3d</option>
              <option value={5}>5d</option>
              <option value={7}>7d</option>
              <option value={14}>14d</option>
            </select>
          </div>

          {canManagePurchases && urgentSuggestions.length > 1 && suppliers.length > 0 && (
            <button
              type="button"
              onClick={() => openPoModal(urgentSuggestions)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Order {urgentSuggestions.length} Urgent SKUs
            </button>
          )}

          <button
            type="button"
            disabled={loading || activeProductsCount === 0}
            onClick={() => {
              haptics.medium();
              void runForecast();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Forecasting...' : forecast ? 'Refresh Forecast' : 'Run Forecast'}
          </button>
        </div>
      </div>

      {/* PO Confirmation Banner */}
      {poNotice && (
        <div className="mx-5 mt-4 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{poNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setPoNotice(null)}
            className="p-0.5 cursor-pointer"
            aria-label="Dismiss PO confirmation"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="p-5 space-y-4">
        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 dark:border-red-900/80 bg-red-50 dark:bg-red-950/30 p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-xs text-red-800 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">AI Stock Forecast Unavailable</div>
                <div className="mt-0.5 opacity-90">{errorMsg}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setActiveSection('inventory');
                }}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100/60 dark:hover:bg-red-950/60 cursor-pointer"
              >
                Open Projections
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.medium();
                  void runForecast();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {loading && !forecast && (
          <div className="space-y-3" aria-busy="true">
            <div className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-32 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 animate-pulse"
                />
              ))}
            </div>
          </div>
        )}

        {!loading && !errorMsg && activeProductsCount === 0 && (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Add active products to unlock AI-powered demand forecasting and restock recommendations.
          </div>
        )}

        {forecast && (
          <>
            {/* Executive Summary + Demand Highlights */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 px-4 py-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                  {forecast.portfolioSummary}
                </p>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                  Updated{' '}
                  {new Date(forecast.generatedAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {forecast.demandHighlights.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {forecast.demandHighlights.map((highlight, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] text-slate-600 dark:text-slate-300"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actionable Restock Suggestion Cards */}
            {forecast.suggestions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No urgent restocks required right now based on current sales velocity and incoming POs.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {visibleSuggestions.map((item) => {
                    const meta = URGENCY_META[item.urgency];
                    const dateInfo = formatReorderDate(item.recommendedReorderDate);
                    const isOrdered = orderedProductIds.has(item.product.id);
                    const totalIncoming = item.snapshot.incomingPoQty;

                    return (
                      <div
                        key={item.product.id}
                        className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors bg-white dark:bg-slate-900 ${meta.borderClass}`}
                      >
                        <div className="space-y-2.5">
                          {/* Top Row: Product Identity + Urgency */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ProductThumbnail
                                src={item.product.imageUrl}
                                alt={item.product.name}
                                size="sm"
                                className="w-10 h-10 rounded-lg shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {item.product.name}
                                  </span>
                                  <StockThresholdBadge
                                    compact
                                    stockQuantity={item.product.stockQuantity}
                                    minStockLevel={item.product.minStockLevel}
                                    active={item.product.active}
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                  <span className="font-mono">{item.product.sku}</span>
                                  <span>·</span>
                                  {renderTrendChip(item)}
                                </div>
                              </div>
                            </div>

                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold shrink-0 ${meta.badgeClass}`}
                            >
                              {meta.label}
                            </span>
                          </div>

                          {/* Middle Strip: Metrics Grid */}
                          <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 px-3 py-2 text-xs">
                            <div>
                              <div className="text-[10px] text-slate-400">On Hand</div>
                              <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                {item.product.stockQuantity}
                                {totalIncoming > 0 && (
                                  <span className="ml-1 text-blue-600 dark:text-blue-400 font-semibold">
                                    +{totalIncoming}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                                ~{item.estimatedDaysUntilStockout}d left
                              </div>
                            </div>

                            <div>
                              <div className="text-[10px] text-slate-400">Reorder Date</div>
                              <div
                                className={`font-semibold flex items-center gap-1 ${
                                  dateInfo.isImmediate
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                <CalendarClock className="w-3 h-3 shrink-0" />
                                <span>{dateInfo.label}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 capitalize">
                                {item.confidence} confidence
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] text-slate-400">Suggested Qty</div>
                              <div className="font-mono font-bold tabular-nums text-blue-600 dark:text-blue-400">
                                +{item.optimalOrderQty} units
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 tabular-nums">
                                {formatCurrency(item.estimatedPoCost, currency)}
                              </div>
                            </div>
                          </div>

                          {/* AI Rationale */}
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {item.reasoning}
                          </p>
                        </div>

                        {/* Action Bar */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                            Covers ~{item.projectedCoverageDays}d post-delivery
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                haptics.light();
                                setActiveSection('inventory');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              Projections
                              <ArrowRight className="w-3 h-3" />
                            </button>

                            {canManagePurchases && suppliers.length > 0 && (
                              <button
                                type="button"
                                disabled={isOrdered}
                                onClick={() => openPoModal([item])}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                                  isOrdered
                                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                    : item.urgency === 'critical'
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                              >
                                {isOrdered ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    PO Placed
                                  </>
                                ) : (
                                  <>
                                    <PackagePlus className="w-3.5 h-3.5" />
                                    Create PO
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {forecast.suggestions.length > 4 && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setShowAll((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {showAll ? (
                        <>
                          Show top 4 suggestions <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          Show all {forecast.suggestions.length} restock suggestions{' '}
                          <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Create Restock PO Modal */}
      {poModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Approve AI Restock Purchase Order"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Approve Restock Purchase Order
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Quantities are pre-filled from AI demand velocity recommendations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setPoModalOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmPo} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Supplier
                  </label>
                  <select
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Receiving Location
                  </label>
                  <select
                    value={poLocationId}
                    onChange={(e) => setPoLocationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                {poItems.map((item) => (
                  <div
                    key={item.productId}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.productName}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {item.sku} · {formatCurrency(item.unitCost, currency)} / unit
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updatePoItemQty(item.productId, Number(e.target.value))}
                        aria-label={`Order quantity for ${item.productName}`}
                        className="w-16 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-center font-mono font-semibold tabular-nums"
                      />
                      <span className="font-mono font-bold tabular-nums min-w-[74px] text-right">
                        {formatCurrency(item.lineTotal, currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Estimated PO Total:{' '}
                  <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
                    {formatCurrency(
                      poItems.reduce((sum, i) => sum + i.lineTotal, 0),
                      currency
                    )}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.light();
                      setPoModalOpen(false);
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={poSubmitting || poItems.length === 0}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                  >
                    {poSubmitting ? 'Submitting PO...' : 'Confirm Purchase Order'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
