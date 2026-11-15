import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem, CurrencyCode } from '../../types/nexpos';
import { formatCurrency } from '../../utils/currency';
import { haptics } from '../../utils/haptics';

interface SwipeableCartItemProps {
  item: CartItem;
  currency: CurrencyCode;
  onQuantityDelta: (productId: string, delta: number) => void;
  onRemove: (item: CartItem) => void;
  onLongPressAdjust: (item: CartItem) => void;
}

const SWIPE_DELETE_THRESHOLD = -84;
const SWIPE_MAX_LEFT = -148;
const LONG_PRESS_MS = 420;
const DRAG_START_PX = 8;

export const SwipeableCartItem: React.FC<SwipeableCartItemProps> = ({
  item,
  currency,
  onQuantityDelta,
  onRemove,
  onLongPressAdjust,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isHolding, setIsHolding] = useState(false);

  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    mode: 'idle' | 'swiping' | 'cancelled';
    crossedThreshold: boolean;
  } | null>(null);

  const holdTimerRef = useRef<number | null>(null);
  const holdVisualTimerRef = useRef<number | null>(null);
  const removeTimerRef = useRef<number | null>(null);

  const clearHoldTimers = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
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
      if (removeTimerRef.current !== null) {
        window.clearTimeout(removeTimerRef.current);
      }
    };
  }, []);

  const triggerSwipeDelete = () => {
    if (isRemoving) return;
    clearHoldTimers();
    setIsDragging(false);
    setIsRemoving(true);
    setOffsetX(-320);
    haptics.medium();
    removeTimerRef.current = window.setTimeout(() => {
      onRemove(item);
    }, 170);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isRemoving) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('button, input, select, [data-no-gesture="true"]')) {
      return;
    }

    const now = performance.now();
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastTime: now,
      velocityX: 0,
      mode: 'idle',
      crossedThreshold: false,
    };

    holdVisualTimerRef.current = window.setTimeout(() => {
      setIsHolding(true);
    }, 90);

    holdTimerRef.current = window.setTimeout(() => {
      if (gestureRef.current?.mode === 'idle') {
        gestureRef.current = null;
        clearHoldTimers();
        haptics.medium();
        onLongPressAdjust(item);
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || g.mode === 'cancelled') return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const dist = Math.hypot(dx, dy);

    if (dist > DRAG_START_PX) {
      clearHoldTimers();
    }

    if (g.mode === 'idle') {
      if (dist < DRAG_START_PX) return;

      // Vertical scroll gesture wins over swipe
      if (Math.abs(dy) >= Math.abs(dx)) {
        g.mode = 'cancelled';
        return;
      }

      // Lock horizontal swipe
      g.mode = 'swiping';
      setIsDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    }

    if (g.mode === 'swiping') {
      const now = performance.now();
      const dt = Math.max(1, now - g.lastTime);
      g.velocityX = (e.clientX - g.lastX) / dt;
      g.lastX = e.clientX;
      g.lastTime = now;

      const clamped =
        dx < 0 ? Math.max(SWIPE_MAX_LEFT, dx) : Math.min(12, Math.round(dx * 0.2));
      setOffsetX(clamped);

      const pastThreshold = clamped <= SWIPE_DELETE_THRESHOLD;
      if (pastThreshold && !g.crossedThreshold) {
        g.crossedThreshold = true;
        haptics.selection();
      } else if (!pastThreshold && g.crossedThreshold) {
        g.crossedThreshold = false;
      }
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    clearHoldTimers();
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;

    if (g.mode === 'swiping') {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }

      setIsDragging(false);
      const committed =
        offsetX <= SWIPE_DELETE_THRESHOLD ||
        (offsetX <= -42 && g.velocityX < -0.5);

      if (committed) {
        triggerSwipeDelete();
      } else {
        setOffsetX(0);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest('button, input, select')) return;
    e.preventDefault();
    clearHoldTimers();
    gestureRef.current = null;
    haptics.medium();
    onLongPressAdjust(item);
  };

  const swipeProgress = Math.min(1, Math.abs(Math.min(0, offsetX)) / Math.abs(SWIPE_DELETE_THRESHOLD));
  const readyToDelete = offsetX <= SWIPE_DELETE_THRESHOLD;

  return (
    <div
      className={`relative overflow-hidden transition-[max-height,opacity] duration-150 ${
        isRemoving ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100'
      }`}
    >
      {/* Revealed Delete Background Track */}
      <div
        className={`absolute inset-0 flex items-center justify-end px-4 transition-colors ${
          readyToDelete ? 'bg-red-600' : 'bg-red-500/90'
        }`}
        style={{ opacity: offsetX < -4 ? Math.max(0.25, swipeProgress) : 0 }}
        aria-hidden="true"
      >
        <div
          className={`flex items-center gap-1.5 text-white text-xs font-semibold transition-transform ${
            readyToDelete ? 'scale-105' : 'scale-95'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          <span>{readyToDelete ? 'Release to delete' : 'Swipe to remove'}</span>
        </div>
      </div>

      {/* Foreground Cart Line Item */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={handleContextMenu}
        style={{
          transform: `translate3d(${offsetX}px, 0, 0)`,
          touchAction: 'pan-y',
        }}
        className={`relative p-3.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 select-none ${
          isDragging
            ? 'transition-none'
            : 'transition-transform duration-200 ease-out'
        } ${isHolding ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {item.product.name}
            </span>
            {item.isCustom && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                Custom
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">
            {formatCurrency(item.product.sellingPrice, currency)} each
            {item.isCustom ? ' · Non-inventoried' : ''}
          </div>
        </div>

        {/* Touch-friendly Quantity Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onQuantityDelta(item.product.id, -1)}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label={`Decrease quantity for ${item.product.name}`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              onLongPressAdjust(item);
            }}
            title="Tap or hold row to set exact quantity"
            aria-label={`Quantity ${item.quantity} for ${item.product.name}. Click to edit quantity`}
            className="w-8 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-center text-xs font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 cursor-pointer"
          >
            {item.quantity}
          </button>
          <button
            type="button"
            onClick={() => onQuantityDelta(item.product.id, 1)}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label={`Increase quantity for ${item.product.name}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-right shrink-0 min-w-[76px]">
          <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {formatCurrency(item.product.sellingPrice * item.quantity, currency)}
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.medium();
              onRemove(item);
            }}
            className="text-[11px] text-slate-400 hover:text-red-600 inline-flex items-center gap-0.5 mt-0.5 cursor-pointer"
            aria-label={`Remove ${item.product.name}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
