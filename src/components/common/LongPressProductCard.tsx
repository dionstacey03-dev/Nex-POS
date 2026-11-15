import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { CurrencyCode, Product } from '../../types/nexpos';
import { formatCurrency } from '../../utils/currency';
import { haptics } from '../../utils/haptics';
import { ProductThumbnail } from './ProductThumbnail';

interface LongPressProductCardProps {
  product: Product;
  currency: CurrencyCode;
  inCartQty: number;
  onTapAdd: (product: Product) => void;
  onLongPressAdjust: (product: Product) => void;
}

const LONG_PRESS_MS = 420;
const MOVE_CANCEL_PX = 10;

export const LongPressProductCard: React.FC<LongPressProductCardProps> = ({
  product,
  currency,
  inCartQty,
  onTapAdd,
  onLongPressAdjust,
}) => {
  const outOfStock = product.stockQuantity <= 0;

  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const holdVisualTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const suppressResetTimerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const clearHoldTimers = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (holdVisualTimerRef.current !== null) {
      window.clearTimeout(holdVisualTimerRef.current);
      holdVisualTimerRef.current = null;
    }
    setIsHolding(false);
  };

  useEffect(() => {
    return () => {
      clearHoldTimers();
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
    };
  }, []);

  const triggerLongPress = () => {
    clearHoldTimers();
    startPosRef.current = null;
    suppressClickRef.current = true;
    if (suppressResetTimerRef.current !== null) {
      window.clearTimeout(suppressResetTimerRef.current);
    }
    suppressResetTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 600);
    haptics.medium();
    onLongPressAdjust(product);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (outOfStock) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    startPosRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };

    // Small delay before showing hold progress bar so quick taps feel crisp
    holdVisualTimerRef.current = window.setTimeout(() => {
      setIsHolding(true);
    }, 90);

    timerRef.current = window.setTimeout(() => {
      triggerLongPress();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = startPosRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (dist > MOVE_CANCEL_PX) {
      startPosRef.current = null;
      clearHoldTimers();
    }
  };

  const handlePointerEnd = () => {
    startPosRef.current = null;
    clearHoldTimers();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (outOfStock) return;
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
      return;
    }
    onTapAdd(product);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (outOfStock) return;
    e.preventDefault();
    startPosRef.current = null;
    clearHoldTimers();
    haptics.medium();
    onLongPressAdjust(product);
  };

  return (
    <button
      type="button"
      disabled={outOfStock}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      aria-label={`${product.name}, ${formatCurrency(product.sellingPrice, currency)}${
        inCartQty > 0 ? `, ${inCartQty} in cart` : ''
      }. Tap to add 1, hold or right-click to adjust quantity.`}
      className={`group relative text-left rounded-xl border transition-all overflow-hidden flex flex-col cursor-pointer touch-manipulation select-none ${
        isHolding ? 'scale-[0.97] ring-2 ring-blue-500/70' : 'active:scale-[0.98]'
      } ${
        outOfStock
          ? 'border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/40 opacity-60 cursor-not-allowed'
          : inCartQty > 0
          ? 'border-blue-600 bg-white dark:bg-slate-900 ring-1 ring-blue-600'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-500'
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <ProductThumbnail
          src={product.imageUrl}
          alt={product.name}
          size="lg"
          className="w-full h-full group-hover:scale-105 transition-transform duration-200 pointer-events-none"
        />
        {inCartQty > 0 && (
          <div className="absolute top-2 right-2 min-w-[26px] h-6 px-2 rounded-lg bg-blue-600 text-white text-xs font-mono font-bold flex items-center justify-center shadow-sm tabular-nums">
            {inCartQty}
          </div>
        )}
        {!outOfStock && (
          <div
            className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded-md bg-slate-950/75 text-white text-[10px] font-medium inline-flex items-center gap-1 pointer-events-none"
            aria-hidden="true"
          >
            <SlidersHorizontal className="w-2.5 h-2.5" />
            Hold for qty
          </div>
        )}
      </div>

      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug">
            {product.name}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
            {product.sku} ·{' '}
            <span
              className={
                outOfStock
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : product.stockQuantity <= product.minStockLevel
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : ''
              }
            >
              {outOfStock ? 'Out of stock' : `${product.stockQuantity} in stock`}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
            {formatCurrency(product.sellingPrice, currency)}
          </span>
          {inCartQty > 0 && (
            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
              Hold to edit
            </span>
          )}
        </div>
      </div>

      {/* Long-Press Hold Progress Indicator */}
      {isHolding && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-blue-100 dark:bg-blue-950 overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <div
            className="h-full bg-blue-600 dark:bg-blue-400 origin-left"
            style={{
              animation: `nexposHoldFill ${LONG_PRESS_MS - 90}ms linear forwards`,
            }}
          />
        </div>
      )}
    </button>
  );
};
