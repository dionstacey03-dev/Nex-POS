import React, { useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  CheckSquare,
  Minus,
  Plus,
  Printer,
  Search,
  Square,
  X,
} from 'lucide-react';
import { Business, Category, Product } from '../../types/nexpos';
import { encodeCode128B } from '../../utils/barcode';
import { formatCurrency } from '../../utils/currency';
import { scoreProductFuzzyMatch } from '../../utils/fuzzySearch';
import { haptics } from '../../utils/haptics';
import { HighlightedText } from './HighlightedText';

export type StickerPaperId =
  | 'avery-5160'
  | 'avery-5163'
  | 'a4-21'
  | 'a4-24'
  | 'thermal-50x30';

interface StickerPaperPreset {
  id: StickerPaperId;
  name: string;
  spec: string;
  pageWidth: string;
  pageMinHeight: string;
  pagePadding: string;
  columns: number;
  labelsPerPage: number;
  columnGap: string;
  rowGap: string;
  labelHeight: string;
  barcodeHeightPx: number;
  compactText: boolean;
}

const STICKER_PRESETS: Record<StickerPaperId, StickerPaperPreset> = {
  'avery-5160': {
    id: 'avery-5160',
    name: 'Avery 5160 (US Letter · 30-up)',
    spec: '3 × 10 grid · 2.625" × 1" (66.7 × 25.4 mm)',
    pageWidth: '8.5in',
    pageMinHeight: '11in',
    pagePadding: '0.5in 0.1875in',
    columns: 3,
    labelsPerPage: 30,
    columnGap: '0.125in',
    rowGap: '0in',
    labelHeight: '1in',
    barcodeHeightPx: 26,
    compactText: true,
  },
  'avery-5163': {
    id: 'avery-5163',
    name: 'Avery 5163 (US Letter · 10-up)',
    spec: '2 × 5 grid · 4" × 2" (101.6 × 50.8 mm)',
    pageWidth: '8.5in',
    pageMinHeight: '11in',
    pagePadding: '0.5in 0.16in',
    columns: 2,
    labelsPerPage: 10,
    columnGap: '0.18in',
    rowGap: '0in',
    labelHeight: '2in',
    barcodeHeightPx: 54,
    compactText: false,
  },
  'a4-21': {
    id: 'a4-21',
    name: 'A4 Standard (21-up · L7160)',
    spec: '3 × 7 grid · 63.5 × 38.1 mm',
    pageWidth: '210mm',
    pageMinHeight: '297mm',
    pagePadding: '15.15mm 7.25mm',
    columns: 3,
    labelsPerPage: 21,
    columnGap: '2.5mm',
    rowGap: '0mm',
    labelHeight: '38.1mm',
    barcodeHeightPx: 38,
    compactText: false,
  },
  'a4-24': {
    id: 'a4-24',
    name: 'A4 Address/SKU (24-up)',
    spec: '3 × 8 grid · 70 × 37 mm',
    pageWidth: '210mm',
    pageMinHeight: '297mm',
    pagePadding: '0.5mm 0mm',
    columns: 3,
    labelsPerPage: 24,
    columnGap: '0mm',
    rowGap: '0mm',
    labelHeight: '37mm',
    barcodeHeightPx: 36,
    compactText: false,
  },
  'thermal-50x30': {
    id: 'thermal-50x30',
    name: 'Thermal Sticker Roll (50 × 30 mm)',
    spec: 'Single column roll · 50 × 30 mm',
    pageWidth: '50mm',
    pageMinHeight: 'auto',
    pagePadding: '0mm',
    columns: 1,
    labelsPerPage: 100,
    columnGap: '0mm',
    rowGap: '2mm',
    labelHeight: '30mm',
    barcodeHeightPx: 32,
    compactText: true,
  },
};

export interface PrintBarcodesModalProps {
  open: boolean;
  products: Product[];
  initialSelectedIds?: string[];
  categories: Category[];
  business: Business | null;
  onClose: () => void;
}

