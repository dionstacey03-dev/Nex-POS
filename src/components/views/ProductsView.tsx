import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  Edit3,
  Plus,
  Printer,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useNexPos } from '../../context/NexPosContext';
import { Product } from '../../types/nexpos';
import { formatCurrency } from '../../utils/currency';
import { ProductThumbnail } from '../common/ProductThumbnail';
import { HighlightedText } from '../common/HighlightedText';
import { PrintBarcodesModal } from '../common/PrintBarcodesModal';
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

type SortKey = 'priority' | 'name' | 'sku' | 'sellingPrice' | 'stockQuantity';

async function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 220;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const ProductsView: React.FC = () => {
  const {
    activeBusiness,
    products,
    categories,
    locations,
    can,
    saveProduct,
    deleteProduct,
  } = useNexPos();

  const currency = activeBusiness?.currency ?? 'LKR';
  const canManage = can('manage_products');
  const canDelete = can('delete_products');

  const [search, setSearch] = useState('');
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelTargetIds, setLabelTargetIds] = useState<string[]>([]);
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'low'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('10');
  const [locationId, setLocationId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [active, setActive] = useState(true);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    const q = search.trim();
    const base = products.filter((p) => {
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
      if (statusFilter === 'active' && !p.active) return false;
      if (statusFilter === 'inactive' && p.active) return false;
      if (statusFilter === 'low' && p.stockQuantity > p.minStockLevel) return false;
      return true;
    });

    const entries: Array<{
      product: Product;
      categoryName: string;
      match: ProductFuzzyResult<Product> | null;
    }> = [];

    for (const p of base) {
      const categoryName = categoryNameById.get(p.categoryId) ?? 'Uncategorized';
      if (!q) {
        entries.push({ product: p, categoryName, match: null });
      } else {
        const match = scoreProductFuzzyMatch(
          p,
          {
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            description: p.description,
            categoryName,
          },
          q
        );
        if (match) {
          entries.push({ product: p, categoryName, match });
        }
      }
    }

    return entries.sort((a, b) => {
      if (q && a.match && b.match && b.match.score !== a.match.score) {
        return b.match.score - a.match.score;
      }
      if (sortKey === 'priority') {
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
      }
      const mult = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'sellingPrice' || sortKey === 'stockQuantity') {
        return (a.product[sortKey] - b.product[sortKey]) * mult;
      }
      return a.product[sortKey].localeCompare(b.product[sortKey]) * mult;
    });
  }, [products, categoryNameById, catFilter, statusFilter, search, sortKey, sortDir]);

  const belowMinStats = useMemo(() => {
    const activeItems = products.filter((p) => p.active);
    const belowMin = activeItems.filter((p) => p.stockQuantity < p.minStockLevel);
    const atOrBelowMin = activeItems.filter((p) => p.stockQuantity <= p.minStockLevel);
    const outOfStock = activeItems.filter((p) => p.stockQuantity === 0);
    return {
      belowMinCount: belowMin.length,
      atOrBelowMinCount: atOrBelowMin.length,
      outOfStockCount: outOfStock.length,
    };
  }, [products]);

  const fuzzyMatchCount = useMemo(
    () => filteredProducts.filter((e) => e.match?.isFuzzyMatch).length,
    [filteredProducts]
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredIds = useMemo(
    () => filteredProducts.map((e) => e.product.id),
    [filteredProducts]
  );
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedSet.has(id));

  const toggleProductSelection = (id: string) => {
    haptics.selection();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFiltered = () => {
    haptics.selection();
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredIds);
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const openLabelsStudio = (targetIds: string[]) => {
    if (targetIds.length === 0) {
      haptics.warning();
      return;
    }
    haptics.medium();
    setLabelTargetIds(targetIds);
    setLabelModalOpen(true);
  };

  const toggleSort = (key: SortKey) => {
    haptics.selection();
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openCreateModal = () => {
    haptics.light();
    setEditing(null);
    setName('');
    setDescription('');
    setCategoryId(categories[0]?.id ?? 'general');
    setSku(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
    setBarcode(`890${Math.floor(100000000 + Math.random() * 899999999)}`);
    setPurchasePrice('');
    setSellingPrice('');
    setStockQuantity('20');
    setMinStockLevel('10');
    setLocationId(locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? '');
    setImageUrl('');
    setActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    haptics.light();
    setEditing(product);
    setName(product.name);
    setDescription(product.description ?? '');
    setCategoryId(product.categoryId);
    setSku(product.sku);
    setBarcode(product.barcode ?? '');
    setPurchasePrice(String(product.purchasePrice));
    setSellingPrice(String(product.sellingPrice));
    setStockQuantity(String(product.stockQuantity));
    setMinStockLevel(String(product.minStockLevel));
    setLocationId(product.locationId ?? '');
    setImageUrl(product.imageUrl ?? '');
    setActive(product.active);
    setFormError(null);
    setModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      if (dataUrl.length > 980) {
        // Note: Firestore blueprint enforces imageUrl maxLength 1000.
        // If data URL exceeds 980 chars, keep it in Demo mode or advise URL.
        setFormError(
          'Compressed image exceeds 1000 characters for cloud rules. Use a shorter hosted image URL or leave blank.'
        );
        return;
      }
      setImageUrl(dataUrl);
    } catch {
      setFormError('Could not process selected image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) {
      haptics.warning();
      setFormError('Product name and SKU are required.');
      return;
    }
    const cost = Number(purchasePrice);
    const price = Number(sellingPrice);
    const qty = Number(stockQuantity);
    const min = Number(minStockLevel);
    if (
      !Number.isFinite(cost) ||
      cost < 0 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(qty) ||
      qty < 0
    ) {
      haptics.error();
      setFormError('Prices and stock quantities must be valid non-negative numbers.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await saveProduct({
        id: editing?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId: categoryId || 'general',
        sku: sku.trim(),
        barcode: barcode.trim() || undefined,
        purchasePrice: cost,
        sellingPrice: price,
        stockQuantity: Math.floor(qty),
        minStockLevel: Math.max(0, Math.floor(min || 0)),
        locationId: locationId || undefined,
        imageUrl: imageUrl.trim() || undefined,
        active,
      });
      haptics.success();
      setModalOpen(false);
    } catch (err) {
      haptics.error();
      setFormError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    if (!canManage) return;
    haptics.selection();
    try {
      await saveProduct({
        id: product.id,
        name: product.name,
        description: product.description,
        categoryId: product.categoryId,
        sku: product.sku,
        barcode: product.barcode,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        stockQuantity: product.stockQuantity,
        minStockLevel: product.minStockLevel,
        locationId: product.locationId,
        imageUrl: product.imageUrl,
        active: !product.active,
      });
    } catch {
      haptics.error();
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Product Catalog
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {products.length} total SKUs · Manage pricing, barcodes, images, and stock thresholds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filteredProducts.length === 0 && selectedIds.length === 0}
            onClick={() =>
              openLabelsStudio(
                selectedIds.length > 0 ? selectedIds : filteredIds
              )
            }
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
              selectedIds.length > 0
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Barcode className="w-4 h-4" />
            {selectedIds.length > 0
              ? `Print Labels (${selectedIds.length})`
              : 'Print Barcode Labels'}
          </button>

          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center gap-3">
        <PredictiveSearchBar
          className="flex-1 min-w-[240px]"
          value={search}
          onChange={(val) => {
            setSearch(val);
            setFocusedProductId(null);
          }}
          placeholder="Search product, SKU, barcode, or category (typo-tolerant)..."
          ariaLabel="Search product catalog"
          showThumbnails
          totalMatches={filteredProducts.length}
          fuzzyCount={fuzzyMatchCount}
          suggestions={filteredProducts.slice(0, 6).map<PredictiveSuggestionItem>((entry) => ({
            id: entry.product.id,
            name: entry.product.name,
            sku: entry.product.sku,
            barcode: entry.product.barcode,
            secondaryMeta: entry.categoryName,
            imageUrl: entry.product.imageUrl,
            priceText: formatCurrency(entry.product.sellingPrice, currency),
            stockQuantity: entry.product.stockQuantity,
            minStockLevel: entry.product.minStockLevel,
            active: entry.product.active,
            isFuzzyMatch: entry.match?.isFuzzyMatch ?? false,
            highlights: {
              name: entry.match?.highlights.name ?? [],
              sku: entry.match?.highlights.sku ?? [],
              barcode: entry.match?.highlights.barcode,
              secondaryMeta: entry.match?.highlights.category,
            },
            actionLabel: canManage ? 'Edit' : undefined,
            onAction: canManage ? () => openEditModal(entry.product) : undefined,
          }))}
          onSelectSuggestion={(item) => {
            setSearch(item.name);
            setFocusedProductId(item.id);
          }}
        />

        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              {
                id: 'low',
                label:
                  belowMinStats.atOrBelowMinCount > 0
                    ? `Low Stock (${belowMinStats.atOrBelowMinCount})`
                    : 'Low Stock',
              },
              { id: 'inactive', label: 'Disabled' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === 'low') {
                  haptics.warning();
                } else {
                  haptics.selection();
                }
                setStatusFilter(tab.id);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {tab.id === 'low' && belowMinStats.atOrBelowMinCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Below Minimum Stock Threshold Alert Banner */}
      {belowMinStats.atOrBelowMinCount > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/85 dark:bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {belowMinStats.atOrBelowMinCount}{' '}
                {belowMinStats.atOrBelowMinCount === 1 ? 'product is' : 'products are'} at or below minimum stock level
              </span>
              {belowMinStats.outOfStockCount > 0 && (
                <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">
                  ({belowMinStats.outOfStockCount} out of stock)
                </span>
              )}
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                Flagged rows highlight unit shortfalls below each SKU&apos;s threshold to prioritize restocking.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setSortKey((prev) => (prev === 'priority' ? 'name' : 'priority'));
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                sortKey === 'priority'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-amber-100/60'
              }`}
            >
              {sortKey === 'priority' ? 'Priority Sort Active' : 'Prioritize Restocks'}
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.warning();
                setStatusFilter((prev) => (prev === 'low' ? 'all' : 'low'));
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === 'low'
                  ? 'border-amber-700 bg-amber-700 text-white'
                  : 'border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70'
              }`}
            >
              {statusFilter === 'low' ? 'Show All' : 'Filter Flagged'}
            </button>
          </div>
        </div>
      )}

      {/* Selection Bar for Batch Barcode Label Printing */}
      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/80 dark:bg-blue-950/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 tabular-nums">
            {selectedIds.length} {selectedIds.length === 1 ? 'product' : 'products'} selected for SKU barcode printing
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptics.light();
                setSelectedIds([]);
              }}
              className="px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => openLabelsStudio(selectedIds)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Generate Barcode Labels ({selectedIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Product Data Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No products match the current filters
            </div>
            <p className="text-xs text-slate-500">
              Clear your search or create a new product to populate the catalog.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      aria-label="Select all filtered products"
                      className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Product <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('sku')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      SKU / Barcode <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium text-right">Cost</th>
                  <th className="py-3 px-4 font-medium text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('sellingPrice')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Selling Price <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('stockQuantity')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Stock <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.map(({ product, categoryName, match }) => {
                  const thresholdStatus = getStockThresholdStatus(
                    product.stockQuantity,
                    product.minStockLevel,
                    product.active
                  );
                  const isOut = thresholdStatus.tier === 'out_of_stock';
                  const isLow =
                    thresholdStatus.tier === 'below_min' || thresholdStatus.tier === 'at_min';
                  const isFocused = focusedProductId === product.id;
                  const isSelected = selectedSet.has(product.id);
                  const highlights = match?.highlights;
                  return (
                    <tr
                      key={product.id}
                      className={`transition-colors ${
                        isFocused
                          ? 'bg-blue-50/70 dark:bg-blue-950/30 ring-1 ring-inset ring-blue-500/40'
                          : isSelected
                          ? 'bg-blue-50/40 dark:bg-blue-950/15 hover:bg-blue-50/70 dark:hover:bg-blue-950/25'
                          : isOut
                          ? 'bg-red-50/50 dark:bg-red-950/15 hover:bg-red-50/80 dark:hover:bg-red-950/25'
                          : isLow
                          ? 'bg-amber-50/45 dark:bg-amber-950/15 hover:bg-amber-50/75 dark:hover:bg-amber-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProductSelection(product.id)}
                          aria-label={`Select ${product.name}`}
                          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail
                            src={product.imageUrl}
                            alt={product.name}
                            size="sm"
                            className="w-10 h-10 rounded-lg shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px]">
                                <HighlightedText
                                  text={product.name}
                                  ranges={highlights?.name}
                                />
                              </span>
                              {match?.isFuzzyMatch && (
                                <span className="shrink-0 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                  Fuzzy
                                </span>
                              )}
                            </div>
                            {product.description && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                                <HighlightedText
                                  text={product.description}
                                  ranges={highlights?.description}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                        <div>
                          <HighlightedText text={product.sku} ranges={highlights?.sku} />
                        </div>
                        {product.barcode && (
                          <div className="text-[10px] text-slate-400">
                            <HighlightedText
                              text={product.barcode}
                              ranges={highlights?.barcode}
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <HighlightedText
                          text={categoryName}
                          ranges={highlights?.category}
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500 tabular-nums">
                        {formatCurrency(product.purchasePrice, currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCurrency(product.sellingPrice, currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="flex flex-col items-end gap-1">
                          <div>
                            <span
                              className={
                                isOut
                                  ? 'text-red-600 dark:text-red-400 font-bold'
                                  : isLow
                                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                  : 'text-slate-900 dark:text-slate-100 font-medium'
                              }
                            >
                              {product.stockQuantity}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {' '}
                              / min {product.minStockLevel}
                            </span>
                          </div>
                          <StockThresholdBadge
                            compact
                            stockQuantity={product.stockQuantity}
                            minStockLevel={product.minStockLevel}
                            active={product.active}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => handleToggleActive(product)}
                          className={`text-xs font-medium ${
                            canManage ? 'cursor-pointer hover:underline' : 'cursor-default'
                          } ${
                            product.active
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {product.active ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openLabelsStudio([product.id])}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer"
                            title={`Print SKU barcode label for ${product.name}`}
                            aria-label={`Print barcode label for ${product.name}`}
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => openEditModal(product)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer"
                              aria-label={`Edit ${product.name}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canManage && canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                haptics.warning();
                                void deleteProduct(product.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                              aria-label={`Delete ${product.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? 'Edit Product' : 'Add Product'}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {editing ? `Edit Product · ${editing.name}` : 'Create New Product'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  haptics.light();
                  setModalOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={140}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Location
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Default Location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    SKU
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Barcode
                  </label>
                  <input
                    type="text"
                    maxLength={64}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Purchase Price ({currency})
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Selling Price ({currency})
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Stock Quantity
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="1"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Minimum Stock Alert Level
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="1"
                    value={minStockLevel}
                    onChange={(e) => setMinStockLevel(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Product Image URL or Upload
                  </label>
                  <div className="flex items-center gap-3">
                    <ProductThumbnail
                      src={imageUrl}
                      alt={name || 'Preview'}
                      className="w-12 h-12 rounded-lg shrink-0"
                    />
                    <input
                      type="text"
                      maxLength={1000}
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="/src/assets/images/... or https://..."
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <label className="sm:col-span-2 flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  Product enabled for sale in POS Terminal
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    haptics.light();
                    setModalOpen(false);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Barcodes Modal for Standard Sticker Paper */}
      <PrintBarcodesModal
        open={labelModalOpen}
        products={products}
        initialSelectedIds={labelTargetIds}
        categories={categories}
        business={activeBusiness}
        onClose={() => setLabelModalOpen(false)}
      />
    </div>
  );
};
