export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'ar';

export type TextDirection = 'ltr' | 'rtl';

export type TimeCyclePreference = 'auto' | '12h' | '24h';

export type RegionLocaleId =
  | 'auto'
  | 'en-US'
  | 'en-GB'
  | 'en-LK'
  | 'en-IN'
  | 'en-AU'
  | 'en-SG'
  | 'es-ES'
  | 'es-MX'
  | 'fr-FR'
  | 'de-DE'
  | 'pt-BR'
  | 'ja-JP'
  | 'ar-AE';

export interface LanguageMeta {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  dir: TextDirection;
  defaultRegion: Exclude<RegionLocaleId, 'auto'>;
  shortCode: string;
}

export interface RegionPreset {
  id: Exclude<RegionLocaleId, 'auto'>;
  label: string;
  country: string;
  sampleNote: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dir: 'ltr',
    defaultRegion: 'en-US',
    shortCode: 'EN',
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    dir: 'ltr',
    defaultRegion: 'es-ES',
    shortCode: 'ES',
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    dir: 'ltr',
    defaultRegion: 'fr-FR',
    shortCode: 'FR',
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    dir: 'ltr',
    defaultRegion: 'de-DE',
    shortCode: 'DE',
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    dir: 'ltr',
    defaultRegion: 'pt-BR',
    shortCode: 'PT',
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    dir: 'ltr',
    defaultRegion: 'ja-JP',
    shortCode: 'JA',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
    defaultRegion: 'ar-AE',
    shortCode: 'AR',
  },
];

export const REGION_PRESETS: RegionPreset[] = [
  { id: 'en-US', label: 'United States (en-US)', country: 'US', sampleNote: '1,234.56 · MM/DD/YYYY' },
  { id: 'en-GB', label: 'United Kingdom (en-GB)', country: 'GB', sampleNote: '1,234.56 · DD/MM/YYYY' },
  { id: 'en-LK', label: 'Sri Lanka (en-LK)', country: 'LK', sampleNote: '1,234.56 · DD/MM/YYYY' },
  { id: 'en-IN', label: 'India (en-IN)', country: 'IN', sampleNote: '1,23,456.78 · DD/MM/YYYY' },
  { id: 'en-AU', label: 'Australia (en-AU)', country: 'AU', sampleNote: '1,234.56 · DD/MM/YYYY' },
  { id: 'en-SG', label: 'Singapore (en-SG)', country: 'SG', sampleNote: '1,234.56 · DD/MM/YYYY' },
  { id: 'es-ES', label: 'Spain (es-ES)', country: 'ES', sampleNote: '1.234,56 · DD/MM/YYYY' },
  { id: 'es-MX', label: 'Mexico (es-MX)', country: 'MX', sampleNote: '1,234.56 · DD/MM/YYYY' },
  { id: 'fr-FR', label: 'France (fr-FR)', country: 'FR', sampleNote: '1 234,56 · DD/MM/YYYY' },
  { id: 'de-DE', label: 'Germany (de-DE)', country: 'DE', sampleNote: '1.234,56 · TT.MM.JJJJ' },
  { id: 'pt-BR', label: 'Brazil (pt-BR)', country: 'BR', sampleNote: '1.234,56 · DD/MM/YYYY' },
  { id: 'ja-JP', label: 'Japan (ja-JP)', country: 'JP', sampleNote: '1,234.56 · YYYY/MM/DD' },
  { id: 'ar-AE', label: 'UAE / Gulf (ar-AE)', country: 'AE', sampleNote: '1,234.56 · DD/MM/YYYY' },
];

export interface I18nPreferences {
  language: SupportedLanguage;
  regionLocale: RegionLocaleId;
  timeCycle: TimeCyclePreference;
}
