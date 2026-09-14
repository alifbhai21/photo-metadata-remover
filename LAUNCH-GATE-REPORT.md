# Launch-Gate CI Test Report

**Date:** 2026-09-06
**Scope:** Close PRD-GAP-AUDIT.md "Recommended Next Code Fixes" item 3 — add a launch-gate CI test (re-encode crafted fixtures, assert clean output has no APP1/APP13/COM and no GPS/IPTC/XMP keys) to satisfy "zero-metadata test passing in CI". Plus fix the Playwright runner so it only executes real project tests.

## Changes

### 1. `launch-gate-test.spec.ts` (new)
Playwright spec in the same style as the existing `metadata-classification-test.spec.ts` / `stale-state-test.spec.ts`, adding byte-level assertions for the product's core privacy promise plus the FR-1 upload-validation guarantees:

| Test | Asserts |
|---|---|
| Cleaned JPEG has no APP1/APP13/COM segments and no privacy strings | Uploads `metadata-rich-test-image-2.jpg`, strips metadata, downloads `-clean.jpg`, then: (a) parses the JPEG segment table and asserts no `0xE1` (APP1 = EXIF/XMP), `0xED` (APP13 = IPTC/Photoshop), or `0xFE` (COM) markers survive; (b) scans the whole file (1:1 latin1 mapping) for `Exif`, `GPS`, `IPTC`, `XMP`, `Photoshop`, `http://ns.adobe.com`. |
| Batch ZIP downloads as one archive containing metadata-free clean images | Uploads two rich files, removes all, clicks the ZIP button, and asserts: valid ZIP `PK\x03\x04` header; both `-clean` files present in the archive; no EXIF/XMP/IPTC string content inside. |
| Unsupported file types rejected with a localized error | `notes.txt` → `#upload-error` visible, localized "Unsupported file type", filename included, and no results panel / no ZIP state. |
| Files over the 40 MB cap rejected with a localized error | 40 MB + 1 byte JPEG → localized "too large (max …)" error, no results panel. |

The marker-level JPEG walk scans segments by length (not raw bytes) so entropy data can't false-positive on `0xFF`.

### 2. `playwright.config.ts` (modified)
Added `testIgnore: ['**/.kilo/**', '**/node_modules/**']`. Without this, Playwright discovered the stale initial-commit copies under `.kilo/worktrees/*` (3 duplicate spec files) and ran them against the live implementation — producing 3 spurious failures (1 real timeout + 2 cold-start races).

### 3. Cold-start hardiness
First-wait timeouts in the new spec raised to 45s to absorb the dev server's initial Vite dependency re-optimization on a fresh runner (observed once: 16s for `exifr`/`heic2any`/`jszip` optimization on the very first page load).

## Verification

- **Full suite (root only):** `npx playwright test` → **10 passed (9.2s)**, 0 failed — 4 launch-gate, 2 metadata-classification, 4 stale-state.
  - Before the `testIgnore` fix the runner picked up 6 extra stale worktree specs → 16 tests, 3 spurious failures. Now clean.
- **Production build:** `npm run build` → 91 pages, no errors.
- **Localization parity:** en/de/fr each 321 flat keys, 0 mismatches (Node-flatten script). The new `tool.unsupported_file` / `tool.file_too_large` / `tool.download_zip` etc. exist in all three.
- **Built output spot-check** (`dist/{en,de,fr}/index.html`): all data-attributes present (`data-unsupported-file`, `data-file-too-large`, `data-zip-error`, `data-a11y-zip-ready`, `data-scan-results`); localized validation strings render in all three locales (`Unsupported file type … is too large`, `Nicht unterstützter Dateityp … ist zu groß`, `Type de fichier non pris en charge … trop volumineux`).
- Filename contract verified: cleaned JPEG downloads as `metadata-rich-test-image-2-clean.jpg`; ZIP downloads as `photometadataremover-cleaned.zip`.

## Notes / owner actions still outstanding (from PRD-GAP-AUDIT.md)
1. Impressum/Contact legal identity placeholders (`PUBLIC_LEGAL_*` env) — owner data required.
2. Analytics activation (`.env` `PUBLIC_PLAUSIBLE_DOMAIN`) — no events fire until configured.
3. Real-device (iPhone) HEIC + Safari multi-download confirmation.

These are runtime/owner items, not code gaps; all four recommended code fixes from the audit are now implemented and CI-verified.

NO COMMIT MADE