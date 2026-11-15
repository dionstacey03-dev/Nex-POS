import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';

export type StockThresholdTier =
  | 'out_of_stock'
  | 'below_min'
  | 'at_min'
  | 'healthy'
  | 'inactive';

export interface StockThresholdStatus {
  tier: StockThresholdTier;
  deficit: number;
  label: string;
  shortLabel: string;
}

export function getStockThresholdStatus(
  stockQuantity: number,
  minStockLevel: number,
  active = true
): StockThresholdStatus {
  if (!active) {
    return {
      tier: 'inactive',
      deficit: 0,
      label: 'Disabled',
      shortLabel: 'Disabled',
    };
  }

  const deficit = Math.max(0, minStockLevel - stockQuantity);

  if (stockQuantity === 0) {
    return {
      tier: 'out_of_stock',
      deficit,
      label: minStockLevel > 0 ? `Out of Stock (-${minStockLevel})` : 'Out of Stock',
      shortLabel: 'Out of Stock',
    };
  }

  if (stockQuantity < minStockLevel) {
    return {
      tier: 'below_min',
      deficit,
      label: `Below Min (-${deficit})`,
      shortLabel: `Below Min (-${deficit})`,
    };
  }

  if (stockQuantity === minStockLevel && minStockLevel > 0) {
    return {
      tier: 'at_min',
      deficit: 0,
      label: 'At Min Level',
      shortLabel: 'At Min',
    };
  }

  return {
    tier: 'healthy',
    deficit: 0,
    label: 'Healthy',
    shortLabel: 'Healthy',
  };
}

interface StockThresholdBadgeProps {
  stockQuantity: number;
  minStockLevel: number;
  active?: boolean;
  showHealthy?: boolean;
  compact?: boolean;
  className?: string;
}

export const StockThresholdBadge: React.FC<StockThresholdBadgeProps> = ({
  stockQuantity,
  minStockLevel,
  active = true,
  showHealthy = false,
  compact = false,
  className = '',
}) => {
  const status = getStockThresholdStatus(stockQuantity, minStockLevel, active);

  if (status.tier === 'inactive') return null;
  if (status.tier === 'healthy' && !showHealthy) return null;

  const styleMap: Record<Exclude<StockThresholdTier, 'inactive'>, string> = {
    out_of_stock:
      'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800/80 text-red-700 dark:text-red-300',
    below_min:
      'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800/80 text-amber-800 dark:text-amber-300',
    at_min:
      'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-300 dark:border-yellow-800/70 text-yellow-800 dark:text-yellow-300',
    healthy:
      'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-400',
  };

  const Icon =
    status.tier === 'out_of_stock'
      ? AlertOctagon
      : status.tier === 'healthy'
      ? CheckCircle2
      : AlertTriangle;

  return (
    <span
      title={`On hand: ${stockQuantity} · Minimum threshold: ${minStockLevel}`}
      className={`inline-flex items-center gap-1 rounded-md border font-semibold whitespace-nowrap tabular-nums ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${styleMap[status.tier]} ${className}`}
    >
      <Icon className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
      <span>{compact ? status.shortLabel : status.label}</span>
    </span>
  );
};
