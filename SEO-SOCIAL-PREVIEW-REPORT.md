# Step 5 — SEO Social Preview Images: Report

## Objective
Add a site-wide social preview image for photometadataremover.com. Before this task the site emitted no `og:image` and Twitter cards used `summary` without an image, so shared links rendered without a preview. The change adds an Open Graph image and a `summary_large_image` Twitter card while preserving all existing SEO metadata (title, description, canonical, hreflang, JSON-LD), the EN/DE/FR localization, and the previously completed accessibility implementation.

## Changes

### 1. Social preview image (new)
- Added `public/og-image.png` (1200 x 630, PNG, ~24 kB; sharp reports `{"width":1200,"height":630,"format":"png"}`).
- Generated with a one-off script (`og-generate.mjs`, kept outside the repo in `%TEMP%\opencode`) that renders an HTML/CSS design in headless Chromium (Playwright) and screenshots it at the exact target size. No ImageMagick/FFmpeg exists on this machine, and the Windows `convert.exe` is the disk utility, so browser-based rendering was used.
- Design: white surface (`#ffffff`) with the accent blue top bar (`#0070f3`), the same eye-inside-accent-square logo mark as the site, heading "Photo Metadata Remover", tagline "Remove EXIF & GPS data from your photos. 100% private — everything runs in your browser.", and "Free" / "No uploads" / "Open source" pills. Colors match `global.css` design tokens (`#0070f3` accent, `#171717` text, `#666666` muted).
- Pixel sampling of the rendered PNG confirms the design rendered: dominant white surface, accent-color pixels (top bar + logo tile), dark text pixels (heading), and muted pixels (tagline).

### 2. Open Graph tags per page
`src/layouts/Layout.astro` now emits, alongside the existing `og:url`/`og:type`/`og:site_name`/`og:title`/`og:description`:
- `og:image` = `https://photometadataremover.com/og-image.png` (absolute, computed from `SITE_URL`; never locale-relative like `/en/og-image.png`)
- `og:image:width` 1200, `og:image:height` 630, `og:image:type` image/png
- `og:image:alt` localized (see below)

### 3. Twitter card update
- `twitter:card` upgraded from `summary` to `summary_large_image`.
- Added `twitter:image` (same absolute URL) and localized `twitter:image:alt`.
- Existing `twitter:title` and `twitter:description` left untouched.

### 4. Root language selector page
`src/pages/index.astro` is a standalone page (it builds its own inline `<head>` rather than using `Layout.astro`) and was missing the image metadata entirely. Added the same `og:image` set and `summary_large_image`/`twitter:image`/`twitter:image:alt` there. This page is EN-only, so it uses the English alt text.

### 5. Localized alt text
Added `seo.og_image_alt` to all three locale files with exact parity (the i18n helper returns the raw key path when a key is missing, so all three are required):
- `en`: "Photo Metadata Remover – remove EXIF and GPS data from your photos in your browser. Free, private, no uploads."
- `de`: "Foto-Metadaten-Entferner – EXIF- und GPS-Daten direkt im Browser aus Ihren Fotos entfernen. Kostenlos, privat, ohne Uploads."
- `fr`: "Suppresseur de Métadonnées Photo – supprimez les données EXIF et GPS de vos photos dans votre navigateur. Gratuit, privé, aucun envoi."

## Files changed
- `src/layouts/Layout.astro` — added `ogImageUrl` const + OG/Twitter image tags.
- `src/pages/index.astro` — added `ogImageUrl`/`ogImageAlt` consts + OG/Twitter image tags.
- `src/locales/en.json`, `src/locales/de.json`, `src/locales/fr.json` — added `seo.og_image_alt`.
- `public/og-image.png` — new 1200 x 630 PNG social preview image.
- `astro.config.mjs` unchanged (`site` already correct).

## Verification
- `npm run build` succeeds: 91 pages built, 0 errors. The only warning is the pre-existing "chunk > 500 kB" bundling note, unrelated to this change.
- Verified the 12 required checks on 6 representative pages: root `/`, `/en/`, `/de/`, `/fr/`, `/en/guides/what-is-exif/` (nested localized), and `/fr/blog/how-to-remove-exif-data/` (localized blog).
  - `og:image` present, absolute, correct URL, not locale-relative
  - `og:image:width` 1200 / `og:image:height` 630 / `og:image:type` image/png
  - `og:image:alt` present and translated (no raw `seo.og_image_alt` key leaked)
  - `twitter:card` = `summary_large_image`
  - `twitter:image` present, correct absolute URL
  - `twitter:image:alt` present and matches `og:image:alt` (parity)
  - Existing `title`, `description`, canonical, and `hreflang` (x-default + en/de/fr) intact
  - Result: 6/6 pages PASS, 0 failed checks.
- Confirmed all three locales emit distinct, correctly localized alt text.
- `public/og-image.png` exists at the correct 1200 x 630 dimensions and valid PNG format.

## Remaining issues
None for this task. The large-chunk bundling warning predates this change and is out of scope.

---

NO COMMIT MADE