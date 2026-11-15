import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  MapPin,
  Plus,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { Product } from '../../types/nexpos';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { calculateInventoryProjections } from '../../utils/inventoryProjection';
import { HighlightedText } from '../common/HighlightedText';
import { InventoryProjectionPanel } from '../common/InventoryProjectionPanel';
import {
  getStockThresholdStatus,
  StockThresholdBadge,
} from '../common/StockThresholdBadge';
import {
  PredictiveSearchBar,
  PredictiveSuggestionItem,
} from '../common/PredictiveSearchBar';
import { ProductFuzzyResult, scoreProductFuzzyMatch } from '../../utils/fuzzySearch';
import { haptics } from '../../utils/haptics';

export const InventoryView: React.FC = () => {
  const {
    activeBusiness,
    products,
    sales,
    purchases,
    locations,
    stockMovements,
    can,
    adjustStock,
    saveLocation,
  } = useNexPos();

  const currency = activeBusiness?.currency ?? 'LKR';
  const canAdjust = can('adjust_inventory');

  const [activeTab, setActiveTab] = useState<'stock' | 'projection'>('stock');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'healthy'>('all');
  const [stockSearch, setStockSearch] = useState('');
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [movementFilter, setMovementFilter] = useState<string>('all');

  // Stock Adjustment Modal
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState('');
  const [adjType, setAdjType] = useState<'in' | 'out' | 'adjustment'>('in');
  const [adjQty, setAdjQty] = useState('10');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSaving, setAdjSaving] = useState(false);

  // Add Location Modal
  const [locOpen, setLocOpen] = useState(false);
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');

  const scopedProducts = useMemo(() => {
    if (selectedLocation === 'all') return products;
    return products.filter((p) => p.locationId === selectedLocation);
  }, [products, selectedLocation]);

  const valuation = useMemo(() => {
    const totalUnits = scopedProducts.reduce((sum, p) => sum + p.stockQuantity, 0);
    const costValue = roundMoney(
      scopedProducts.reduce((sum, p) => sum + p.purchasePrice * p.stockQuantity, 0)
    );
    const retailValue = roundMoney(
      scopedProducts.reduce((sum, p) => sum + p.sellingPrice * p.stockQuantity, 0)
    );
    const lowStockProducts = scopedProducts.filter(
      (p) => p.active && p.stockQuantity <= p.minStockLevel
    );
    const outOfStockCount = lowStockProducts.filter((p) => p.stockQuantity === 0).length;
    return {
      totalUnits,
      costValue,
      retailValue,
      potentialProfit: roundMoney(retailValue - costValue),
      lowStockCount: lowStockProducts.length,
      outOfStockCount,
      mostUrgentProduct: [...lowStockProducts].sort((a, b) => a.stockQuantity - b.stockQuantity)[0],
    };
  }, [scopedProducts]);

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      map.set(loc.id, loc.name);
    }
    return map;
  }, [locations]);

  const displayedStockProducts = useMemo(() => {
    const q = stockSearch.trim();
    const entries: Array<{
      product: Product;
      locName: string;
      match: ProductFuzzyResult<Product> | null;
    }> = [];

    for (const p of scopedProducts) {
      const isLow = p.stockQuantity <= p.minStockLevel;
      if (stockFilter === 'low' && (!p.active || !isLow)) continue;
      if (stockFilter === 'healthy' && isLow) continue;

      const locName = (p.locationId && locationNameById.get(p.locationId)) || 'Primary';
      if (!q) {
        entries.push({ product: p, locName, match: null });
      } else {
        const match = scoreProductFuzzyMatch(
          p,
          {
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            locationName: locName,
          },
          q
        );
        if (match) {
          entries.push({ product: p, locName, match });
        }
      }
    }

    return entries.sort((a, b) => {
      if (q && a.match && b.match && b.match.score !== a.match.score) {
        return b.match.score - a.match.score;
      }
      const tierRank = {
        out_of_stock: 0,
        below_min: 1,
        at_min: 2,
        healthy: 3,
        inactive: 4,
      } as const;
      const sa = getStockThresholdStatus(
        a.product.stockQuantity,
        a.product.minStockLevel,
        a.product.active
      );
      const sb = getStockThresholdStatus(
        b.product.stockQuantity,
        b.product.minStockLevel,
        b.product.active
      );
      if (tierRank[sa.tier] !== tierRank[sb.tier]) {
        return tierRank[sa.tier] - tierRank[sb.tier];
      }
      if (sb.deficit !== sa.deficit) {
        return sb.deficit - sa.deficit;
      }
      return a.product.stockQuantity - b.product.stockQuantity;
    });
  }, [scopedProducts, locationNameById, stockFilter, stockSearch]);

  const fuzzyStockMatchCount = useMemo(
    () => displayedStockProducts.filter((e) => e.match?.isFuzzyMatch).length,
    [displayedStockProducts]
  );

  const projectionAlertCount = useMemo(() => {
    const { summary } = calculateInventoryProjections(products, sales, purchases, {
      lookbackDays: 14,
      leadTimeDays: 5,
      safetyBufferDays: 7,
      targetCoverageDays: 30,
      locationId: selectedLocation,
    });
    return summary.triggerNowCount;
  }, [products, sales, purchases, selectedLocation]);

  const filteredMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      if (selectedLocation !== 'all' && m.locationId && m.locationId !== selectedLocation) {
        return false;
      }
      if (movementFilter !== 'all' && m.type !== movementFilter) return false;
      return true;
    });
  }, [stockMovements, selectedLocation, movementFilter]);

  const openAdjustModal = (productId?: string) => {
    setAdjProductId(productId ?? products[0]?.id ?? '');
    setAdjType('in');
    setAdjQty('10');
    setAdjReason('');
    setAdjError(null);
    setAdjOpen(true);
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProductId || !adjReason.trim()) {
      haptics.warning();
      setAdjError('Product and adjustment reason are required.');
      return;
    }
    setAdjSaving(true);
    setAdjError(null);
    try {
      await adjustStock({
        productId: adjProductId,
        type: adjType,
        quantityChange: Math.max(0, Number(adjQty) || 0),
        reason: adjReason.trim(),
        locationId: selectedLocation === 'all' ? undefined : selectedLocation,
      });
      haptics.success();
      setAdjOpen(false);
    } catch (err) {
      haptics.error();
      setAdjError(err instanceof Error ? err.message : 'Stock adjustment failed.');
    } finally {
      setAdjSaving(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) {
      haptics.warning();
      return;
    }
    try {
      await saveLocation({
        name: locName.trim(),
        address: locAddress.trim() || undefined,
        isDefault: locations.length === 0,
      });
      haptics.success();
      setLocName('');
      setLocAddress('');
      setLocOpen(false);
    } catch {
      haptics.error();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Inventory & Stock Ledger
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track multi-location stock valuation, low-stock warnings, and auditable stock movements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            aria-label="Filter by inventory location"
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Locations ({locations.length})</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          {canAdjust && (
            <>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setLocOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" />
                Add Location
              </button>
              <button
                type="button"
                disabled={products.length === 0}
                onClick={() => {
                  haptics.light();
                  openAdjustModal();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adjust Stock
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inventory Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          role="tablist"
          aria-label="Inventory Workspace Mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stock'}
            onClick={() => {
              haptics.selection();
              setActiveTab('stock');
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'stock'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            Stock Levels & Ledger
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'projection'}
            onClick={() => {
              haptics.selection();
              setActiveTab('projection');
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'projection'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Inventory Projections
            {projectionAlertCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold tabular-nums ${
                  activeTab === 'projection'
                    ? 'bg-white/20 text-white'
                    : 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                }`}
              >
                {projectionAlertCount} due
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'projection' ? (
        <InventoryProjectionPanel selectedLocation={selectedLocation} />
      ) : (
        <>
      {/* Low-Stock Alert Banner */}
      {valuation.lowStockCount > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/30 px-5 py-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {valuation.lowStockCount}{' '}
                {valuation.lowStockCount === 1 ? 'SKU requires' : 'SKUs require'} restocking
                {valuation.outOfStockCount > 0
                  ? ` (${valuation.outOfStockCount} completely out of stock)`
                  : ''}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Products at or below their minimum stock level are prioritized at the top of the table.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                haptics.warning();
                setStockFilter((prev) => (prev === 'low' ? 'all' : 'low'));
              }}
              className={`px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                stockFilter === 'low'
                  ? 'border-amber-700 bg-amber-700 text-white'
                  : 'border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70'
              }`}
            >
              {stockFilter === 'low' ? 'Show All SKUs' : `Filter Low Stock (${valuation.lowStockCount})`}
            </button>
            {canAdjust && valuation.mostUrgentProduct && (
              <button
                type="button"
                onClick={() => {
                  haptics.warning();
                  openAdjustModal(valuation.mostUrgentProduct?.id);
                }}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Restock {valuation.mostUrgentProduct.sku}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Valuation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Inventory Cost Valuation
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {formatCurrency(valuation.costValue, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {valuation.totalUnits} total units on hand
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Potential Retail Value
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
            {formatCurrency(valuation.retailValue, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">At current selling prices</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Projected Margin
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(valuation.potentialProfit, currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Before discounts &amp; tax</div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (valuation.lowStockCount > 0) {
              haptics.warning();
            } else {
              haptics.selection();
            }
            setStockFilter((prev) => (prev === 'low' ? 'all' : 'low'));
          }}
          className={`text-left rounded-xl border bg-white dark:bg-slate-900 p-5 transition-colors cursor-pointer ${
            valuation.lowStockCount > 0
              ? 'border-amber-300 dark:border-amber-800/80 hover:border-amber-400'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Low-Stock Warnings</span>
            {valuation.lowStockCount > 0 && (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div
            className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
              valuation.lowStockCount > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {valuation.lowStockCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {valuation.lowStockCount > 0
              ? 'Click to filter SKUs needing restock'
              : 'All SKUs above minimum level'}
          </div>
        </button>
      </div>

      {/* Stock On Hand Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold">Current Stock Levels</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <PredictiveSearchBar
              compact
              className="w-full sm:w-72"
              value={stockSearch}
              onChange={(val) => {
                setStockSearch(val);
                setFocusedProductId(null);
              }}
              placeholder="Search product, SKU, or location..."
              ariaLabel="Search inventory stock levels"
              totalMatches={displayedStockProducts.length}
              fuzzyCount={fuzzyStockMatchCount}
              suggestions={displayedStockProducts
                .slice(0, 6)
                .map<PredictiveSuggestionItem>(({ product, locName, match }) => {
                  const isLow = product.active && product.stockQuantity <= product.minStockLevel;
                  return {
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                    barcode: product.barcode,
                    secondaryMeta: locName,
                    stockQuantity: product.stockQuantity,
                    minStockLevel: product.minStockLevel,
                    active: product.active,
                    isFuzzyMatch: match?.isFuzzyMatch ?? false,
                    highlights: {
                      name: match?.highlights.name ?? [],
                      sku: match?.highlights.sku ?? [],
                      barcode: match?.highlights.barcode,
                      secondaryMeta: match?.highlights.location,
                    },
                    actionLabel: canAdjust ? (isLow ? 'Restock' : 'Adjust') : undefined,
                    onAction: canAdjust ? () => openAdjustModal(product.id) : undefined,
                  };
                })}
              onSelectSuggestion={(item) => {
                setStockSearch(item.name);
                setFocusedProductId(item.id);
              }}
            />

            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(
                [
                  { id: 'all', label: `All (${scopedProducts.length})` },
                  { id: 'low', label: `Low Stock (${valuation.lowStockCount})` },
                  { id: 'healthy', label: 'Healthy' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'low' && valuation.lowStockCount > 0) {
                      haptics.warning();
                    } else {
                      haptics.selection();
                    }
                    setStockFilter(tab.id);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    stockFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-4 font-medium">Product</th>
                <th className="py-2.5 px-4 font-medium">SKU</th>
                <th className="py-2.5 px-4 font-medium">Location</th>
                <th className="py-2.5 px-4 font-medium text-right">On Hand</th>
                <th className="py-2.5 px-4 font-medium text-right">Min Level</th>
                <th className="py-2.5 px-4 font-medium text-right">Cost Valuation</th>
                <th className="py-2.5 px-4 font-medium">Health</th>
                {canAdjust && <th className="py-2.5 px-4 font-medium text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedStockProducts.length === 0 ? (
                <tr>
                  <td colSpan={canAdjust ? 8 : 7} className="py-8 text-center text-slate-500">
                    No inventory items match the selected filter.
                  </td>
                </tr>
              ) : (
                displayedStockProducts.map(({ product: p, locName, match }) => {
                  const low = p.active && p.stockQuantity <= p.minStockLevel;
                  const out = p.active && p.stockQuantity === 0;
                  const isFocused = focusedProductId === p.id;
                  const highlights = match?.highlights;
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isFocused
                          ? 'bg-blue-50/75 dark:bg-blue-950/35 ring-1 ring-inset ring-blue-500/40'
                          : out
                          ? 'bg-red-50/60 dark:bg-red-950/15 hover:bg-red-50 dark:hover:bg-red-950/25'
                          : low
                          ? 'bg-amber-50/60 dark:bg-amber-950/15 hover:bg-amber-50 dark:hover:bg-amber-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span>
                            <HighlightedText text={p.name} ranges={highlights?.name} />
                          </span>
                          {match?.isFuzzyMatch && (
                            <span className="shrink-0 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                              Fuzzy
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        <HighlightedText text={p.sku} ranges={highlights?.sku} />
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <HighlightedText text={locName} ranges={highlights?.location} />
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                          out
                            ? 'text-red-600 dark:text-red-400'
                            : low
                            ? 'text-amber-600 dark:text-amber-400'
                            : ''
                        }`}
                      >
                        {p.stockQuantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500 tabular-nums">
                        {p.minStockLevel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(p.purchasePrice * p.stockQuantity, currency)}
                      </td>
                      <td className="py-3 px-4">
                        <StockThresholdBadge
                          stockQuantity={p.stockQuantity}
                          minStockLevel={p.minStockLevel}
                          active={p.active}
                          showHealthy
                        />
                      </td>
                      {canAdjust && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (low) {
                                haptics.warning();
                              } else {
                                haptics.light();
                              }
                              openAdjustModal(p.id);
                            }}
                            className={`font-semibold hover:underline cursor-pointer ${
                              low
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {low ? 'Restock' : 'Adjust'}
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

      {/* Stock Movement History Ledger */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Stock Movement Audit Log</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Immutable ledger of every sale, purchase receipt, stock-in, and manual adjustment.
            </p>
          </div>
          <select
            value={movementFilter}
            onChange={(e) => setMovementFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Types</option>
            <option value="sale">POS Sales</option>
            <option value="purchase">Purchases</option>
            <option value="in">Stock-In</option>
            <option value="out">Stock-Out</option>
            <option value="adjustment">Audit Adjustment</option>
          </select>
        </div>

        {filteredMovements.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No stock movements recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Timestamp</th>
                  <th className="py-2.5 px-4 font-medium">Product</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-4 font-medium text-right">Delta</th>
                  <th className="py-2.5 px-4 font-medium text-right">Prev → New</th>
                  <th className="py-2.5 px-4 font-medium">Reason</th>
                  <th className="py-2.5 px-4 font-medium">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMovements.slice(0, 30).map((mov) => (
                  <tr key={mov.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(mov.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {mov.productName}
                    </td>
                    <td className="py-3 px-4 uppercase font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {mov.type}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                        mov.quantityDelta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {mov.quantityDelta >= 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                      {mov.previousStock} → {mov.newStock}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{mov.reason}</td>
                    <td className="py-3 px-4 text-slate-500">{mov.actorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* Stock Adjustment Modal */}
      {adjOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Adjust Stock"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold">Record Stock Adjustment</h3>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setAdjOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="p-6 space-y-4">
              {adjError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                  {adjError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Product
                </label>
                <select
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {p.stockQuantity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setAdjType('in');
                  }}
                  className={`py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    adjType === 'in'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" /> Stock In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setAdjType('out');
                  }}
                  className={`py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    adjType === 'out'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" /> Stock Out
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setAdjType('adjustment');
                  }}
                  className={`py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                    adjType === 'adjustment'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Set Count
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {adjType === 'adjustment' ? 'New Physical Count' : 'Quantity'}
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step="1"
                  value={adjQty}
                  onChange={(e) => setAdjQty(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason (Required for audit trail)
                </label>
                <input
                  type="text"
                  required
                  maxLength={240}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Monthly cycle count or damaged goods write-off"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.light();
                    setAdjOpen(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjSaving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer"
                >
                  {adjSaving ? 'Recording...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {locOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add Inventory Location"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold">Add Inventory Location</h3>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setLocOpen(false);
                }}
                className="p-1 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddLocation} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Location Name</label>
                <input
                  type="text"
                  required
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  placeholder="e.g. Central Warehouse"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address</label>
                <input
                  type="text"
                  value={locAddress}
                  onChange={(e) => setLocAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.light();
                    setLocOpen(false);
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
