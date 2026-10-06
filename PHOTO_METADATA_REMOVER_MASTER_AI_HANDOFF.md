---
Last Updated: 2026-10-06
Version: 2.0 (reconstruction)
Prior Version: 1.0 (never saved to disk; original session only)
Status: Pre-launch
Next Review Trigger: When a genuine HEIC fixture is added, after launch, or when any section here is found stale
Maintained By: User + AI agents (see section 22)
---

# PHOTO METADATA REMOVER — MASTER AI HANDOFF

> READ THIS FIRST before doing any work on this repository.
> This file is a reconstruction (v2.0). The original v1.0 handoff was never
> written to disk: verified absent from the working tree, Git history, stash,
> Cline worktrees, and ~/.cline on 2026-10-06. Everything here is rebuilt from
> current repository evidence and the project's authoritative documents.
> Confidence markers used throughout:
>   CONFIRMED  = backed by current code/config/test evidence (file:line cited)
>   INFERRED   = conclusion drawn from evidence but not directly stated
>   UNVERIFIED = claimed somewhere, not provable from current evidence

---

## 1. Project Identity

- Project name: Photo Metadata Remover (PRD working title; brand TBD) (PRD-photo-metadata-remover.md:7)
- Production URL: https://photometadataremover.com (astro.config.mjs:7) — CONFIRMED as config value; live deployment itself is UNVERIFIED.
- Purpose: free, privacy-first web tool. Upload a photo, see exactly what hidden metadata it contains (GPS location, camera model, date/time, software, personal names), remove all of it with one click, download a clean metadata-free image. (PRD:18)
- Primary USP: "Remove EXIF metadata from photos instantly and privately." Photos are processed securely and never stored. (PRD:22)
- Secondary USP: fully localized experience; architecture is 10-language-ready, Phase 1 launches EN + DE + FR. (PRD:23, :27, :256)
- Current product status: pre-launch. Core engine, batch processing, ZIP, output verification, and a large Playwright suite are implemented and passing focused runs. Launch is gated on owner items (legal identity, analytics activation, real-device HEIC confirmation). (PRD-GAP-AUDIT.md:11-16, 142-157; LAUNCH-GATE-REPORT.md:35-40)
- Current implementation reality: a working, production-shaped, 100% client-side tool — stronger privacy posture than the PRD's original server-endpoint design. (PRD-GAP-AUDIT.md:9, 30)

---

## 2. Technology Stack

CONFIRMED from package.json and config:

- Framework: Astro ^7.3.1 (package.json:16)
- CSS: Tailwind CSS v4 via @tailwindcss/vite ^4.3.3; tailwindcss ^4.3.3 (package.json:15, 20)
- Language: TypeScript (specs and src are .ts/.astro; tsconfig present)
- Module type: "type": "module" (package.json:3)
- Node requirement: >= 22.12.0 (package.json:5-7)
- Major runtime dependencies:
  - exifr ^7.1.3 — metadata parsing (package.json:17)
  - heic2any ^0.0.4 — HEIC/HEIF to JPEG conversion, bundled WASM (package.json:18; PRD-GAP-AUDIT:107)
  - jszip ^3.10.1 — client-side batch ZIP (package.json:19)
- Test stack: @playwright/test ^1.62.1 (package.json:26), Playwright config at playwright.config.ts
- Fixture generation uses `sharp` and `exifr` inside test fixture modules (test-png-fixture.mjs:17-18; audit-fixtures.mjs:17). `sharp` is present in the dependency tree (used by fixtures); it is NOT used by production runtime code — production is fully client-side.
- Scripts: dev / build / preview / astro only (package.json:8-13). There is no test script; tests run via npx playwright directly.

---

## 3. Architecture

### 3.1 100% client-side — CONFIRMED

- No fetch, XHR, sendBeacon, WebSocket, or Worker usage for image processing anywhere in src/ (PRD-GAP-AUDIT.md:30, 100).
- No API routes exist. public/robots.txt's `/api/` disallow is moot (PRD-GAP-AUDIT:76).
- All metadata reading, stripping, verification, and ZIP creation happen in the browser.
- heic2any is bundled local WASM, not a network service (PRD-GAP-AUDIT:107).

### 3.2 Privacy architecture — CONFIRMED

- Only persistent identifiers: localStorage + one cookie `pmr_lang` (language preference, 1 year, samesite=lax) (PAGE-ARCHITECTURE-AUDIT.md:61).
- Plausible analytics wrapper `src/lib/analytics.ts` (957 bytes) no-ops when PUBLIC_PLAUSIBLE_DOMAIN is unset; it must never receive image bytes, filenames, EXIF values, GPS, or anything derived from a user photo (.agents/skills/photo-metadata-remover-ui/SKILL.md:34, 129-134).
- Blob/object URLs are revoked on every state transition via revokeAllPreviews() (SKILL.md:78).

### 3.3 Main components (src/components/) — CONFIRMED

FAQ.astro, Features.astro, Fidelity.astro, Hero.astro, HowItWorks.astro, PageHeader.astro, RiskAudit.astro, SelectedArticles.astro, SEOContent.astro (new, untracked), ToolUpload.astro, TrustStrip.astro, Welcome.astro (dead code — never imported, PAGE-ARCHITECTURE-AUDIT:230).
Layout: single source src/layouts/Layout.astro (navbar, footer, head, hreflang, JSON-LD slot, noindex support).

### 3.4 src/lib processing modules — CONFIRMED (sizes as of 2026-10-06)

| Module | Bytes | Role |
|---|---|---|
| src/lib/jpeg.ts | 7,533 | JPEG privacy-segment reader (readJpegPrivacySegments) — NEW, untracked (Batch 1) |
| src/lib/png.ts | 14,394 | PNG chunk reader/stripper: METADATA_CHUNK_TYPES = eXIf/tEXt/zTXt/iTXt/tIME (:91); zTXt summary handling (:245-249); readPngMetadataChunks (:280) |
| src/lib/webp.ts | 7,773 | WebP RIFF chunk walk, EXIF/XMP extraction |
| src/lib/tiff.ts | 17,873 | TIFF metadata handling |
| src/lib/verify.ts | 19,803 | Output verification; PNG_METADATA_CHUNKS list (:281) |
| src/lib/analytics.ts | 957 | Plausible wrapper |
| src/lib/lang.ts | 2,115 | SUPPORTED_LANGS, pmr_lang cookie+localStorage, detectBrowserLang |
| src/lib/legal.ts | 1,141 | Legal content helpers |

### 3.5 ToolUpload.astro role — CONFIRMED

