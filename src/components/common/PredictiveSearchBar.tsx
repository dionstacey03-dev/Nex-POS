import React, { useEffect, useId, useRef, useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { TextRange } from '../../utils/fuzzySearch';
import { haptics } from '../../utils/haptics';
import { HighlightedText } from './HighlightedText';
import { ProductThumbnail } from './ProductThumbnail';
import { StockThresholdBadge } from './StockThresholdBadge';

export interface PredictiveSuggestionItem {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  secondaryMeta?: string;
  imageUrl?: string;
  priceText?: string;
  stockQuantity: number;
  minStockLevel: number;
  active: boolean;
  isFuzzyMatch: boolean;
  highlights: {
    name: TextRange[];
    sku: TextRange[];
    barcode?: TextRange[];
    secondaryMeta?: TextRange[];
  };
  actionLabel?: string;
  onAction?: () => void;
}

interface PredictiveSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions: PredictiveSuggestionItem[];
  totalMatches: number;
  fuzzyCount: number;
  onSelectSuggestion: (item: PredictiveSuggestionItem) => void;
  showThumbnails?: boolean;
  compact?: boolean;
  className?: string;
  ariaLabel?: string;
}

export const PredictiveSearchBar: React.FC<PredictiveSearchBarProps> = ({
  value,
  onChange,
  placeholder,
  suggestions,
  totalMatches,
  fuzzyCount,
  onSelectSuggestion,
  showThumbnails = false,
  compact = false,
  className = '',
  ariaLabel = 'Predictive product search',
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const hasQuery = value.trim().length > 0;
  const showDropdown = open && hasQuery;

  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 0 : -1);
  }, [value, suggestions.length]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSelect = (item: PredictiveSuggestionItem) => {
    haptics.selection();
    onSelectSuggestion(item);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && hasQuery) {
      setOpen(true);
      return;
    }

    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        haptics.selection();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        haptics.selection();
        setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search
          className={`${
            compact ? 'w-3.5 h-3.5 left-3' : 'w-4 h-4 left-3'
          } text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none`}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-label={ariaLabel}
          value={value}
          onFocus={() => {
            if (hasQuery) setOpen(true);
          }}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next);
            setOpen(next.trim().length > 0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 ${
            compact
              ? 'pl-8 pr-20 py-1.5 text-xs'
              : 'pl-9 pr-24 py-2 text-sm'
          }`}
        />

        {hasQuery && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 pointer-events-none">
              {totalMatches}
            </span>
            <button
              type="button"
              onClick={() => {
                haptics.light();
                onChange('');
                setOpen(false);
                inputRef.current?.focus();
              }}
              aria-label="Clear search filter"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Real-time Predictive Results Popover */}
      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-30 min-w-[290px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        >
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-medium tabular-nums">
              {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
              {fuzzyCount > 0 && (
                <span className="ml-1.5 text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5">
                  <Sparkles className="w-3 h-3" />
                  {fuzzyCount} fuzzy
                </span>
              )}
            </span>
            <span className="hidden sm:inline text-[10px] text-slate-400">
              ↑↓ navigate · Enter select · Esc close
            </span>
          </div>

          {suggestions.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
              No close matches for &ldquo;{value.trim()}&rdquo; under active filters.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {suggestions.map((item, idx) => {
                const isLow = item.active && item.stockQuantity <= item.minStockLevel;
                const isOut = item.active && item.stockQuantity === 0;
                const isActive = idx === activeIndex;

                return (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(item)}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-blue-50/80 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {showThumbnails ? (
                        <ProductThumbnail
                          src={item.imageUrl}
                          alt={item.name}
                          size="sm"
                          className="w-8 h-8 rounded-lg shrink-0"
                        />
                      ) : (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isOut
                              ? 'bg-red-500'
                              : isLow
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            <HighlightedText text={item.name} ranges={item.highlights.name} />
                          </span>
                          {item.isFuzzyMatch && (
                            <span className="shrink-0 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                              Typo match
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>
                            <HighlightedText text={item.sku} ranges={item.highlights.sku} />
                          </span>
                          {item.barcode && (
                            <span className="text-slate-400">
                              ·{' '}
                              <HighlightedText
                                text={item.barcode}
                                ranges={item.highlights.barcode}
                              />
                            </span>
                          )}
                          {item.secondaryMeta && (
                            <span className="font-sans text-slate-500 dark:text-slate-400">
                              ·{' '}
                              <HighlightedText
                                text={item.secondaryMeta}
                                ranges={item.highlights.secondaryMeta}
                              />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right tabular-nums space-y-0.5">
                        {item.priceText && (
                          <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {item.priceText}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1.5">
                          <StockThresholdBadge
                            compact
                            stockQuantity={item.stockQuantity}
                            minStockLevel={item.minStockLevel}
                            active={item.active}
                          />
                          {(!item.active || item.stockQuantity > item.minStockLevel) && (
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {item.stockQuantity} in stock
                            </span>
                          )}
                        </div>
                      </div>

                      {item.actionLabel && item.onAction && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            haptics.light();
                            setOpen(false);
                            item.onAction?.();
                          }}
                          className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-500 text-[11px] font-semibold text-blue-600 dark:text-blue-400 cursor-pointer"
                        >
                          {item.actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
