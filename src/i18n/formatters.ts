import { CurrencyCode } from '../types/nexpos';
import { getCurrencyConfig } from '../utils/currency';
import { RegionLocaleId, SupportedLanguage, TimeCyclePreference } from './types';

export function resolveEffectiveLocale(
  regionLocale: RegionLocaleId,
  language: SupportedLanguage
): string {
  if (regionLocale !== 'auto') {
    return regionLocale;
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  switch (language) {
    case 'es':
      return 'es-ES';
    case 'fr':
      return 'fr-FR';
    case 'de':
      return 'de-DE';
    case 'pt':
      return 'pt-BR';
    case 'ja':
      return 'ja-JP';
    case 'ar':
      return 'ar-AE';
    default:
      return 'en-US';
  }
}

export function formatMoneyWithLocale(
  amount: number,
  currencyCode: CurrencyCode,
  locale?: string
): string {
  const cfg = getCurrencyConfig(currencyCode);
  const safe = Number.isFinite(amount) ? amount : 0;
  const effectiveLocale = locale || cfg.locale;
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

export function formatNumberWithLocale(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(locale, options).format(safe);
  } catch {
    return String(safe);
  }
}

export function formatPercentWithLocale(
  percentValue: number,
  locale: string,
  decimals = 1
): string {
  const safe = Number.isFinite(percentValue) ? percentValue : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safe / 100);
  } catch {
    return `${safe.toFixed(decimals)}%`;
  }
}

function toValidDate(input: Date | string | number): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateWithLocale(
  input: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const d = toValidDate(input);
  if (!d) return String(input);
  try {
    return new Intl.DateTimeFormat(locale, options).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatShortDateWithLocale(
  input: Date | string | number,
  locale: string
): string {
  return formatDateWithLocale(input, locale, { month: 'short', day: 'numeric' });
}

function resolveHour12Option(timeCycle: TimeCyclePreference): boolean | undefined {
  if (timeCycle === '12h') return true;
  if (timeCycle === '24h') return false;
  return undefined;
}

export function formatTimeWithLocale(
  input: Date | string | number,
  locale: string,
  timeCycle: TimeCyclePreference = 'auto',
  includeSeconds = false
): string {
  const d = toValidDate(input);
  if (!d) return String(input);
  const hour12 = resolveHour12Option(timeCycle);
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      ...(hour12 !== undefined ? { hour12 } : {}),
    }).format(d);
  } catch {
    return d.toTimeString().slice(0, 5);
  }
}

export function formatDateTimeWithLocale(
  input: Date | string | number,
  locale: string,
  timeCycle: TimeCyclePreference = 'auto',
  options?: Intl.DateTimeFormatOptions
): string {
  const d = toValidDate(input);
  if (!d) return String(input);
  const hour12 = resolveHour12Option(timeCycle);
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...(hour12 !== undefined ? { hour12 } : {}),
      ...options,
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}