const MAX_COPIES_PER_PRODUCT = 100;

interface RenderedLabelSlot {
  key: string;
  blank: boolean;
  product?: Product;
  categoryName?: string;
  encoded?: ReturnType<typeof encodeCode128B>;
}

export const PrintBarcodesModal: React.FC<PrintBarcodesModalProps> = ({
  open,
  products,
  initialSelectedIds = [],
  categories,
  business,
  onClose,
}) => {
  const currency = business?.currency ?? 'LKR';

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [listSearch, setListSearch] = useState('');
  const [paperId, setPaperId] = useState<StickerPaperId>('a4-21');
  const [skipSlots, setSkipSlots] = useState<number>(0);
  const [showBusinessName, setShowBusinessName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showCategory, setShowCategory] = useState(false);
  const [showPrintBorders, setShowPrintBorders] = useState(false);
  const [customHeaderNote, setCustomHeaderNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const validIds = new Set(products.map((p) => p.id));
    const seedIds = initialSelectedIds.filter((id) => validIds.has(id));
    setSelectedIds(seedIds);
    setQuantities((prev) => {
      const next: Record<string, number> = {};
      for (const p of products) {
        next[p.id] = prev[p.id] ?? 1;
      }
      return next;
    });
    setListSearch('');
  }, [open, products, initialSelectedIds]);

  const preset = STICKER_PRESETS[paperId];

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  const filteredProductList = useMemo(() => {
    const q = listSearch.trim();
    const list = products.map((p) => {
      const categoryName = categoryNameById.get(p.categoryId) ?? 'General';
      if (!q) {
        return { product: p, categoryName, match: null };
      }
      const match = scoreProductFuzzyMatch(
        p,
        {
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          categoryName,
        },
        q
      );
      return match ? { product: p, categoryName, match } : null;
    });

    const compact = list.filter((x): x is NonNullable<typeof x> => x !== null);
    if (q) {
      compact.sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));
    }
    return compact;
  }, [products, categoryNameById, listSearch]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedProducts = useMemo(
    () => products.filter((p) => selectedSet.has(p.id)),
    [products, selectedSet]
  );

  const encodedByProduct = useMemo(() => {
    const map = new Map<string, ReturnType<typeof encodeCode128B>>();
    for (const p of selectedProducts) {
      map.set(p.id, encodeCode128B(p.sku));
    }
    return map;
  }, [selectedProducts]);

  const totalLabelsCount = useMemo(() => {
    return selectedProducts.reduce(
      (sum, p) => sum + Math.max(1, Math.min(MAX_COPIES_PER_PRODUCT, quantities[p.id] ?? 1)),
      0
    );
  }, [selectedProducts, quantities]);

  const pages = useMemo(() => {
    if (selectedProducts.length === 0) return [];

    const slots: RenderedLabelSlot[] = [];
    const safeSkip = Math.max(0, Math.min(preset.labelsPerPage - 1, skipSlots));
    for (let s = 0; s < safeSkip; s++) {
      slots.push({ key: `skip-${s}`, blank: true });
    }

    for (const p of selectedProducts) {
      const count = Math.max(1, Math.min(MAX_COPIES_PER_PRODUCT, quantities[p.id] ?? 1));
      const encoded = encodedByProduct.get(p.id);
      if (!encoded) continue;
      const categoryName = categoryNameById.get(p.categoryId) ?? 'General';
      for (let i = 0; i < count; i++) {
        slots.push({
          key: `${p.id}-${i}`,
          blank: false,
          product: p,
          categoryName,
          encoded,
        });
      }
    }

    if (preset.id === 'thermal-50x30') {
      return [slots];
    }

    const chunked: RenderedLabelSlot[][] = [];
    for (let i = 0; i < slots.length; i += preset.labelsPerPage) {
      chunked.push(slots.slice(i, i + preset.labelsPerPage));
    }
    return chunked;
  }, [selectedProducts, quantities, encodedByProduct, categoryNameById, preset, skipSlots]);

  if (!open) return null;

  const toggleProduct = (id: string) => {
    haptics.selection();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    haptics.selection();
    const visibleIds = filteredProductList.map((e) => e.product.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const clearSelected = () => {
    haptics.light();
    setSelectedIds([]);
  };

  const updateQty = (productId: string, nextVal: number) => {
    const clamped = Math.max(1, Math.min(MAX_COPIES_PER_PRODUCT, Math.floor(nextVal) || 1));
    setQuantities((prev) => ({ ...prev, [productId]: clamped }));
  };

  const applyOneEach = () => {
    haptics.selection();
    const next = { ...quantities };
    for (const p of selectedProducts) next[p.id] = 1;
    setQuantities(next);
  };

  const applyMatchStock = () => {
    haptics.selection();
    const next = { ...quantities };
    for (const p of selectedProducts) {
      next[p.id] = Math.max(1, Math.min(MAX_COPIES_PER_PRODUCT, p.stockQuantity || 1));
    }
    setQuantities(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Print SKU Barcode Sticker Labels"
    >
      <div className="w-full max-w-6xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col h-[92vh]">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Print SKU Barcode Labels
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {selectedProducts.length} {selectedProducts.length === 1 ? 'product' : 'products'} selected ·{' '}
                {totalLabelsCount} {totalLabelsCount === 1 ? 'sticker' : 'stickers'} across{' '}
                {Math.max(1, pages.length)} {pages.length === 1 ? 'sheet' : 'sheets'} ({preset.name})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={totalLabelsCount === 0}
              onClick={() => {
                haptics.medium();
                window.print();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Sticker Sheet ({totalLabelsCount})
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.light();
                onClose();
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close print barcodes modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Split Workspace */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
          {/* Left Panel: Product Selector + Sticker Paper Options */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-5 space-y-5 bg-white dark:bg-slate-900">
            {/* Step 1: Select Products from Catalog */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  1. Select Products ({selectedProducts.length}/{products.length})
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Select Visible
                  </button>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={clearSelected}
                      className="font-medium text-slate-500 hover:text-red-600 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Filter product list by name or SKU..."
                  className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {listSearch && (
                  <button
                    type="button"
                    onClick={() => setListSearch('')}
                    aria-label="Clear product list filter"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto bg-slate-50/40 dark:bg-slate-950/40">
                {filteredProductList.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No matching products in catalog.
                  </div>
                ) : (
                  filteredProductList.map(({ product, categoryName, match }) => {
                    const isChecked = selectedSet.has(product.id);
                    const qty = quantities[product.id] ?? 1;

                    return (
                      <div
                        key={product.id}
                        onClick={() => toggleProduct(product.id)}
                        className={`px-3 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-blue-50/70 dark:bg-blue-950/30'
                            : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              <HighlightedText
                                text={product.name}
                                ranges={match?.highlights.name}
                              />
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              <HighlightedText
                                text={product.sku}
                                ranges={match?.highlights.sku}
                              />{' '}
                              · <span className="font-sans">{categoryName}</span> · Stock:{' '}
                              {product.stockQuantity}
                            </div>
                          </div>
                        </div>

                        {isChecked && (
                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                haptics.light();
                                updateQty(product.id, qty - 1);
                              }}
                              className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              aria-label={`Decrease copies for ${product.name}`}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={MAX_COPIES_PER_PRODUCT}
                              value={qty}
                              onChange={(e) => updateQty(product.id, Number(e.target.value))}
                              aria-label={`Copies for ${product.name}`}
                              className="w-10 h-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center text-[11px] font-mono font-semibold tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                haptics.light();
                                updateQty(product.id, qty + 1);
                              }}
                              className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              aria-label={`Increase copies for ${product.name}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {selectedProducts.length > 0 && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Batch copy presets:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={applyOneEach}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      1 Each
                    </button>
                    <button
                      type="button"
                      onClick={applyMatchStock}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Match Stock Qty
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Sticker Paper Format */}
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                2. Standard Sticker Paper Format
              </div>

              <div>
                <label
                  htmlFor="sticker-paper-select"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Paper / Label Sheet Template
                </label>
                <select
                  id="sticker-paper-select"
                  value={paperId}
                  onChange={(e) => {
                    haptics.selection();
                    setPaperId(e.target.value as StickerPaperId);
                    setSkipSlots(0);
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {Object.values(STICKER_PRESETS).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {preset.spec}
                </p>
              </div>

              {preset.id !== 'thermal-50x30' && (
                <div>
                  <label
                    htmlFor="sticker-skip-slots"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Skip Used Sticker Slots (Partial Sheet Offset)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="sticker-skip-slots"
                      type="number"
                      min={0}
                      max={preset.labelsPerPage - 1}
                      value={skipSlots}
                      onChange={(e) =>
                        setSkipSlots(
                          Math.max(
                            0,
                            Math.min(preset.labelsPerPage - 1, Math.floor(Number(e.target.value)) || 0)
                          )
                        )
                      }
                      className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono tabular-nums"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      leaves first {skipSlots} {skipSlots === 1 ? 'slot' : 'slots'} blank
                    </span>
                  </div>
                </div>
              )}

              {/* Content Toggles */}
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
                {[
                  { label: 'Store Name', checked: showBusinessName, set: setShowBusinessName },
                  { label: 'Product Name', checked: showProductName, set: setShowProductName },
                  { label: 'Selling Price', checked: showPrice, set: setShowPrice },
                  { label: 'Category', checked: showCategory, set: setShowCategory },
                  { label: 'Print Cut Guides', checked: showPrintBorders, set: setShowPrintBorders },
                ].map((opt) => (
                  <label
                    key={opt.label}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={(e) => {
                        haptics.selection();
                        opt.set(e.target.checked);
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="truncate text-[11px]">{opt.label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label
                  htmlFor="sticker-custom-note"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Custom Tagline (Optional)
                </label>
                <input
                  id="sticker-custom-note"
                  type="text"
                  maxLength={28}
                  value={customHeaderNote}
                  onChange={(e) => setCustomHeaderNote(e.target.value)}
                  placeholder="e.g. SALE, NEW ARRIVAL..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Right Panel: Exact Sticker Sheet Print Preview */}
          <div className="lg:col-span-7 overflow-auto p-6 bg-slate-100 dark:bg-slate-950/80">
            {pages.length === 0 ? (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-slate-500">
                <Barcode className="w-11 h-11 mb-3 opacity-35" />
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Select products on the left to preview sticker labels
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  Each label encodes the product&apos;s SKU as a scannable Code 128B barcode formatted for standard sticker sheets.
                </p>
              </div>
            ) : (
              <div id="nexpos-printable-labels" className="space-y-6">
                {pages.map((pageSlots, pageIdx) => (
                  <div key={`sheet-${pageIdx}`} className="nexpos-sticker-page space-y-2">
                    <div className="nexpos-print-hidden flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400 max-w-full">
                      <span>
                        Sheet {pageIdx + 1} of {pages.length} · {preset.name}
                      </span>
                      <span>
                        {pageSlots.filter((s) => !s.blank).length} labels on sheet
                      </span>
                    </div>

                    <div
                      className="nexpos-sticker-sheet mx-auto bg-white text-slate-900 shadow-md border border-slate-200 box-border"
                      style={{
                        width: preset.pageWidth,
                        maxWidth: '100%',
                        minHeight:
                          preset.pageMinHeight === 'auto' ? undefined : preset.pageMinHeight,
                        padding: preset.pagePadding,
                      }}
                    >
                      <div
                        className="grid"
                        style={{
                          gridTemplateColumns: `repeat(${preset.columns}, minmax(0, 1fr))`,
                          columnGap: preset.columnGap,
                          rowGap: preset.rowGap,
                        }}
                      >
                        {pageSlots.map((slot) =>
                          slot.blank ? (
                            <div
                              key={slot.key}
                              className="nexpos-barcode-label box-border rounded border border-dashed border-slate-200/80 opacity-40"
                              style={{ height: preset.labelHeight }}
                              aria-hidden="true"
                            />
                          ) : (
                            <div
                              key={slot.key}
                              className={`nexpos-barcode-label box-border rounded bg-white text-slate-900 flex flex-col justify-between overflow-hidden ${
                                showPrintBorders
                                  ? 'border border-dashed border-slate-300'
                                  : 'border border-dashed border-slate-200 print:border-transparent'
                              } ${preset.compactText ? 'px-2 py-1.5' : 'px-3 py-2'}`}
                              style={{ height: preset.labelHeight }}
                            >
                              {/* Top Info */}
                              <div className="min-w-0 text-center space-y-0.5">
                                {(showBusinessName || customHeaderNote.trim()) && (
                                  <div className="flex items-center justify-between gap-1 text-[8px] uppercase tracking-wider text-slate-500 font-semibold leading-none">
                                    <span className="truncate">
                                      {showBusinessName ? business?.name ?? 'NexPOS' : ''}
                                    </span>
                                    {customHeaderNote.trim() && (
                                      <span className="shrink-0 font-bold text-slate-900">
                                        {customHeaderNote.trim()}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {showProductName && slot.product && (
                                  <div
                                    className={`font-semibold text-slate-900 truncate leading-tight ${
                                      preset.compactText ? 'text-[10px]' : 'text-xs'
                                    }`}
                                  >
                                    {slot.product.name}
                                  </div>
                                )}

                                {showCategory && slot.categoryName && (
                                  <div className="text-[8px] text-slate-500 truncate leading-none">
                                    {slot.categoryName}
                                  </div>
                                )}
                              </div>

                              {/* Vector Code 128B SKU Barcode */}
                              {slot.encoded && (
                                <div className="flex items-center justify-center my-0.5 min-h-0">
                                  <svg
                                    viewBox={`0 0 ${slot.encoded.totalModules} ${preset.barcodeHeightPx}`}
                                    className="w-full max-w-full"
                                    style={{ height: `${preset.barcodeHeightPx}px` }}
                                    shapeRendering="crispEdges"
                                    role="img"
                                    aria-label={`SKU barcode ${slot.encoded.value}`}
                                  >
                                    <rect
                                      x={0}
                                      y={0}
                                      width={slot.encoded.totalModules}
                                      height={preset.barcodeHeightPx}
                                      fill="#ffffff"
                                    />
                                    {slot.encoded.bars.map((bar, idx) => (
                                      <rect
                                        key={idx}
                                        x={bar.x}
                                        y={0}
                                        width={bar.width}
                                        height={preset.barcodeHeightPx}
                                        fill="#000000"
                                      />
                                    ))}
                                  </svg>
                                </div>
                              )}

                              {/* Bottom SKU + Price */}
                              {slot.product && slot.encoded && (
                                <div className="flex items-baseline justify-between gap-1.5 leading-none">
                                  <span
                                    className={`font-mono text-slate-800 truncate ${
                                      preset.compactText ? 'text-[9px]' : 'text-[10px]'
                                    }`}
                                  >
                                    {slot.encoded.value}
                                  </span>
                                  {showPrice && (
                                    <span
                                      className={`font-mono font-bold text-slate-900 tabular-nums shrink-0 ${
                                        preset.compactText ? 'text-[10px]' : 'text-xs'
                                      }`}
                                    >
                                      {formatCurrency(slot.product.sellingPrice, currency)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
