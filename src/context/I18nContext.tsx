import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  formatDateTimeWithLocale,
  formatDateWithLocale,
  formatMoneyWithLocale,
  formatNumberWithLocale,
  formatPercentWithLocale,
  formatShortDateWithLocale,
  formatTimeWithLocale,
  resolveEffectiveLocale,
} from '../i18n/formatters';
import { TRANSLATIONS, TranslationKey } from '../i18n/translations';
import {
  I18nPreferences,
  LanguageMeta,
  RegionLocaleId,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  TextDirection,
  TimeCyclePreference,
} from '../i18n/types';
import { CurrencyCode } from '../types/nexpos';
import { setActiveFormatLocale } from '../utils/currency';

const I18N_STORAGE_KEY = 'nexpos_i18n_v1';

function detectInitialLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const navLang = (navigator.language || 'en').toLowerCase().split('-')[0];
  const matched = SUPPORTED_LANGUAGES.find((l) => l.code === navLang);
  return matched ? matched.code : 'en';
}

function loadStoredPreferences(): I18nPreferences {
  const fallback: I18nPreferences = {
    language: detectInitialLanguage(),
    regionLocale: 'auto',
    timeCycle: 'auto',
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(I18N_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<I18nPreferences>;
    const validLang = SUPPORTED_LANGUAGES.some((l) => l.code === parsed.language)
      ? (parsed.language as SupportedLanguage)
      : fallback.language;
    const validTime: TimeCyclePreference =
      parsed.timeCycle === '12h' || parsed.timeCycle === '24h' || parsed.timeCycle === 'auto'
        ? parsed.timeCycle
        : 'auto';
    const validRegion =
      typeof parsed.regionLocale === 'string' && parsed.regionLocale.length >= 2
        ? (parsed.regionLocale as RegionLocaleId)
        : 'auto';
    return {
      language: validLang,
      regionLocale: validRegion,
      timeCycle: validTime,
    };
  } catch {
    return fallback;
  }
}

export interface I18nContextValue {
  language: SupportedLanguage;
  languageMeta: LanguageMeta;
  dir: TextDirection;
  isRtl: boolean;
  regionLocale: RegionLocaleId;
  effectiveLocale: string;
  timeCycle: TimeCyclePreference;
  setLanguage: (lang: SupportedLanguage, matchDefaultRegion?: boolean) => void;
  setRegionLocale: (region: RegionLocaleId) => void;
  setTimeCycle: (cycle: TimeCyclePreference) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  formatMoney: (amount: number, currencyCode?: CurrencyCode) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (percentValue: number, decimals?: number) => string;
  formatDate: (input: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatShortDate: (input: Date | string | number) => string;
  formatTime: (input: Date | string | number, includeSeconds?: boolean) => string;
  formatDateTime: (input: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatRelativeDays: (daysDelta: number) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<I18nPreferences>(() => loadStoredPreferences());

  const languageMeta = useMemo(
    () => SUPPORTED_LANGUAGES.find((l) => l.code === prefs.language) ?? SUPPORTED_LANGUAGES[0],
    [prefs.language]
  );

  const effectiveLocale = useMemo(
    () => resolveEffectiveLocale(prefs.regionLocale, prefs.language),
    [prefs.regionLocale, prefs.language]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(I18N_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }
  }, [prefs]);

  useEffect(() => {
    setActiveFormatLocale(prefs.regionLocale === 'auto' ? undefined : effectiveLocale);
  }, [prefs.regionLocale, effectiveLocale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = prefs.language;
      document.documentElement.dir = languageMeta.dir;
    }
  }, [prefs.language, languageMeta.dir]);

  const setLanguage = useCallback((lang: SupportedLanguage, matchDefaultRegion = false) => {
    const meta = SUPPORTED_LANGUAGES.find((l) => l.code === lang) ?? SUPPORTED_LANGUAGES[0];
    setPrefs((prev) => ({
      ...prev,
      language: lang,
      regionLocale: matchDefaultRegion ? meta.defaultRegion : prev.regionLocale,
    }));
  }, []);

  const setRegionLocale = useCallback((regionLocale: RegionLocaleId) => {
    setPrefs((prev) => ({ ...prev, regionLocale }));
  }, []);

  const setTimeCycle = useCallback((timeCycle: TimeCyclePreference) => {
    setPrefs((prev) => ({ ...prev, timeCycle }));
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const dict = TRANSLATIONS[prefs.language] ?? TRANSLATIONS.en;
      let text = dict[key] ?? TRANSLATIONS.en[key] ?? key;
      if (vars) {
        for (const [varKey, val] of Object.entries(vars)) {
          text = text.replaceAll(`{${varKey}}`, String(val));
        }
      }
      return text;
    },
    [prefs.language]
  );

  const formatMoney = useCallback(
    (amount: number, currencyCode: CurrencyCode = 'LKR') => {
      const localeToUse = prefs.regionLocale === 'auto' ? undefined : effectiveLocale;
      return formatMoneyWithLocale(amount, currencyCode, localeToUse);
    },
    [prefs.regionLocale, effectiveLocale]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumberWithLocale(value, effectiveLocale, options),
    [effectiveLocale]
  );

  const formatPercent = useCallback(
    (percentValue: number, decimals = 1) =>
      formatPercentWithLocale(percentValue, effectiveLocale, decimals),
    [effectiveLocale]
  );

  const formatDate = useCallback(
    (input: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      formatDateWithLocale(input, effectiveLocale, options),
    [effectiveLocale]
  );

  const formatShortDate = useCallback(
    (input: Date | string | number) => formatShortDateWithLocale(input, effectiveLocale),
    [effectiveLocale]
  );

  const formatTime = useCallback(
    (input: Date | string | number, includeSeconds = false) =>
      formatTimeWithLocale(input, effectiveLocale, prefs.timeCycle, includeSeconds),
    [effectiveLocale, prefs.timeCycle]
  );

  const formatDateTime = useCallback(
    (input: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      formatDateTimeWithLocale(input, effectiveLocale, prefs.timeCycle, options),
    [effectiveLocale, prefs.timeCycle]
  );

  const formatRelativeDays = useCallback(
    (daysDelta: number) => {
      try {
        const rtf = new Intl.RelativeTimeFormat(effectiveLocale, { numeric: 'auto' });
        return rtf.format(Math.round(daysDelta), 'day');
      } catch {
        return `${daysDelta}d`;
      }
    },
    [effectiveLocale]
  );

  const value: I18nContextValue = {
    language: prefs.language,
    languageMeta,
    dir: languageMeta.dir,
    isRtl: languageMeta.dir === 'rtl',
    regionLocale: prefs.regionLocale,
    effectiveLocale,
    timeCycle: prefs.timeCycle,
    setLanguage,
    setRegionLocale,
    setTimeCycle,
    t,
    formatMoney,
    formatNumber,
    formatPercent,
    formatDate,
    formatShortDate,
    formatTime,
    formatDateTime,
    formatRelativeDays,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
