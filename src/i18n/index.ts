import en from '../locales/en.json';
import de from '../locales/de.json';
import fr from '../locales/fr.json';

const locales = { en, de, fr } as const;
export type Locale = keyof typeof locales;

export function getTranslations(lang: Locale) {
  return locales[lang] || locales.en;
}

export function t(translations: any, path: string): string {
  const keys = path.split('.');
  let value: any = translations;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return path;
    }
  }
  
  return typeof value === 'string' ? value : path;
}
