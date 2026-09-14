/**
 * Light-only theme module (Stitch Phase 1).
 * The site ships a single light theme; this module is kept for backward
 * compatibility only and no longer toggles any class.
 */

export type Theme = 'light';

/** Always light — no dark theme, no toggle. */
export function getResolvedTheme(): Theme {
  return 'light';
}

/** Light-only site: nothing to apply, kept as a no-op for old callers. */
export function applyTheme(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = 'light';
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', '#fbf8ff');
}
