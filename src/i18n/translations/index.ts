import { SupportedLanguage } from '../types';
import { ar } from './ar';
import { de } from './de';
import { en, TranslationDictionary, TranslationKey } from './en';
import { es } from './es';
import { fr } from './fr';
import { ja } from './ja';
import { pt } from './pt';

export type { TranslationDictionary, TranslationKey };

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en,
  es,
  fr,
  de,
  pt,
  ja,
  ar,
};
