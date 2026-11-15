import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  PackageCheck,
  ShoppingBag,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { PurchaseItem } from '../../types/nexpos';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { scoreProductFuzzyMatch } from '../../utils/fuzzySearch';
import { haptics } from '../../utils/haptics';
import {
  calculateInventoryProjections,
  ProductProjection,
  ProjectionUrgency,
} from '../../utils/inventoryProjection';
import { HighlightedText } from './HighlightedText';
import { StockThresholdBadge } from './StockThresholdBadge';
import {
  PredictiveSearchBar,
  PredictiveSuggestionItem,
} from './PredictiveSearchBar';

interface InventoryProjectionPanelProps {
  selectedLocation: string;
}

type UrgencyFilter = 'all' | 'trigger_now' | 'order_soon' | 'healthy' | 'no_velocity';

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const InventoryProjectionPanel: React.FC<InventoryProjectionPanelProps> = ({
  selectedLocation,
}) => {
  const {
    activeBusiness,
    products,
    sales,
    purchases,
    suppliers,
    locations,
    can,
    createPurchaseOrder,
  } = useNexPos();

  const currency = activeBusiness?.currency ?? 'LKR';
  const canManagePurchases = can('manage_purchases');

  // Forecast Model Controls
  const [lookbackDays, setLookbackDays] = useState<number>(14);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(5);
  const [safetyBufferDays, setSafetyBufferDays] = useState<number>(7);
  const [targetCoverageDays, setTargetCoverageDays] = useState<number>(30);

  // Table Filters
  const [search, setSearch] = useState('');
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');

  // Trigger PO Modal State
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poLocationId, setPoLocationId] = useState('');
  const [poItems, setPoItems] = useState<PurchaseItem[]>([]);
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poNotice, setPoNotice] = useState<string | null>(null);

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) map.set(loc.id, loc.name);
    return map;
  }, [locations]);

  const { projections, summary } = useMemo(
    () =>
      calculateInventoryProjections(products, sales, purchases, {
        lookbackDays,
        leadTimeDays,
        safetyBufferDays,
        targetCoverageDays,
        locationId: selectedLocation,
      }),
    [
      products,
      sales,
      purchases,
      lookbackDays,
      leadTimeDays,
      safetyBufferDays,
      targetCoverageDays,
      selectedLocation,
    ]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim();
    const list: Array<{
      proj: ProductProjection;
      locName: string;
      highlights: { name: { start: number; end: number }[]; sku: { start: number; end: number }[]; location: { start: number; end: number }[] } | null;
      isFuzzyMatch: boolean;
      score: number;
    }> = [];

    for (const proj of projections) {
      if (urgencyFilter === 'trigger_now' && proj.urgency !== 'trigger_now') continue;
      if (urgencyFilter === 'order_soon' && proj.urgency !== 'order_soon') continue;
      if (
        urgencyFilter === 'healthy' &&
        proj.urgency !== 'healthy' &&
        proj.urgency !== 'covered_by_po'
      ) {
        continue;
      }
      if (urgencyFilter === 'no_velocity' && proj.urgency !== 'no_velocity') continue;

      const locName =
        (proj.product.locationId && locationNameById.get(proj.product.locationId)) ||
        'Primary';

      if (!q) {
        list.push({ proj, locName, highlights: null, isFuzzyMatch: false, score: 0 });
      } else {
        const match = scoreProductFuzzyMatch(
          proj.product,
          {
            name: proj.product.name,
            sku: proj.product.sku,
            barcode: proj.product.barcode,
            locationName: locName,
          },
          q
        );
        if (match) {
          list.push({
            proj,
            locName,
            highlights: {
              name: match.highlights.name,
              sku: match.highlights.sku,
              location: match.highlights.location,
            },
            isFuzzyMatch: match.isFuzzyMatch,
            score: match.score,
          });
        }
      }
    }

    if (q) {
      list.sort((a, b) => b.score - a.score);
    }

    return list;
  }, [projections, urgencyFilter, search, locationNameById]);

  const fuzzyCount = useMemo(
    () => filteredRows.filter((r) => r.isFuzzyMatch).length,
    [filteredRows]
  );

  const openTriggerPoModal = (targets: ProductProjection[]) => {
    const validTargets = targets.filter((t) => t.suggestedOrderQty > 0 || targets.length === 1);
    if (validTargets.length === 0 || suppliers.length === 0) {
      haptics.warning();
      return;
    }
    haptics.medium();
    setPoSupplierId(suppliers[0]?.id ?? '');
    setPoLocationId(
      selectedLocation !== 'all'
        ? selectedLocation
        : locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? ''
    );
    setPoItems(
      validTargets.map((t) => {
        const qty = Math.max(1, t.suggestedOrderQty || t.product.minStockLevel || 10);
        return {
          productId: t.product.id,
          productName: t.product.name,
          sku: t.product.sku,
          quantity: qty,
          unitCost: t.product.purchasePrice,
          lineTotal: roundMoney(qty * t.product.purchasePrice),
        };
      })
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
      setPoModalOpen(false);
      setPoNotice(
        `Purchase order created with ${sup.companyName} for ${poItems.length} ${
          poItems.length === 1 ? 'SKU' : 'SKUs'
        }. Incoming quantities are now reflected in projections.`
      );
    } catch {
      haptics.error();
    } finally {
      setPoSubmitting(false);
    }
  };

  const urgencyCounts = useMemo(() => {
    const counts: Record<UrgencyFilter, number> = {
      all: projections.length,
      trigger_now: 0,
      order_soon: 0,
      healthy: 0,
      no_velocity: 0,
    };
    for (const p of projections) {
      if (p.urgency === 'trigger_now') counts.trigger_now++;
      else if (p.urgency === 'order_soon') counts.order_soon++;
      else if (p.urgency === 'healthy' || p.urgency === 'covered_by_po') counts.healthy++;
      else counts.no_velocity++;
    }
    return counts;
  }, [projections]);

  const urgentRows = useMemo(
    () => projections.filter((p) => p.urgency === 'trigger_now'),
    [projections]
  );

  const renderUrgencyStatus = (proj: ProductProjection) => {
    const map: Record<
      ProjectionUrgency,
      { label: string; sub: string; badgeClass: string }
    > = {
      trigger_now: {
        label:
          proj.daysUntilPoTrigger !== null && proj.daysUntilPoTrigger < 0
            ? `Overdue (${Math.abs(proj.daysUntilPoTrigger)}d)`
            : 'Trigger Today',
        sub:
          proj.dailyVelocity > 0
            ? `Reorder point: ${proj.reorderPointUnits} units`
            : `At/below min (${proj.product.minStockLevel})`,
        badgeClass: 'text-red-600 dark:text-red-400 font-semibold',
      },
      order_soon: {
        label: `In ${proj.daysUntilPoTrigger}d · ${formatShortDate(proj.nextPoTriggerDate)}`,
        sub: `Reorder point: ${proj.reorderPointUnits} units`,
        badgeClass: 'text-amber-600 dark:text-amber-400 font-semibold',
      },
      covered_by_po: {
        label: 'PO In Transit',
        sub: `+${proj.incomingPoQty} incoming covers buffer`,
        badgeClass: 'text-blue-600 dark:text-blue-400 font-semibold',
      },
      healthy: {
        label:
          proj.daysUntilPoTrigger !== null
            ? `In ${proj.daysUntilPoTrigger}d · ${formatShortDate(proj.nextPoTriggerDate)}`
            : 'Healthy',
        sub: `Reorder point: ${proj.reorderPointUnits} units`,
        badgeClass: 'text-emerald-700 dark:text-emerald-400 font-medium',
      },
      no_velocity: {
        label: 'No Sales Velocity',
        sub: `0 sold in last ${lookbackDays}d`,
        badgeClass: 'text-slate-500 dark:text-slate-400',
      },
    };
    const meta = map[proj.urgency];
    return (
      <div>
        <div className={meta.badgeClass}>{meta.label}</div>
        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{meta.sub}</div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* PO Confirmation Notice */}
      {poNotice && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-xs font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{poNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setPoNotice(null)}
            className="p-1 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Forecast Parameters Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Sales Velocity & Reorder Forecast Model
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Estimates days of stock remaining and exact Purchase Order trigger dates from recent POS demand and open POs.
              </p>
            </div>
          </div>

          {canManagePurchases && urgentRows.length > 0 && suppliers.length > 0 && (
            <button
              type="button"
              onClick={() => openTriggerPoModal(urgentRows)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Trigger PO for {urgentRows.length} Urgent {urgentRows.length === 1 ? 'SKU' : 'SKUs'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Velocity Lookback Window
            </label>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {[7, 14, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setLookbackDays(d);
                  }}
                  className={`py-1.5 rounded-md text-xs font-mono font-semibold cursor-pointer transition-colors ${
                    lookbackDays === d
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="proj-lead-time"
              className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
            >
              Supplier Lead Time (Days)
            </label>
            <input
              id="proj-lead-time"
              type="number"
              min={0}
              max={90}
              value={leadTimeDays}
              onChange={(e) =>
                setLeadTimeDays(Math.max(0, Math.min(90, Math.floor(Number(e.target.value)) || 0)))
              }
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="proj-safety-buffer"
              className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
            >
              Safety Buffer (Days)
            </label>
            <input
              id="proj-safety-buffer"
              type="number"
              min={0}
              max={60}
              value={safetyBufferDays}
              onChange={(e) =>
                setSafetyBufferDays(
                  Math.max(0, Math.min(60, Math.floor(Number(e.target.value)) || 0))
                )
              }
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="proj-target-coverage"
              className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
            >
              Target PO Coverage (Days)
            </label>
            <input
              id="proj-target-coverage"
              type="number"
              min={7}
              max={180}
              value={targetCoverageDays}
              onChange={(e) =>
                setTargetCoverageDays(
                  Math.max(7, Math.min(180, Math.floor(Number(e.target.value)) || 7))
                )
              }
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => {
            haptics.warning();
            setUrgencyFilter((prev) => (prev === 'trigger_now' ? 'all' : 'trigger_now'));
          }}
          className={`text-left rounded-xl border bg-white dark:bg-slate-900 p-5 transition-colors cursor-pointer ${
            summary.triggerNowCount > 0
              ? 'border-red-300 dark:border-red-900/80 hover:border-red-400'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Trigger PO Now</span>
            {summary.triggerNowCount > 0 && (
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
          </div>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              summary.triggerNowCount > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {summary.triggerNowCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            At or below {leadTimeDays + safetyBufferDays}d reorder point
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            haptics.selection();
            setUrgencyFilter((prev) => (prev === 'order_soon' ? 'all' : 'order_soon'));
          }}
          className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Order Within 7 Days</span>
            <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {summary.orderSoonCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Upcoming PO triggers this week
          </div>
        </button>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Avg Runway Coverage</span>
            <PackageCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
            {summary.averageCoverageDays !== null ? `${summary.averageCoverageDays}d` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.coveredByPoCount > 0
              ? `${summary.coveredByPoCount} SKUs covered by incoming PO`
              : `Across ${summary.totalTrackedSkus} active SKUs`}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Projected Reorder Spend</span>
            <Truck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(summary.totalSuggestedPoSpend, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            To restore {targetCoverageDays}d coverage on due SKUs
          </div>
        </div>
      </div>

      {/* Projections Table Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <PredictiveSearchBar
            compact
            className="w-full sm:w-72"
            value={search}
            onChange={(val) => {
              setSearch(val);
              setFocusedProductId(null);
            }}
            placeholder="Search projected SKUs or locations..."
            ariaLabel="Search inventory projections"
            totalMatches={filteredRows.length}
            fuzzyCount={fuzzyCount}
            suggestions={filteredRows.slice(0, 6).map<PredictiveSuggestionItem>(
              ({ proj, locName, highlights, isFuzzyMatch }) => ({
                id: proj.product.id,
                name: proj.product.name,
                sku: proj.product.sku,
                barcode: proj.product.barcode,
                secondaryMeta: locName,
                stockQuantity: proj.product.stockQuantity,
                minStockLevel: proj.product.minStockLevel,
                active: proj.product.active,
                isFuzzyMatch,
                highlights: {
                  name: highlights?.name ?? [],
                  sku: highlights?.sku ?? [],
                  secondaryMeta: highlights?.location,
                },
                actionLabel:
                  canManagePurchases && suppliers.length > 0 ? 'Trigger PO' : undefined,
                onAction:
                  canManagePurchases && suppliers.length > 0
                    ? () => openTriggerPoModal([proj])
                    : undefined,
              })
            )}
            onSelectSuggestion={(item) => {
              setSearch(item.name);
              setFocusedProductId(item.id);
            }}
          />

          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(
              [
                { id: 'all', label: `All (${urgencyCounts.all})` },
                { id: 'trigger_now', label: `Trigger Now (${urgencyCounts.trigger_now})` },
                { id: 'order_soon', label: `≤ 7d (${urgencyCounts.order_soon})` },
                { id: 'healthy', label: `Healthy (${urgencyCounts.healthy})` },
                { id: 'no_velocity', label: `No Sales (${urgencyCounts.no_velocity})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'trigger_now' && urgencyCounts.trigger_now > 0) {
                    haptics.warning();
                  } else {
                    haptics.selection();
                  }
                  setUrgencyFilter(tab.id);
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  urgencyFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-4 font-medium">Product / SKU</th>
                <th className="py-2.5 px-4 font-medium text-right">Stock + Incoming</th>
                <th className="py-2.5 px-4 font-medium text-right">
                  Velocity ({lookbackDays}d)
                </th>
                <th className="py-2.5 px-4 font-medium">Days Remaining</th>
                <th className="py-2.5 px-4 font-medium">Next PO Trigger</th>
                <th className="py-2.5 px-4 font-medium text-right">Suggested PO Qty</th>
                {canManagePurchases && (
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManagePurchases ? 7 : 6}
                    className="py-8 text-center text-slate-500"
                  >
                    No inventory projections match the current filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ proj, locName, highlights, isFuzzyMatch }) => {
                  const p = proj.product;
                  const isFocused = focusedProductId === p.id;
                  const runwayPercent =
                    proj.daysRemainingTotal !== null
                      ? Math.min(
                          100,
                          Math.round(
                            (proj.daysRemainingTotal / (targetCoverageDays + leadTimeDays)) * 100
                          )
                        )
                      : 100;

                  const barColor =
                    proj.urgency === 'trigger_now'
                      ? 'bg-red-500'
                      : proj.urgency === 'order_soon'
                      ? 'bg-amber-500'
                      : proj.urgency === 'no_velocity'
                      ? 'bg-slate-300 dark:bg-slate-700'
                      : 'bg-emerald-500';

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isFocused
                          ? 'bg-blue-50/75 dark:bg-blue-950/35 ring-1 ring-inset ring-blue-500/40'
                          : proj.urgency === 'trigger_now'
                          ? 'bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            <HighlightedText text={p.name} ranges={highlights?.name} />
                          </span>
                          <StockThresholdBadge
                            compact
                            stockQuantity={p.stockQuantity}
                            minStockLevel={p.minStockLevel}
                            active={p.active}
                          />
                          {isFuzzyMatch && (
                            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                              Fuzzy
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          <HighlightedText text={p.sku} ranges={highlights?.sku} /> ·{' '}
                          <span className="font-sans">
                            <HighlightedText text={locName} ranges={highlights?.location} />
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {p.stockQuantity}
                          {proj.incomingPoQty > 0 && (
                            <span className="ml-1 text-blue-600 dark:text-blue-400 font-semibold">
                              +{proj.incomingPoQty}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          min {p.minStockLevel}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {proj.dailyVelocity.toFixed(2)} / day
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {proj.unitsSoldInWindow} sold
                        </div>
                      </td>

                      <td className="py-3 px-4 min-w-[140px]">
                        <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                          <span
                            className={`font-bold ${
                              proj.urgency === 'trigger_now'
                                ? 'text-red-600 dark:text-red-400'
                                : proj.urgency === 'order_soon'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {proj.daysRemainingTotal !== null
                              ? `${proj.daysRemainingTotal} days`
                              : '∞ (Static)'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {proj.estimatedStockoutDate
                              ? `Out ${formatShortDate(proj.estimatedStockoutDate)}`
                              : 'No burn'}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${Math.max(4, runwayPercent)}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4">{renderUrgencyStatus(proj)}</td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {proj.suggestedOrderQty > 0 ? (
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              +{proj.suggestedOrderQty} units
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {formatCurrency(proj.estimatedPoCost, currency)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {canManagePurchases && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={suppliers.length === 0}
                            onClick={() => openTriggerPoModal([proj])}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                              proj.urgency === 'trigger_now'
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : proj.urgency === 'order_soon'
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                            }`}
                          >
                            <ShoppingBag className="w-3 h-3" />
                            Trigger PO
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Purchase Order Modal from Projections */}
      {poModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Trigger Replenishment Purchase Order"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Trigger Replenishment PO
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Quantities are pre-calculated for {targetCoverageDays}d coverage plus{' '}
                  {leadTimeDays}d supplier lead time.
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
    </div>
  );
};
