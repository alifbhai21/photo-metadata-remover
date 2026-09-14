# Accessibility Task Report

Step 4 — Fix Accessibility Gaps (WCAG 2.1 AA) on the photo-metadata-remover tool.

Status: COMPLETE — changes applied, build verified, dist output verified in EN/DE/FR.
NO COMMIT MADE

## Changes applied

### `src/components/ToolUpload.astro`
- **Live region**: added `#a11y-status` (`aria-live="polite"`, `role="status"`, `aria-atomic`), announced via `announce()` on every user-facing state change.
- **Upload zone** now keyboard-operable: `role="button"`, `tabindex="0"`, localized `aria-label`, Enter/Space keydown handler that opens the file picker (guarded to only fire when the results panel is hidden), plus a visible focus ring.
- **Upload error**: added `role="alert"` and `tabindex="-1"`; programmatically focused after validation errors (`S9`).
- **Progress steps**: replaced the icon row with `#progress-steps` `<ol>` (localized `aria-label`), four `<li data-step="1..4">` items with `data-step-dot`/`data-step-check` spans, `aria-hidden="true"` indicator, and `aria-current="step"` on the active step. `updateProgress()` is driven by the staging pipeline (processing → Scan, all done → Download, otherwise staging metadata files → Remove / else Scan); failed step shows `✓ N` in the check cell.
- **Results heading**: `tabindex="-1"` for focus management; `resultsHeading.focus()` after a successful scan.
- **Files list**: `data-scan-results` and `data-a11y-zip-ready` hooks; ZIP completion announced with a localized message including the count.
- **Metadata viewer**: `role="region"` on the panel; focus handed back to the "Show metadata" button after closing (both button click and Escape paths — `S10`/`S11`).
- **Reset**: focus returned to the upload zone (`S8`).

### `src/layouts/Layout.astro`
- Skip link with localized label and viewport-aware focus styles (`L1`).
- `<main id="main" tabindex="-1">` as the skip target (`L2`).
- Mobile menu toggle: localized `aria-label`, `aria-expanded="false"`, `aria-controls="mobile-menu"`; script toggles `aria-expanded` in sync with the `hidden` class and resets on link click / outside click / Escape (`L3`, `L5`).
- Language toggle: localized `aria-label`, `aria-controls="lang-dropdown"`; Escape closes the dropdown and returns focus to the toggle (`L4`, `L5`).

### Locales — `src/locales/{en,de,fr}.json`
10 new keys per locale, no hardcoded English:

| Key | en | de | fr |
|---|---|---|---|
| `nav.menu` | Menu | Menü | Menu |
| `nav.change_language` | Change language | Sprache ändern | Changer de langue |
| `nav.skip_to_content` | Skip to content | Zum Inhalt springen | Aller au contenu |
| `tool.upload_zone_label` | Upload photos - click or press Enter to browse | Fotos hochladen – klicken oder Enter drücken | Importer des photos – cliquez ou appuyez sur Entrée |
| `tool.progress_label` | Progress | Fortschritt | Progression |
| `tool.step_upload` | Upload | Hochladen | Importer |
| `tool.step_scan` | Scan | Prüfen | Analyser |
| `tool.step_remove` | Remove | Entfernen | Supprimer |
| `tool.step_download` | Download | Herunterladen | Télécharger |
| `tool.a11y_zip_ready` | {{count}} images ready to download | {{count}} Bilder bereit zum Herunterladen | {{count}} images prêtes à télécharger |

## Verification

- `npm run build` PASSED — 91 pages; only pre-existing non-fatal >500 kB chunk warning.
- `dist/en/.../index.html` contains: `id="main"`, `id="a11y-status"`, `id="results-heading"`, `id="progress-steps"`, `data-step="1"`, `data-step-dot`, `data-step-check`, `aria-current`, upload-zone `role="button"` + `aria-label`, `data-scan-results`, `data-a11y-zip-ready`, `aria-controls="lang-dropdown"`/`"mobile-menu"`, localized toggle labels.
- No raw key leakage: `skip_to_content`, `nav.menu`, `=Progress`, `=Upload` absent from built EN HTML.
- `dist/de` and `dist/fr`: localized upload-zone labels, progress label (`Fortschritt`/`Progression`) and skip-link text confirmed render (UTF-8 decoded read).
- JS bundle `ToolUpload.astro_astro_type_script_index_0_lang.Mz8HyWTI.js` contains `a11yZipReady`, `a11y-status`, `results-heading`, `data-step`, `progress-steps`, `photometadataremover-cleaned.zip` — script edits compiled into the shipped bundle.

## Scope notes
- Out of scope (unchanged): `src/lib/legal.ts`, `impressum.astro`, `contact.astro`, `.env.example`; ZIP implementation; 40 MB validation; JPEG/WebP/HEIC metadata stripping; analytics; SEO; sitemap; blog. Pre-existing hardcoded `'✓ Success'` text remains as-is.
- i18n has no interpolation; `{{count}}`/`{{success}}`/`{{total}}` are replaced manually in JS.

NO COMMIT MADE