- The single interactive tool UI (~2,211 lines as of 2026-10-06).
- Markup in the Astro template; client-side state machine in the bottom <script> block.
- Localized strings are passed to the client script via data-* attributes on #files-list so the script stays locale-agnostic (SKILL.md:59, 119). Preserve this pattern.
- Hosts: upload handling, per-file scan, metadata viewer renderer, privacy classifier (privacyKeys, :1861+), batch Remove All / Download ZIP, reset flow (resetTool / #reset-btn), progress state machine, output verification gating.

### 3.6 i18n architecture — CONFIRMED

- Dictionaries: src/locales/{en,de,fr}.json. Flat-verified parity: 1019 keys each, zero diffs in all four directions (verified 2026-10-06).
- Lookup: getTranslations(lang) falls back to en; t(translations, 'dot.path') returns the literal key path when a key is missing (PAGE-ARCHITECTURE-AUDIT:60; SKILL.md:36). Missing keys therefore ship English/key-paths silently — always verify parity after adding strings.
- Language persistence: src/lib/lang.ts, STORAGE_KEY = 'pmr_lang', writes localStorage AND a 1-year samesite=lax cookie; auto-detect from navigator.language runs only on the root / page (SKILL.md:37; PAGE-ARCHITECTURE-AUDIT:211).
- No new i18n library. No key rewriting. (SKILL.md:37)

---

## 4. Core User Flow

CONFIRMED from specs and ToolUpload behavior:

```
Upload -> Privacy Scan -> Metadata Viewer -> Remove -> Output Verification -> Download
                                                                              -> (optional) Re-upload cleaned file to verify
```

- Upload: drag-and-drop zone + click-to-browse, multi-file input (`multiple`). Dropzone is role="button" with Enter/Space keyboard support (SKILL.md:69).
- Unsupported file type: rejected with a localized, dismissible error naming the file; no results panel (LAUNCH-GATE-REPORT.md:15; tool.unsupported_file + tool.dismiss_error locale keys).
- Size limit: 40 MB. Over-limit files rejected with localized "too large (max ...)" error (LAUNCH-GATE:16; tool.file_too_large). NOTE: PRD proposed 25 MB (PRD:533) — code enforces 40 MB. See section 21.
- Scan: per-file status line "Privacy metadata found (N)" or "No privacy metadata found"; expandable metadata viewer lists every field with privacy-flagged rows (bg-warning-bg).
- Remove: per-item Remove button and Remove All. Progress and verification states are visible; download stays disabled until verification finishes.
- Output verification: every generated output is re-scanned before download unlocks (section 8).
- Download: per-item `-clean` suffix (`${base}-clean.${ext}`, PRD-GAP-AUDIT FR-4) and client-side ZIP of all cleaned files via jszip (`photometadataremover-cleaned.zip`, LAUNCH-GATE:33).
- Multi-file (batch): supported, per-item rows, sequential processing with busy guard (test-batch-guard.spec.ts, test-high-volume-batch.spec.ts).
- Reset: single "Clear all" button (#reset-btn) — the only reset control; revoke previews, clear items, close viewer (SKILL.md:75-78).
- Re-upload verification: cleaned output can be re-uploaded; suite asserts "No privacy metadata found" on re-upload (test-e2e-strip-rereupload.spec.ts; collector TEST C/D/O).

---

## 5. Supported Formats

| Format | Status | Evidence |
|---|---|---|
| JPEG/JPG | Full support — CONFIRMED | Segment-surgery stripper; suites: test-jpeg-exif-container-detection, collector TEST A-I |
| PNG | Full support — CONFIRMED | Structural chunk removal; suite: test-png-removal (26/26 on 2026-10-06) |
| WebP | Full support — CONFIRMED | RIFF chunk removal, alpha preserved; suite: test-webp-removal; collector TEST K |
| TIFF | Full support — CONFIRMED | Metadata stripped, valid TIFF out; suite: test-tiff-removal; collector TEST L |
| HEIC/HEIF | Input -> clean JPEG output — PARTIALLY VERIFIED | Path exists (heic2any, first frame, q0.92, validateJpegBlob; PRD-GAP-AUDIT:39,107). NO genuine HEIC fixture exists in the repo — collector TEST M is explicitly "NOT TESTABLE" (test-metadata-full-collector-audit.spec.ts:482-487). Real-device (iPhone) E2E remains UNVERIFIED (LAUNCH-GATE:38). |
| AVIF | Detection only — CONFIRMED as detection, NOT full support | AVIF detection exists (SKILL.md:35; test-avif-and-french-copy.spec.ts). Do NOT claim AVIF is fully supported; no removal pipeline evidence. AVIF support work is deferred pending work (section 20). |

HEIC explicit statements (required):
- Implementation path exists: isHeicFile -> heic2any -> validateJpegBlob -> JPEG verification (collector TEST M comment, :482-487).
- Conversion uses heic2any (bundled libheif WASM) at quality 0.92, first frame of multi-image containers (PRD-GAP-AUDIT:107).
- Output is a clean JPEG.
- A genuine HEIC fixture is currently MISSING; the path is exercised only with a fake-HEIC error case.
- Real-device E2E remains UNVERIFIED.

---

## 6. Metadata Detection

CONFIRMED pipeline:

1. exifr — primary parser for JPEG/TIFF EXIF and PNG eXIf payloads.
2. JPEG container scanner — src/lib/jpeg.ts readJpegPrivacySegments: detects EXIF (APP1 Exif), XMP (APP1 XMP packet), IPTC (APP13 Photoshop), COM even when exifr yields nothing readable (regression spec: test-jpeg-exif-container-detection, 6/6).
3. PNG chunk scanner — src/lib/png.ts readPngMetadataChunks (:280): detects eXIf, tEXt, zTXt, iTXt, tIME. zTXt is never inflated (detection only, :245-249). Existence needed because exifr's PNG reader misses zTXt/iTXt/tIME entirely (:264-273).
4. WebP RIFF scanner — src/lib/webp.ts: feeds only the EXIF chunk payload to exifr; XMP chunk detected at container level.
5. TIFF scanner — src/lib/tiff.ts.
6. HEIC path — heic2any conversion, then the JPEG pipeline.

Privacy classification — CONFIRMED (ToolUpload.astro):
- privacyKeys list (:1861-1884+), verbatim by group:
  - GPS: 'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSDateStamp', 'GPSTimeStamp', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef' (:1861-1863)
  - Person/authorship: 'UserComment', 'ImageDescription', 'XPAuthor', 'XPTitle', 'XPComment', 'XPKeywords', 'Artist', 'Copyright' (:1863-1864)
  - Device/software: 'Make', 'Model', 'Software' (:1864)
  - Timestamps: 'DateTimeOriginal', 'DateTimeDigitized', 'DateTime' (:1865); 'CreateDate', 'ModifyDate', 'OffsetTime', 'OffsetTimeOriginal', 'OffsetTimeDigitized', 'SubSecTime', 'SubSecTimeOriginal', 'SubSecTimeDigitized' (:1877-1879)
  - Lens identification: 'Lens', 'LensMake', 'LensModel', 'LensSerialNumber', 'LensInfo', 'LensType' (:1867)
  - Device serials: 'BodySerialNumber', 'CameraSerialNumber', 'SerialNumber', 'InternalSerialNumber' (:1869)
  - Exposure/provenance: 'ExposureTime', 'ExposureBiasValue', 'ExposureCompensation', 'ExposureMode', 'ExposureProgram', 'FNumber', 'ApertureValue', 'ShutterSpeedValue', 'BrightnessValue', 'MaxApertureValue', 'MeteringMode', 'LightSource', 'Flash', 'FocalLength', 'FocalLengthIn35mmFormat', 'FocalPlaneXResolution', 'FocalPlaneYResolution', 'FocalPlaneResolutionUnit', 'DigitalZoomRatio', 'WhiteBalance', 'ISO', 'ISOSpeedRatings', 'ISOSpeed', 'SensitivityType' (:1871-1876)
  - Extended GPS: 'GPSProcessingMethod', 'GPSAreaInformation', 'GPSSatellites', 'GPSStatus', 'GPSImgDirection', 'GPSImgDirectionRef', 'GPSMapDatum', 'GPSVersionID', 'GPSDifferential', 'GPSHPositioningError' (:1880-1882)
  - Normalized GPS aliases (exifr reviver, lowercase): latitude/longitude/altitude family (:1883-1884)
- LensSerialNumber (EXIF tag 0xA435) is in privacyKeys (:1867) and is covered end-to-end by TEST Q (section 14). exifr surfaces 0xA431 BodySerialNumber under the key 'SerialNumber' (collector spec :187-188; audit-fixtures-selftest).
- Container/chunk-scoped keys classified privacy: JPEG EXIF / JPEG XMP / JPEG IPTC / JPEG COM; WebP XMP; PNG eXIf / PNG tEXt / PNG zTXt / PNG iTXt / PNG tIME (ToolUpload.astro:1740 PNG_CHUNK_METADATA_KEY; JPEG_SEGMENT_METADATA_KEY and XMP_IPTC_CONTAINER_KEY regexes in the Batch 1 diff).
- XMP and IPTC are asserted at CONTAINER level (field-level XMP/IPTC extraction is not implemented — collector spec header, :5-8).
- Deliberately NOT privacy (structural, preserved): dimensions, colour type, bit depth, compression, ICC profile fields, orientation, resolution/unit tags (ToolUpload.astro:1858-1860).

---

## 7. Metadata Removal

CONFIRMED current implementation:

### JPEG
- Segment surgery: strips APP1 (EXIF + XMP), APP13 (IPTC/Photoshop), COM (PRD-GAP-AUDIT FR-3).
- Preserves APP0/JFIF, APP2 ICC profile, APP14; thumbnail (IFD1) removed with APP1.
- Pixels preserved byte-exactly — no re-encode (PRD-GAP-AUDIT AC-3.2).
- Edge case: unreadable-but-present EXIF APP1 is detected and removed (test-jpeg-exif-container-detection cases A/A2/E).

### PNG
- Drops eXIf, tEXt, zTXt, iTXt, tIME chunks (src/lib/png.ts:18, 91).
- Preserves everything else: iCCP byte-for-byte, PLTE, tRNS, IDAT image data byte-identical (test-png-removal.spec.ts:359-373, 390-399, 521-532).
- Output CRCs valid: strict per-chunk CRC verification on both fixture side and app side (test-png-fixture.mjs:87-89; verify.ts).
- No canvas re-encode on the structural path (IDAT equality asserted, :250).

### WebP
- RIFF chunk removal of EXIF and XMP chunks; ALPH (alpha) and image payload preserved; RIFF size field rewritten correctly (collector TEST K, :490-524).

### TIFF
- Metadata tags stripped; output remains a structurally valid TIFF; planted privacy strings absent (collector TEST L, :452-478).

### HEIC
- heic2any converts to clean JPEG (all JPEG removal then applies). Genuine-fixture verification missing (section 5).

---

## 8. Output Verification

CONFIRMED:

- Every generated output is re-scanned before its download control unlocks.
- Success requires "Privacy metadata remaining: 0" in the item status (e.g., collector waitForVerified, :103-108).
- Verification failure -> item lands in retryable "Try again" state, download and ZIP stay disabled, no file is ever shipped (test-png-removal.spec.ts:575-605).
- The exact verified bytes are what gets downloaded (blob-capture test, :555-573).
- ZIP is gated on the same verification: unverified items cannot enter the archive (zip-verification-gating.spec.ts).
- Download filename contract: `<name>-clean.<ext>`; ZIP: `photometadataremover-cleaned.zip` (LAUNCH-GATE:33).

---

## 9. Privacy Guarantees

Only verified guarantees:

- Images never leave the device: processing is 100% client-side; there is no upload backend at all (PRD-GAP-AUDIT:30, 100) — CONFIRMED.
- No fetch/XHR/sendBeacon/WebSocket/Worker carries image data — CONFIRMED.
- Analytics (Plausible) receives no image bytes, filenames, EXIF, GPS, or derived identifiers; coarse events only (file_upload, scan_complete, removal_complete, download, language_switch, theme_toggle) (SKILL.md:34, 129-134) — CONFIRMED by wrapper design; live event flow itself is INERT until PUBLIC_PLAUSIBLE_DOMAIN is configured (section 17).
- Object URL lifecycle: previews revoked on every state transition and on reset; no leaks across file replacements (SKILL.md:75-78; stale-state and stale-batch-mutation specs).
- Only cookie stored: pmr_lang (samesite=lax, 1 year) — CONFIRMED (PAGE-ARCHITECTURE-AUDIT:61).

---

## 10. Localization

- Live languages: EN, DE, FR — CONFIRMED (src/locales/, src/lib/lang.ts).
- Architecture is 10-language-ready; remaining locales (es, it, pt, nl, pl, ja, hi) are phased rollouts (PRD:241-256) — planned, not live.
- Parity: en/de/fr each have exactly 1019 flat keys; zero missing in any direction (verified by recursive flatten diff, 2026-10-06) — CONFIRMED.
- Fallback: getTranslations falls back to en; t() returns the literal key path when a key is absent — silent, so parity must be re-verified after ANY string addition (SKILL.md:36, 110-119).
- hreflang: en/de/fr reciprocal + x-default -> /en/ on every localized page (Layout.astro; PRD-GAP-AUDIT FR-9).
- Language detection: first visit auto-detect on root / only; manual choice persisted in cookie + localStorage and never overridden (PRD:300-324; src/lib/lang.ts).

---

## 11. Routes / Pages

CONFIRMED from src/pages (21 tracked templates) and public/sitemap.xml (75 <loc>):

### Homepage as primary tool
- /{lang}/ (en, de, fr) hosts the main ToolUpload instance (PAGE-ARCHITECTURE-AUDIT:86). The homepage IS the product.
- / (root) is a rendered language chooser + client-side redirect; not in sitemap (PAGE-ARCHITECTURE-AUDIT:211).

### Removed standalone route — DO NOT treat as current
- /{lang}/photo-metadata-remover — REMOVED. No template exists, zero references in src/pages, src/content, and sitemap.xml (grep-verified 2026-10-06). Blog/content links to it were also removed. Any document describing it as live is stale.
- /{lang}/open-source — also REMOVED (present in PAGE-ARCHITECTURE-AUDIT:35, absent now).

### Four dedicated noindex tool pages — CONFIRMED
- /{lang}/view-photo-metadata, /{lang}/remove-exif-data, /{lang}/remove-gps-data, /{lang}/remove-metadata-heic
- Each is a standalone Astro page rendering <Layout noindex> (lines 93-99 of each file); Layout.astro:108 emits `noindex, nofollow`.
- Excluded from sitemap.xml (0 matches) — deliberate, INFERRED (noindex pages should not be submitted).
- Committed in db2755c "one page" and 7010a33 "other page" (pre-existing, not part of current dirty tree).

### Dead dynamic route template
- src/pages/[lang]/[tool].astro still exists but its TOOLS array is EMPTY (:17) — getStaticPaths generates zero pages. Dead template; removal is pending-work candidate.

### Content routes
- /{lang}/blog + 12 posts (BLOG_SLUGS allowlist in blog/[slug].astro; 3 md files per post):
  what-is-photo-metadata, what-is-exif-data, can-photos-reveal-your-location,
  how-to-remove-location-data-from-photos, how-to-remove-exif-data,
  does-instagram-remove-exif, how-to-check-photo-metadata,
  what-information-is-hidden-in-a-photo, does-whatsapp-remove-exif-data,
  how-to-remove-exif-data-on-iphone, how-to-remove-exif-data-on-android,
  iptc-vs-xmp-metadata-explained (PAGE-ARCHITECTURE-AUDIT:189)
- /{lang}/guides + 3 guides: what-is-exif, gps-privacy, social-media
- Legal/static: about, contact, faq, formats, how-it-works, impressum, legal, privacy, security, terms (all ×3)

### Sitemap status
- public/sitemap.xml: 75 <loc> = 25 page types × 3 languages (home, about, faq, formats, contact, guides + 3 guide slugs, privacy, terms, impressum, blog + 12 blog slugs).
- Hand-maintained; nothing regenerates it (PAGE-ARCHITECTURE-AUDIT:275).
- Live but NOT in sitemap: how-it-works, legal, security (×3) — gap, see section 17.

---

## 12. SEO

CONFIRMED current state:

- Canonical: per page, localized (Layout.astro; PRD-GAP-AUDIT FR-9).
- hreflang: 3 locales + x-default -> /en/ — CONFIRMED.
- robots: Layout meta robots driven by noindex prop (:13, :33, :108); public/robots.txt = Allow / + Sitemap line (PAGE-ARCHITECTURE-AUDIT:237).
- Sitemap: see section 11. Omissions: how-it-works, legal, security live but absent.
- JSON-LD: WebSite, SoftwareApplication, FAQPage, Article, BreadcrumbList emitted from page frontmatter via Layout jsonLd prop (SKILL.md:123; PRD-GAP-AUDIT:35, 79). Root WebSite inLanguage uses an array — non-standard, minor (PRD-GAP-AUDIT:79).
- OG image: dist/og-image.png exists (PAGE-ARCHITECTURE-AUDIT:46) — but PRD-GAP-AUDIT:77 says og:image ABSENT on every page. See contradiction table (section 21). Current OG/twitter meta block status in Layout: PARTIALLY VERIFIED — og blocks exist in the uncommitted Layout/Hero/home_seo changes; full per-page OG coverage UNVERIFIED.
- SEOContent.astro: NEW untracked component used by the 4 noindex tool pages; feeds from the new ~200-line home_seo section appended to each locale file (INFERRED — one uncommitted SEO batch with the Layout/Hero changes).
- seo data.md: keyword research (Google Ads US metrics, SERP domain analysis, competitor pages) — reference material.
- URL structure is stable: do not add patterns casually; do not change slugs (SKILL.md:125).

---

## 13. Responsive / Accessibility

CONFIRMED:

- Tested viewport matrices: 375/390/768/820/1280/1440 (test-png-removal.spec.ts:42-49) and 320-1440 nine-point matrix (collector TEST P, :647-657); SKILL targets 360/375/390/768/1024/1280/1440 (:82).
- No horizontal page overflow asserted at every viewport (:660-668; collector :670-673).
- Touch targets: >= 24px asserted for remove/download/ZIP controls (:654-658); design rule is >= 44px (SKILL.md:87, 106).
- Keyboard upload: dropzone role="button" + Enter/Space (SKILL.md:69).
- ARIA: #a11y-status live region; aria-current="step" on progress dots; aria-expanded on toggleable panels; role="alert" on upload error; focus moved to #results-heading after scan; skip-to-content link (SKILL.md:94-104).
- prefers-reduced-motion honored globally (SKILL.md:48, 102).
- Mobile nav: hamburger #mobile-menu-toggle below md (SKILL.md:86).

---

## 14. Test Architecture

CONFIRMED:

- Runner: Playwright (@playwright/test ^1.62.1), config playwright.config.ts:
  - testDir '.', testMatch '*.spec.ts', timeout 60000, baseURL http://localhost:4321, viewport 375x667, headless
  - testIgnore: ['**/.kilo/**', '**/node_modules/**'] (:14) — stale worktree copies must never run
  - No workers key: ALWAYS run with --workers=1 (serial) per project rule
  - No projects array: default single chromium
- Dev server: specs navigate to http://localhost:4321/en; server must be running (`astro dev --background`, AGENTS.md:3-9). Do not start a second instance.
- Fixture builders (independent of src/ on purpose):
  - test-png-fixture.mjs — PNG builders + strict CRC-validating chunk walker (:75-95). Key exports: buildRgbExifPng, buildRgbaExifPng, buildIccPng, buildTextualPng, buildPalettePng, buildTrnsPng, build16BitPng, buildPlainPng, buildMalformedPng, buildUnknownChunkPng, buildSingleChunkPng, buildUnverifiableXmpPng, buildBadCrcPng, buildNoIendPng, rebuildPng, textChunkPayload, ztxtChunkPayload (:196), itxtChunkPayload, readPngChunks, pngChunkTypes, findPngChunk, readIhdr, rawChunkBytes, idatBytes, leakedPrivacyValues, parsePngMetadata, PNG_PRIVACY_CHUNKS (:32).
  - audit-fixtures.mjs — hand-built TIFF/EXIF block builder buildExifBlock (:59), buildLensSerialJpeg (:213-249, Batch 3A), JPEG segment injectors (jpegSegment :117, injectAfterSoi :124, exifApp1Segment :188), buildComprehensiveJpeg/GpsJpeg/XmpJpeg/IptcJpeg/ComJpeg/TechnicalOnlyJpeg/PlainJpeg, buildMetadataPng/PlainPng, buildMetadataWebp(WithXmp)/PlainWebp, buildMetadataTiff/PlainTiff; independent inspectors: listJpegSegments, hasJpegExifSegment/XmpSegment/IptcSegment/ComSegment, findPlantedStrings/PLANTED_STRINGS, listPngChunks/pngHasMetadataChunks/pngIsStructurallyValid, listWebpChunks/webpIsStructurallyValid, isTiff. Self-test: audit-fixtures-selftest.mjs.
  - Reason for hand-building EXIF: sharp's withExifMerge silently drops ExifIFD/GPS tags (audit-fixtures.mjs:5-12)
- Locale parity one-liner (run from repo root):

```powershell
node -e "const f=(o,p='',x={})=>{for(const k in o){const n=p?p+'.'+k:k;o[k]&&typeof o[k]==='object'?f(o[k],n,x):x[n]=1}return x};const e=f(require('./src/locales/en.json')),d=f(require('./src/locales/de.json')),r=f(require('./src/locales/fr.json'));const df=(a,b)=>Object.keys(a).filter(k=>!(k in b));console.log('EN->DE:',df(e,d),'EN->FR:',df(e,r),'DE->EN:',df(d,e),'FR->EN:',df(r,e))"
```
- 19 spec files total (map in section 25).

Current verified focused results (2026-10-06, serial):
- test-png-removal.spec.ts: 26 passed / 0 failed
- test-metadata-full-collector-audit.spec.ts: 28 passed / 0 failed
- test-jpeg-exif-container-detection.spec.ts: 6 passed / 0 failed
- Full-suite state: NOT run in this batch — UNVERIFIED as a whole.

### Batch 3A outcome (test-only batch)
- zTXt: already covered end-to-end (detection test-png-removal.spec.ts:709; classification :774,:815; removal :375,:534; byte-absence :384,:547; CRC validity via verifyCleanPng). NO duplicate test added.
- LensSerialNumber: fixture buildLensSerialJpeg() added (audit-fixtures.mjs:213-249) + TEST Q "EXIF LensSerialNumber (0xA435) is classified as privacy and removed" (test-metadata-full-collector-audit.spec.ts:723-754) — PASSES. Zero src/ changes.

---

## 15. Completed Fixes / Batches

Chronological:

### Pre-batch committed work (already in git history)
- PNG structural removal + scan-side detection suite; WebP/TIFF suites; EXIF-container detection; output verification; ZIP gating; batch guards; stale-state regression; AVIF detection.
- 4 dedicated noindex tool pages + [tool].astro emptied (commits db2755c "one page", 7010a33 "other page").
- launch-gate spec + playwright testIgnore + cold-start timeouts (LAUNCH-GATE-REPORT.md).

### Batch 1 — XMP/IPTC + FR copy + Reset UX (uncommitted)
- XMP/IPTC container classification: new src/lib/jpeg.ts (readJpegPrivacySegments) + JPEG_SEGMENT_METADATA_KEY / XMP_IPTC_CONTAINER_KEY / isXmpIptcPrivacyKey logic in ToolUpload.astro; spec test-xmp-iptc-classification.spec.ts.
- French copy corrections in fr.json (site.description, seo.og_image_alt, seo.home title/description/og/twitter, hero title_a/title_b/tagline) + mirrored structural keys in en/de.
- Reset UX: localized dismiss of the upload-error banner (tool.dismiss_error in all 3 locales) + wiring; spec test-unsupported-reset-ux.spec.ts.

### Batch 2 — PNG privacy count correction 8 -> 9 (uncommitted)
- test-png-removal.spec.ts:770: buildTextualPng carries 4 EXIF privacy fields + 5 chunk entries = 9 (was asserted 8).

### Batch 3A — LensSerialNumber test coverage (uncommitted)
- buildLensSerialJpeg() fixture + TEST Q; zTXt confirmed already covered (section 14). Zero production changes.

### Cleanup batch (staged, uncommitted)
- Generated artifacts removed from tracking: .tmp-* (8 files), debug-after-upload.png, debug-before.png, debug-dom.html, dev-server.log, test-results/* (3 entries) — staged deletions.
- .gitignore +18 lines to keep them out.
- No commit yet.

---

## 16. Current Working Tree

As of 2026-10-06. The tree is NOT clean. Do not claim otherwise.

### Unstaged tracked modifications
- .gitignore (+18)
- astro.config.mjs (+10: vite.server.watch.ignored for audit-fixtures-out/ and test-results/, :15-18)
- src/components/Hero.astro (hero.h1_sep; img_before_alt/img_after_alt localized alts)
- src/components/ToolUpload.astro (+443: Batch 1 XMP/IPTC classification, PNG chunk scan integration, metadata viewer renderer, upload-error dismiss wiring)
- src/layouts/Layout.astro (+39: noindex prop :13/:33/:108, OG/home_seo head blocks)
- src/locales/{en,de,fr}.json (+~215 each: home_seo tail section, Batch 1 copy fixes, dismiss_error, h1_sep, img alts)
- test-output-verification.spec.ts (+1 scrollIntoViewIfNeeded at :413)
- test-png-removal.spec.ts (Batch 2 count fix)

### Staged deletions (cleanup batch)
- .tmp-git-diff-stat.txt, .tmp-git-diff-stat2.txt, .tmp-git-ds.txt, .tmp-git-names.txt, .tmp-git-untracked.txt, .tmp-h.txt, .tmp-head-tiff.ts, .tmp-head-webp.ts, debug-after-upload.png, debug-before.png, debug-dom.html, dev-server.log, test-results/.last-run.json, test-results/.../error-context.md, test-results/.../cleaned-tiff-*.tiff

### Untracked legitimate files
- audit-fixtures.mjs, audit-fixtures-selftest.mjs
- src/lib/jpeg.ts, src/components/SEOContent.astro
- test-avif-and-french-copy.spec.ts, test-jpeg-exif-container-detection.spec.ts, test-metadata-full-collector-audit.spec.ts, test-unsupported-reset-ux.spec.ts, test-xmp-iptc-classification.spec.ts
- PHOTO_METADATA_REMOVER_MASTER_AI_HANDOFF.md (this file)

### Known pre-existing (committed, not part of dirty state)
- 4 noindex tool pages, [tool].astro emptied, earlier suites (section 15).

---

## 17. Known Warnings / Gaps

Warnings, NOT confirmed bugs:

1. Legal identity placeholders: Impressum/Contact contain placeholder legal identity in all 3 locales (PRD-GAP-AUDIT:12; LAUNCH-GATE:36). Owner data required. Launch blocker.
2. Analytics inert: no .env / PUBLIC_PLAUSIBLE_DOMAIN -> zero events fire (PRD-GAP-AUDIT:14; LAUNCH-GATE:37). Coded correctly, not live.
3. Real-device HEIC verification missing (PRD-GAP-AUDIT:39; LAUNCH-GATE:38) — UNVERIFIED.
4. Genuine HEIC fixture missing: collector TEST M = "NOT TESTABLE" (test-metadata-full-collector-audit.spec.ts:482-487). Never fabricate one.
5. Safari multi-download throttle unverified (PRD-GAP-AUDIT:144; LAUNCH-GATE:38).
6. Lighthouse/CWV never measured (PRD-GAP-AUDIT:66, 131).
7. Sitemap omissions: how-it-works, legal, security live but not submitted (section 11).
8. Dead artifacts: src/pages/[lang]/[tool].astro (empty TOOLS, :17); Welcome.astro never imported (PAGE-ARCHITECTURE-AUDIT:230); README.md is the stock Astro starter; CLAUDE.md is 0 bytes.
9. AVIF: detection only; no removal pipeline (section 5). Awaiting an explicit AVIF decision.
10. JPEG canvas-fallback warning: mentioned in batch planning as a review item; current status UNVERIFIED — inspect before acting.
11. Deferred review items from Batch 3A scope control: dead-code cleanup candidates (isAvifFile, hidden class), full Playwright suite run.
12. 3 noindex tool pages' incoming-link status not re-audited since the route change (previously full orphans, PAGE-ARCHITECTURE-AUDIT:217-219) — UNVERIFIED.

---

## 18. Hard Project Rules

1. Astro only. No React, Vue, Svelte, Next.js, or "modernization" (SKILL.md:32).
2. Tailwind v4 only, design tokens from @theme/:root custom properties; no v3 syntax, no CSS-in-JS (SKILL.md:33, 44-48).
3. Client-side privacy architecture is immutable: no upload endpoints, no server actions, no image-processing services (SKILL.md:34).
4. ToolUpload.astro image-processing code is sacred — no "cleanup" passes on it (SKILL.md:35).
5. All UI strings come from src/locales/{en,de,fr}.json via t(); add keys to all three in the same change; verify parity before declaring done (SKILL.md:36, 110-119).
6. i18n architecture stays as-is; no new i18n library (SKILL.md:37).
7. Windows: use npm.cmd, never bare npm (PowerShell npm.ps1 wrapper — see section 24).
8. Playwright runs serially: --workers=1.
9. Never commit or push unless the user explicitly authorizes it.
10. Inspect actual source before changing anything; current code beats stale docs.
11. Work in small scoped batches (1-3 tasks); state scope first; hard stop after each batch.
12. Never modify production code during a test-only batch. If a real product bug surfaces, stop and report — do not fix it inside the batch.
13. Never weaken assertions, never skip/disable tests, never fabricate fixtures (especially HEIC).
14. Dev server: one instance only, `astro dev --background`; manage with `astro dev stop|status|logs` (AGENTS.md:3-9).
15. When updating this handoff, increment the "Last Updated" date at the top — never silently overwrite.

---

## 19. DO-NOT-TOUCH Areas

Explicitly preserved (modify only with explicit user instruction):

- JPEG segment stripper (APP1/APP13/COM surgery) — SKILL.md:35
- WebP RIFF EXIF/XMP processing — SKILL.md:35
- HEIC -> JPEG conversion + validateJpegBlob — SKILL.md:35
- AVIF detection — SKILL.md:35
- Batch ZIP processing (jszip path) — SKILL.md:35
- Object URL lifecycle (revokeAllPreviews) — SKILL.md:35, 78
- Progress state machine — SKILL.md:35
- Reset flow: handleFiles() state clearing, resetTool(), single #reset-btn — SKILL.md:75-78
- Existing fixture builders and their signatures (test-png-fixture.mjs, audit-fixtures.mjs)
- Existing test cases and assertions
- Locale parity (en/de/fr key sets)
- Layout navbar/footer — single sources, never duplicated (SKILL.md:57-58)
- data-* string-passing pattern on #files-list (SKILL.md:59, 119)
- playwright.config.ts testIgnore for .kilo/** — never run stale worktree specs

---

## 20. Next Pending Work

Priority candidates from CURRENT evidence. Do NOT execute without an explicit batch instruction.

1. Obtain a genuine HEIC fixture and perform real HEIC end-to-end verification (closes TEST M gap + real-device risk).
2. Legal identity: owner must replace Impressum/Contact placeholders (launch blocker).
3. Analytics activation: configure PUBLIC_PLAUSIBLE_DOMAIN, verify events fire.
4. Real-device / Safari verification: iPhone HEIC + multi-download throttle.
5. CWV/Lighthouse measurement; record results.
6. Sitemap gaps: decide whether how-it-works, legal, security (x3) should be submitted; hand-edit public/sitemap.xml if yes.
7. Deferred dead-code/fallback review: [tool].astro empty template, Welcome.astro, isAvifFile, hidden class, JPEG canvas-fallback warning, stale README.md, empty CLAUDE.md.
8. AVIF decision: full support (removal pipeline) vs documented detection-only.

---

## 21. Historical Contradictions

Preserved deliberately. For each: historical claim / current evidence / status / CURRENT AUTHORITY (which source wins).

1. Backend/API design
   - Historical claim: tool uses Astro server endpoints /api/scan and /api/clean (PRD:496, 506).
   - Current evidence: no server exists; 100% client-side (PRD-GAP-AUDIT:30).
   - Status: SUPERSEDED.
   - CURRENT AUTHORITY: client-side architecture. Ignore PRD:496,506.

2. Language selector size
   - Historical claim: FR-8 "10 languages, always visible" (PRD:163) vs PRD:297/§15 "3 live".
   - Current evidence: selector shows only en/de/fr.
   - Status: internal PRD contradiction; implementation correct.
   - CURRENT AUTHORITY: show live languages only (PRD:297 recommendation).

3. Locale key counts
   - Historical claims: 305 keys (PRD-GAP-AUDIT:31,85); 321 flat keys (LAUNCH-GATE:31).
   - Current evidence: 1019 flat keys x3, exact parity (verified 2026-10-06).
   - Status: SUPERSEDED (growth over time).
   - CURRENT AUTHORITY: current locale files. Re-run the flatten-diff after any string change.

4. OG image presence
   - Historical claim: "og:image: ABSENT on every page" (PRD-GAP-AUDIT:77).
   - Current evidence: dist/og-image.png exists (PAGE-ARCHITECTURE-AUDIT:46); OG meta blocks in uncommitted Layout changes.
   - Status: DISAGREE between audits; partially resolved.
   - CURRENT AUTHORITY: current Layout.astro + built output. Verify per-page before claiming full coverage.

5. ZIP status
   - Historical claim: "ZIP promise is a copy-vs-code FAIL — sequential individual downloads" (PRD-GAP-AUDIT:13).
   - Current evidence: jszip dependency; ZIP test passes; photometadataremover-cleaned.zip (LAUNCH-GATE:14,33; package.json:19).
   - Status: FIXED.
   - CURRENT AUTHORITY: current code + zip-verification-gating.spec.ts.

6. Upload validation / size limit
   - Historical claim: ".txt silently dropped; 40 MB accepted; no localized errors" (PRD-GAP-AUDIT:16,49). PRD proposed 25 MB cap (PRD:533).
   - Current evidence: unsupported-type and 40 MB cap errors implemented and tested (LAUNCH-GATE:15-16).
   - Status: validation FIXED; limit-value mismatch remains (25 PRD vs 40 code).
   - CURRENT AUTHORITY: code (40 MB). PRD:533 is stale.

7. Automated test/CI existence
   - Historical claim: "no in-repo automated test/CI" (PRD-GAP-AUDIT:53,64).
   - Current evidence: 19 spec files; focused runs green (section 14).
   - Status: SUPERSEDED.
   - CURRENT AUTHORITY: current spec files. (CI pipeline itself still UNVERIFIED — tests are local-run.)

8. Route/page architecture
   - Historical claims: 18 templates, 103 dist HTML, 90 sitemap locs, 5 tools via [tool].astro, open-source page exists (PAGE-ARCHITECTURE-AUDIT:13,35,238).
   - Current evidence: 21 templates; [tool] TOOLS=[] (:17); 4 dedicated noindex pages; open-source.astro gone; /photo-metadata-remover gone; 75 sitemap locs.
   - Status: SUPERSEDED (structure changed in commits db2755c/7010a33).
   - CURRENT AUTHORITY: current src/pages tree + public/sitemap.xml.

9. ToolUpload size
   - Historical claim: "~1500 LOC" (SKILL.md:59).
   - Current evidence: 2,211 lines (2026-10-06).
   - Status: DRIFTED.
   - CURRENT AUTHORITY: current file. Treat SKILL.md's size note as approximate.

10. Suite size
    - Historical claim: "Full suite: 10 passed" (LAUNCH-GATE:28).
    - Current evidence: 19 spec files.
    - Status: SUPERSEDED.
    - CURRENT AUTHORITY: current spec inventory (section 25).

11. Orphan tool pages
    - Historical claim: remove-exif-data / remove-gps-data / remove-metadata-heic fully orphaned, zero incoming links (PAGE-ARCHITECTURE-AUDIT:217-219).
    - Current evidence: pages are now dedicated noindex routes; incoming-link status not re-audited.
    - Status: UNVERIFIED.
    - CURRENT AUTHORITY: none — re-audit before acting.

12. Batch upload scope
    - Historical claim: batch upload is P2 non-goal (PRD:67,171).
    - Current evidence: implemented with Remove All / Download ZIP (PRD-GAP-AUDIT:41).
    - Status: EXCEEDED PRD (kept deliberately).
    - CURRENT AUTHORITY: current implementation.

---

## 22. AI WORKING PROTOCOL

Every future AI working on this project MUST:

1. Read this handoff first.
2. Inspect actual source before changing anything.
3. Never assume old PRD statements are current.
4. Prefer current repository evidence over stale documentation (see section 23).
5. Work in small batches of 1-3 tasks.
6. State scope before editing.
7. Never modify production code during a test-only batch.
8. Stop immediately when a production bug is discovered outside scope — report, do not fix.
9. Run focused tests first, not the full suite.
10. Use npm.cmd on Windows.
11. Run Playwright serially with --workers=1.
12. Never weaken assertions.
13. Never fabricate fixtures, especially HEIC/HEIF.
14. Never commit or push unless explicitly authorized.
15. Provide exact files changed and test results after every batch.
16. Hard stop after the requested batch.
17. When uncertain, ask for clarification — do not guess.
18. If a source document contradicts current code, always trust current code and record the contradiction in section 21.
19. Preserve the exact filename: PHOTO_METADATA_REMOVER_MASTER_AI_HANDOFF.md.
20. When updating this handoff, increment the "Last Updated" date field at the top — never silently overwrite.

---

## 23. Source Hierarchy

Priority order when sources disagree:

1. Current production source code (src/)
2. Current tests and fixtures
3. Current configuration (package.json, astro.config.mjs, playwright.config.ts)
4. Current audit/test evidence (spec run outputs)
5. Current project skill/rules (.agents/skills/photo-metadata-remover-ui/SKILL.md, AGENTS.md)
6. Current PRD/project documentation (PRD-photo-metadata-remover.md)
7. Historical audit documents (PRD-GAP-AUDIT.md, LAUNCH-GATE-REPORT.md, PAGE-ARCHITECTURE-AUDIT.md)
8. AI inference (must be marked INFERRED)

When sources disagree: prefer the higher source, explicitly record the contradiction in section 21, and add a CURRENT AUTHORITY line.

---

## 24. Common Commands

| Task | Command |
|---|---|
| Install | `npm.cmd install` |
| Dev server (background) | `npx.cmd astro dev --background` |
| Dev server status | `npx.cmd astro dev status` |
| Dev server logs | `npx.cmd astro dev logs` |
| Stop dev server | `npx.cmd astro dev stop` |
| Build | `npm.cmd run build` |
| Test single spec (serial) | `npx.cmd playwright test <file> --workers=1` |
| Test PNG suite | `npx.cmd playwright test test-png-removal.spec.ts --workers=1` |
| Test collector audit | `npx.cmd playwright test test-metadata-full-collector-audit.spec.ts --workers=1` |
| Test EXIF container | `npx.cmd playwright test test-jpeg-exif-container-detection.spec.ts --workers=1` |
| Git status | `git status --short` |
| Locale parity check | node one-liner: flatten en/de/fr and diff key sets (section 10) |

Why npm.cmd is mandatory on Windows: in PowerShell, bare `npm` resolves to the
npm.ps1 script, which is subject to PowerShell execution policy and can fail or
behave differently in non-interactive/agent shells. `npm.cmd` bypasses the
PowerShell wrapper entirely and runs the CMD shim directly — deterministic in
every shell. Same rule applied to `npx.cmd` for consistency.

---

## 25. Test File Map

Counts are static grep counts of test() blocks; loop-generated cases expand at
runtime (runtime totals in parentheses where observed).

| Spec file | Format | Coverage | Count |
|---|---|---|---|
| launch-gate-test.spec.ts | JPEG/ZIP/validation | clean-output bytes, ZIP archive, unsupported type, 40 MB cap | 4 |
| metadata-classification-test.spec.ts | JPEG | privacy classification | 5 |
| stale-batch-mutation-regression.spec.ts | batch | batch state mutation regression | 5 |
| stale-state-test.spec.ts | tool UX | stale state on re-upload/replace | 4 |
| test-avif-and-french-copy.spec.ts | AVIF/FR | AVIF detection + French copy | 6 |
| test-batch-guard.spec.ts | batch | busy guard, sequential processing | 9 |
| test-dom-inspect.spec.ts | tool UX | DOM inspection | 1 |
| test-e2e-strip-rereupload.spec.ts | JPEG | strip -> re-upload verification | 3 |
| test-high-volume-batch.spec.ts | batch | high-volume batches | 6 |
| test-jpeg-exif-container-detection.spec.ts | JPEG | unreadable/edge EXIF container detection | 6 (6/6 on 2026-10-06) |
| test-metadata-full-collector-audit.spec.ts | all formats | collector audit TEST A-Q incl. LensSerialNumber | 20 blocks (28 runtime, 28/28 on 2026-10-06) |
| test-output-verification.spec.ts | JPEG/PNG | post-removal output verification | 8 |
| test-png-autostrip-decision.spec.ts | PNG | auto-strip decision logic | 8 |
| test-png-removal.spec.ts | PNG | structural removal, scan-side detection, responsive | 23 blocks (26 runtime, 26/26 on 2026-10-06) |
| test-tiff-removal.spec.ts | TIFF | TIFF removal | 4 |
| test-unsupported-reset-ux.spec.ts | tool UX | unsupported type + reset UX | 6 |
| test-webp-removal.spec.ts | WebP | RIFF removal, alpha preserved | 6 |
| test-xmp-iptc-classification.spec.ts | JPEG | XMP/IPTC container classification | 6 |
| zip-verification-gating.spec.ts | ZIP | ZIP verification gating | 9 |

Fixture/support modules (not specs): test-png-fixture.mjs, audit-fixtures.mjs, audit-fixtures-selftest.mjs, plus Node harness scripts (test-*.mjs) that are NOT Playwright specs and are not matched by testMatch.

---

## 26. Route Inventory

Type: static = prerendered at build. "Indexable?" reflects the noindex prop and sitemap presence.

| Route | Lang | Type | Indexable? |
|---|---|---|---|
| / | - | static (language chooser + client redirect) | Not in sitemap |
| /{lang}/ | en,de,fr | static, main tool (ToolUpload) | Yes (in sitemap) |
| /{lang}/about | en,de,fr | static | Yes |
| /{lang}/blog | en,de,fr | static | Yes |
| /{lang}/blog/{slug} x12 | en,de,fr | static (BLOG_SLUGS allowlist) | Yes |
| /{lang}/contact | en,de,fr | static | Yes |
| /{lang}/faq | en,de,fr | static | Yes |
| /{lang}/formats | en,de,fr | static | Yes |
| /{lang}/guides | en,de,fr | static | Yes |
| /{lang}/guides/{slug} x3 | en,de,fr | static | Yes |
| /{lang}/how-it-works | en,de,fr | static | Live, NOT in sitemap (gap) |
| /{lang}/impressum | en,de,fr | static | Yes |
| /{lang}/legal | en,de,fr | static | Live, NOT in sitemap (gap) |
| /{lang}/privacy | en,de,fr | static | Yes |
| /{lang}/security | en,de,fr | static | Live, NOT in sitemap (gap) |
| /{lang}/terms | en,de,fr | static | Yes |
| /{lang}/view-photo-metadata | en,de,fr | static, dedicated page | NO — noindex, nofollow; excluded from sitemap |
| /{lang}/remove-exif-data | en,de,fr | static, dedicated page | NO — noindex, nofollow; excluded from sitemap |
| /{lang}/remove-gps-data | en,de,fr | static, dedicated page | NO — noindex, nofollow; excluded from sitemap |
| /{lang}/remove-metadata-heic | en,de,fr | static, dedicated page | NO — noindex, nofollow; excluded from sitemap |
| /{lang}/{tool} via [tool].astro | - | dead template (TOOLS=[] :17) | Generates nothing |
| /{lang}/photo-metadata-remover | - | REMOVED — does not exist | - |
| /{lang}/open-source | - | REMOVED — does not exist | - |

---

## 27. Do Not Touch — Quick List

- JPEG segment stripper
- WebP RIFF EXIF/XMP processing
- HEIC conversion + validateJpegBlob
- AVIF detection
- Batch ZIP processing
- Object URL lifecycle (revokeAllPreviews)
- Progress state machine
- Reset flow (handleFiles clearing, resetTool, #reset-btn)
- Existing fixture builders and signatures
- Existing test cases and assertions
- Locale parity (en/de/fr)
- Layout navbar/footer (single sources)
- data-* string passing on #files-list
- playwright.config.ts testIgnore for .kilo/**
- This file's name and top metadata block

---

## 28. Contradictions Quick Table

| # | Topic | Historical | Current | Authority |
|---|---|---|---|---|
| 1 | Backend/API | /api/scan,/api/clean (PRD:496,506) | 100% client-side | Code |
| 2 | Lang selector | "10 languages" (PRD:163) | en/de/fr shown | Code + PRD:297 |
| 3 | Locale keys | 305 / 321 | 1019 x3 parity | Locale files |
| 4 | OG image | "ABSENT" (audit:77) | og-image.png in dist | Layout + build |
| 5 | ZIP | "copy-vs-code FAIL" | jszip ZIP tested | Code |
| 6 | Upload cap | 25 MB (PRD:533) / none (audit:16) | 40 MB enforced | Code |
| 7 | Test suite | "no test/CI" (audit:53,64) | 19 specs | Spec files |
| 8 | Routes | 18 templates / 90 locs | 21 templates / 75 locs | src/pages + sitemap |
| 9 | ToolUpload LOC | ~1500 (SKILL:59) | 2211 | Current file |
| 10 | Suite size | "10 passed" (LAUNCH-GATE:28) | 19 specs | Spec files |
| 11 | Tool orphans | 3 orphaned pages | noindex pages; links unaudited | None — re-audit |
| 12 | Batch upload | P2 non-goal (PRD:67,171) | Implemented | Code |

---

END OF HANDOFF — update the "Last Updated" date when modifying.
