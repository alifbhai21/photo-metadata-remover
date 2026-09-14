export const SUPPORTED_LANGS = ['en', 'de', 'fr'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
};

export const STORAGE_KEY = 'pmr_lang';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

function normalizeLang(value: string | null | undefined): Lang | null {
  if (!value) return null;
  const code = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLang(code) ? code : null;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getSavedLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const lang = normalizeLang(stored);
      if (lang) return lang;
    }
  } catch {
    // localStorage unavailable (private mode / storage disabled): fall back to cookie
  }
  return normalizeLang(readCookie(STORAGE_KEY));
}

export function saveLang(lang: Lang): void {
  if (typeof document === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable: cookie fallback still applies
  }
  document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function detectBrowserLang(): Lang | null {
  if (typeof navigator === 'undefined') return null;
  const candidates: readonly string[] =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
  for (const candidate of candidates) {
    const lang = normalizeLang(candidate);
    if (lang) return lang;
  }
  return null;
}

export function resolveHomeLang(): Lang {
  return getSavedLang() ?? detectBrowserLang() ?? 'en';
}