import { CartItem, CurrencyCode, DiscountConfig } from '../types/nexpos';

export interface CurrencyConfig {
  code: CurrencyCode;
  name: string;
  symbol: string;
  locale: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'LKR', locale: 'en-LK', decimals: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', locale: 'en-US', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', locale: 'en-IE', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', locale: 'en-GB', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', locale: 'en-AU', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', locale: 'en-SG', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', locale: 'en-IN', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', locale: 'ja-JP', decimals: 0 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', locale: 'en-AE', decimals: 2 },
];

let activeRegionLocale: string | undefined;

export function setActiveFormatLocale(locale: string | undefined): void {
  activeRegionLocale = locale;
}

export function getActiveFormatLocale(): string | undefined {
  return activeRegionLocale;
}

export function getCurrencyConfig(code?: CurrencyCode): CurrencyConfig {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? SUPPORTED_CURRENCIES[0];
}

export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode = 'LKR',
  localeOverride?: string
): string {
  const cfg = getCurrencyConfig(currencyCode);
  const safe = Number.isFinite(amount) ? amount : 0;
  const effectiveLocale = localeOverride ?? activeRegionLocale ?? cfg.locale;
  try {
    return new Intl.NumberFormat(effectiveLocale, {
      style: 'currency',
      currency: cfg.code,
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals,
    }).format(safe);
  } catch {
    return `${cfg.symbol} ${safe.toFixed(cfg.decimals)}`;
  }
}

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export interface CartTotals {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  grandTotal: number;
  estimatedCost: number;
  estimatedProfit: number;
  itemCount: number;
}

export function calculateCartTotals(
  items: CartItem[],
  discount: DiscountConfig,
  taxRate: number
): CartTotals {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0)
  );
  const estimatedCost = roundMoney(
    items.reduce((sum, item) => sum + item.product.purchasePrice * item.quantity, 0)
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  let discountAmount = 0;
  if (discount.value > 0 && subtotal > 0) {
    if (discount.type === 'percent') {
      const clampedPct = Math.min(100, Math.max(0, discount.value));
      discountAmount = roundMoney((subtotal * clampedPct) / 100);
    } else {
      discountAmount = roundMoney(Math.min(subtotal, Math.max(0, discount.value)));
    }
  }

  const taxableAmount = roundMoney(Math.max(0, subtotal - discountAmount));
  const safeTaxRate = Math.min(100, Math.max(0, taxRate));
  const taxAmount = roundMoney((taxableAmount * safeTaxRate) / 100);
  const grandTotal = roundMoney(taxableAmount + taxAmount);
  const estimatedProfit = roundMoney(taxableAmount - estimatedCost);

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    grandTotal,
    estimatedCost,
    estimatedProfit,
    itemCount,
  };
}
