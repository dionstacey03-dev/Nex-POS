import React, { useEffect, useState } from 'react';
import { Check, Minus, Plus, Trash2, X } from 'lucide-react';
import { CurrencyCode, Product } from '../../types/nexpos';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { haptics } from '../../utils/haptics';
import { ProductThumbnail } from './ProductThumbnail';

interface QuickQuantityModalProps {
  open: boolean;
  product: Product | null;
  currentCartQty: number;
  isCustom?: boolean;
  currency: CurrencyCode;
  onClose: () => void;
  onApplyQuantity: (product: Product, nextQty: number, isCustom?: boolean) => void;
}

export const QuickQuantityModal: React.FC<QuickQuantityModalProps> = ({
  open,
  product,
  currentCartQty,
  isCustom = false,
  currency,
  onClose,
  onApplyQuantity,
}) => {
  const maxAllowed =
    !product || isCustom ? 9999 : Math.max(0, product.stockQuantity);

  const [qtyInput, setQtyInput] = useState<string>('1');

  useEffect(() => {
    if (!open || !product) return;
    const initial = currentCartQty > 0 ? currentCartQty : 1;
    setQtyInput(String(isCustom ? initial : Math.min(maxAllowed, initial)));
  }, [open, product, currentCartQty, isCustom, maxAllowed]);

  if (!open || !product) return null;

  const parsedQty = Math.max(0, Math.floor(Number(qtyInput) || 0));
  const clampedQty = isCustom ? parsedQty : Math.min(maxAllowed, parsedQty);
  const lineTotal = roundMoney(clampedQty * product.sellingPrice);

  const setSafeQuantity = (val: number) => {
    const next = Math.max(0, isCustom ? Math.floor(val) : Math.min(maxAllowed, Math.floor(val)));
    if (!isCustom && val > maxAllowed) {
      haptics.warning();
    } else {
      haptics.selection();
    }
    setQtyInput(String(next));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCustom && parsedQty > maxAllowed) {
      haptics.warning();
      setQtyInput(String(maxAllowed));
      return;
    }
    onApplyQuantity(product, clampedQty, isCustom);
  };

  const quickPresets = [1, 2, 3, 5, 10, 12].filter(
    (n) => isCustom || n <= maxAllowed
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Quick quantity adjustment for ${product.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          haptics.light();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            {!isCustom && (
              <ProductThumbnail
                src={product.imageUrl}
                alt={product.name}
                size="sm"
                className="w-10 h-10 rounded-lg shrink-0"
              />
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {product.name}
              </h3>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {formatCurrency(product.sellingPrice, currency)} each ·{' '}
                {isCustom ? 'Custom item' : `${maxAllowed} in stock`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.light();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
            aria-label="Close quantity adjuster"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Large Touch Stepper + Direct Input */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Order Quantity
              </span>
              {currentCartQty > 0 && (
                <span className="font-mono text-slate-500 tabular-nums">
                  Currently in cart: {currentCartQty}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSafeQuantity(clampedQty - 1)}
                disabled={clampedQty <= 0}
                className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                aria-label="Decrease quantity"
              >
                <Minus className="w-5 h-5" />
              </button>

              <input
                type="number"
                min={0}
                max={isCustom ? undefined : maxAllowed}
                value={qtyInput}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setQtyInput('');
                    return;
                  }
                  const num = Math.max(0, Math.floor(Number(raw) || 0));
                  if (!isCustom && num > maxAllowed) {
                    haptics.warning();
                    setQtyInput(String(maxAllowed));
                  } else {
                    setQtyInput(String(num));
                  }
                }}
                aria-label="Quantity value"
                className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-center text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />

              <button
                type="button"
                onClick={() => setSafeQuantity(clampedQty + 1)}
                disabled={!isCustom && clampedQty >= maxAllowed}
                className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                aria-label="Increase quantity"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Preset Quantities + Delta Boosts */}
          <div className="space-y-2">
            {quickPresets.length > 0 && (
              <div className="grid grid-cols-6 gap-1.5">
                {quickPresets.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSafeQuantity(n)}
                    className={`py-2 rounded-lg border text-xs font-mono font-semibold tabular-nums transition-colors cursor-pointer ${
                      clampedQty === n
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {[2, 5, 10].map((inc) => (
                <button
                  key={inc}
                  type="button"
                  disabled={!isCustom && clampedQty >= maxAllowed}
                  onClick={() => setSafeQuantity(clampedQty + inc)}
                  className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  +{inc}
                </button>
              ))}
            </div>
          </div>

          {/* Live Line Total */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Line Total ({clampedQty} × {formatCurrency(product.sellingPrice, currency)})
            </span>
            <span className="text-base font-mono font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {formatCurrency(lineTotal, currency)}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {currentCartQty > 0 && (
              <button
                type="button"
                onClick={() => {
                  haptics.medium();
                  onApplyQuantity(product, 0, isCustom);
                }}
                className="px-3.5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/80 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 text-xs font-semibold text-red-700 dark:text-red-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                haptics.light();
                onClose();
              }}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="flex-[1.5] py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {clampedQty === 0
                ? 'Remove Item'
                : currentCartQty > 0
                ? `Update to ${clampedQty}`
                : `Add ${clampedQty} to Cart`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
