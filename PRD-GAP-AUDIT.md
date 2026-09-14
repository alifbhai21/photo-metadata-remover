# FINAL PRD GAP AUDIT

**Date:** 2026-09-06
**Scope:** `PRD-photo-metadata-remover.md` (v1.0, 694 lines) vs. the Astro implementation in `src/`.
**Mode:** Read-only audit — no source files modified. Verified against live code, not just intent.

## Executive Summary

The implementation is a **working, production-shaped client-side tool** that satisfies the PRD's core privacy promise (FR-3–5 "never leaves your device") and all SEO plumbing (FR-9–13), and **exceeds launch scope** where it matters least (batch upload FR-16 built despite being P2; 5 SEO tool pages + 2 guides added; Impressum added). The PRD itself is internally inconsistent in spots (FR-8 "10 languages" vs §15 "3 live"; §14 references a non-existent AC-9.7; §10/§7 plan server APIs that don't exist).

**Blockers before public launch:**
1. **Impressum/Contact/legal identity is placeholder text** in all three locales (`{{legal_name}}` etc.) → renders literal brackets on `/de/impressum`. Owner must supply real data.
2. **ZIP promise is a copy-vs-code FAIL** — all three locales claim "Download ZIP" (`features.batch.description` L153, FAQ q5 L225); the code does sequential individual downloads (`downloadAll` → `triggerDownload` loop). Either add real ZIP or fix copy.
3. **Analytics is coded but inert** — no `.env` → `isAnalyticsEnabled()` false → zero events fire. Owner must configure before events "firing" (launch gate).

**Notable FR gaps:** no file-size validation and no localized invalid-type error (FR-1/AC-1.2 — a `.txt` is silently dropped and an unlimited-size file is accepted), dropzone not keyboard-operable and no ARIA live region (PRD §12), no 4-step progress indicator.

---

## Requirement Matrix

### Functional Requirements (FR-1 … FR-17)

| ID | Verdict | Evidence |
|---|---|---|
| **FR-1** Upload (drag-drop + picker), client-side type/size validation, localized errors | **PARTIAL** | Dropzone + `multiple` input. Type validated (`handleFiles`), **size not validated anywhere** (no `file.size` gate). Invalid files are silently skipped — no localized "Unsupported file type" / "File too large". |
| **FR-2** Scan: found/not-found per family + values | **PARTIAL** | Per-file "N metadata fields found" + inline detail viewer (≈70 privacy keys incl. GPS, exposure, camera, copyright) with values, GPS human-readable. **No per-family ⚠/✓ checklist rows** as §6 Step 2 diagrams. Equivalent info, different presentation. |
| **FR-3** Remove EXIF/GPS/IPTC/XMP/comments/thumbnail, preserve ICC | **PASS** | JPEG path strips APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), COM; keeps APP0/APP2(ICC)/APP14; thumbnail (IFD1) removed with APP1. Non-JPEG → canvas re-encode (fresh pixels, metadata-free); HEIC→clean JPEG. |
| **FR-4** Download original name + `-clean` suffix | **PASS** | Output `${base}-clean.${ext}`. |
| **FR-5** In-memory only, no storage/logs | **PASS** | 100% client-side; no fetch/XHR/sendBeacon/WebSocket/Worker in `src/`. `heic2any` bundled. Blob URLs revoked. No server exists — stronger than required. |
| **FR-6** Localized UI (all live languages) | **PASS** | en/de/fr, 305 keys each, **identical key sets**. All hotspot strings translated. |
| **FR-7** Lang detection + manual override, persisted cookie + localStorage | **PASS** | `detectBrowserLang()` + saved override; persisted **cookie (samesite=lax) AND localStorage**; `documentElement.lang` updated. |
| **FR-8** Selector "10 languages, always visible" | **PASS w/note** | Shows only en/de/fr — matches §9.3 + §15 ("10-ready, only live shown"). FR-8 literal conflicts with §15; internal PRD contradiction, implementation correct. |
| **FR-9** hreflang + x-default; localized sitemaps | **PASS w/note** | Every localized page: hreflang (3) + x-default + canonical. One aggregated `sitemap.xml` (90 loc) instead of per-locale sitemaps — functionally equivalent. |
| **FR-10** Structured data | **PASS** | SoftwareApplication (`pages/[lang]/index.astro`), FAQPage, Article + BreadcrumbList (blog), WebSite (root). |
| **FR-11** Blog: 12 posts + index | **PASS** | 12 slugs, localized per locale, index page, related posts, CTAs. |
| **FR-12** Static pages About/Contact/Privacy/Terms localized | **PASS** | All present en/de/fr; Impressum added (beyond PRD). |
| **FR-13** Analytics events | **PASS (inert-by-default)** | Names match PRD §11.8 exactly: `file_upload`, `scan_complete{total,with_metadata}`, `removal_complete`, `download_click`, `language_switch{from,to}`. No `.env` → `trackEvent` no-ops → nothing fires until configured. |
| **FR-14** HEIC/HEIF → clean JPEG (P1) | **PASS (9/9; real-device PENDING)** | JPEG/PNG/WebP/TIFF stripping byte-verified via fixtures (`fr14-exif.jpg` 942 B, clean PNG, fake-HEIC); dedicated WebP EXIF-chunk parser; heic2any (bundled WASM) converts first frame @0.92; error path handled. Real iPhone HEIC + Safari multi-download throttle **unverified**. |
| **FR-15** Verify re-scan (P2) | **OUT OF SCOPE** | Not built. Correctly deferred (P2). |
| **FR-16** Batch upload (P2 "future") | **PASS w/note** | **Implemented** (multi-file, per-item rows, remove-all/download-all) — exceeds launch scope. Its advertised ZIP download is false (see Blockers). |
| **FR-17** Country landing pages (P2) | **OUT OF SCOPE** | Not built. Correctly deferred. |

### Step Acceptance Criteria (§6)

| AC | Verdict | Evidence |
|---|---|---|
| **AC-1.1** 15 MB → scan ≤5 s on 20 Mbps | **N/A / PENDING** | No upload/network step in client-only architecture; parse speed device-dependent, unmeasured. |
| **AC-1.2** `.txt`/40 MB → localized error, no server hit | **FAIL** | `.txt` silently dropped (no "Unsupported file type"); 40 MB file accepted (no size cap). No server exists, but the mandated localized UX errors are absent. |
| **AC-2.1** GPS EXIF → coordinates, human-readable | **PASS** | `isGpsRelated` + `formatValue` render GPS as readable coordinates in detail viewer. |
| **AC-2.2** Clean screenshot → all rows ✓ NOT FOUND | **PARTIAL** | Shows "No metadata found" (0 fields) instead of per-row ✓ checklist. Equivalent info, different presentation. |
| **AC-2.3** ≤3 s scan for 10 MB | **PENDING** | Client-side, unmeasured; async + 30 s `STRIP_TIMEOUT_MS` guard prevents hangs. |
| **AC-3.1** Clean output: zero EXIF/GPS/IPTC/XMP/COM (exiftool, **enforced by automated test**) | **PARTIAL** | Behavior **PASS** — byte-verified (re-parse of clean fixture: no APP1/APP13/COM). `exiftool` not installed (equivalent independent parse used). **No in-repo automated test/CI** → "enforced by test" clause unmet. |
| **AC-3.2** Visually indistinguishable + ≤110% size | **PARTIAL** | JPEG path preserves pixels **byte-exactly** (segment surgery, no re-encode) → indistinguishable and ≤100%. Canvas re-encode paths (PNG/WebP/TIFF→PNG) can vary; ≤110% not automated. |
| **AC-3.3** No disk writes / no image data in logs | **PASS** | True by construction — no server, no storage, no network. Stronger than required. |

### Launch Checklist (§14)

| Gate | Verdict |
|---|---|
| "69 URLs live" | **W/N** — 90 sitemap URLs (30 pages × 3) + root chooser = 91 rendered pages. Scope grew (5 tool pages + 2 guides + Impressum); count mismatch is growth, not defect. |
| "3 locales 100% translated (AC-9.7)" | **PASS** — 305/305 keys, identical sets. (AC-9.7 is a phantom reference — no AC-9 exists in §6.) |
| "hreflang/sitemap valid" | **PASS** — reciprocal, x-default=en, counts consistent. |
| "zero-metadata test passing in CI" | **FAIL** — no test suite/CI in repo; only a manual e2e re-parse proved locally. |
| "privacy tests passing (AC-3.3)" | **PASS** — by-construction true (no server). Not automated. |
| "CWV green" | **PENDING** — no Lighthouse/PSI run recorded. |
| "Impressum live" | **BLOCKED (OWNER)** — page + footer link live and localized, but legal identity is placeholders. |
| "analytics events firing" | **PENDING** — coded correctly; needs `.env` + verification. |

---

## SEO Audit

- **Sitemap:** 90 `<loc>`, 360 `xhtml:link`, zero `<lastmod>`. 30 unique pages × 3 locales; root `/` chooser excluded (91 rendered pages total).
- **hreflang:** reciprocal + `x-default` on every localized page; `canonical` present.
- **robots.txt:** valid; `/api/` disallow moot (no API routes).
- **og:image: ABSENT** on every page → social cards unfilled; `twitter:card=summary`.
- **Titles:** unique; `fullTitle = ${title} | ${siteName}`; home distinct (no clash).
- **Structured data:** SoftwareApplication, FAQPage, Article, BreadcrumbList, WebSite present. Note: root WebSite `inLanguage` uses an **array** (non-standard; minor).
- **Blog:** 12 slugs localized; internal tool CTAs + related posts; guides (2) extra.
- **Tool SEO pages:** 5 variants/locale (photo-metadata-remover, remove-exif-data, remove-gps-data, view-photo-metadata, +1) — exceeds §8.2.

## i18n Audit

- en/de/fr = **305 keys each, identical key sets** (diff-verified).
- Only legitimate `{{token}}` interpolation + legal placeholders; no stray HTML/typos in key paths.
- **ZIP mismatch propagated to all 3 locales** (batch description + FAQ q5).
- Hardcoded English `aria-label`: "Menu" and "Change language" in Layout — **not localized**.
- `documentElement.lang` updates on switch; persisted cookie+localStorage.
- PRD §6 minimum-string set all present and translated.

## Analytics

- Event names verified against PRD §11.8: `file_upload`, `scan_complete {total, with_metadata}`, `removal_complete` (fires only when privacy fields > 0), `download_click`, `language_switch {from,to}`.
- **Inert by default:** no `.env*` at root → `isAnalyticsEnabled()==false` → no-op → Plausible script not injected. Report as "coded, not live".
- Cookieless approach matches PRD Q6 default (no consent banner needed).

## Privacy

- **Zero network usage:** no fetch/XHR/sendBeacon/WS/Worker; `heic2any` is bundled local WASM; no `/api/*`; no storage; no logs. Strictly stronger than PRD.
- UI copy ("photos never leave your device") matches practice.
- Privacy page words analytics copy on/off with `*_analytics` key variants so copy stays truthful.
- Only cookie = language preference (`samesite=lax`, 1-yr). **Confirm the lang cookie is disclosed in the Privacy Policy** (owner check).

## HEIC

- Detection via type (`image/heic|image/heif`) + name heuristic; `heic2any` (libheif WASM) → clean JPEG @0.92, first frame of multi-image.
- HEIC preview placeholder (no broken `<img>`); clean output labeled with `jpg` ext.
- Fake-HEIC error path verified; **real iPhone HEIC (iOS/Safari) = PENDING**.

## Accessibility / §12 UX

| Item | Verdict |
|---|---|
| `<html lang>` per locale, runtime switch | **PASS** |
| **Keyboard-operable dropzone** | **FAIL** — `#upload-zone` is a plain `<div>`; input `display:none` (unfocusable); no `tabindex`/`role`. WCAG 2.1.1. |
| **ARIA live region** for scan/removal results | **FAIL** — no `aria-live`/`role=status|alert` anywhere in `src/`. |
| Localized aria-labels | **FAIL** — Layout nav a11y labels hardcoded English (2 sites). |
| aria-expanded/controls on metadata toggles; Escape closes viewer | **PASS** |
| Status conveyed by icon + text, not color alone | **PASS** (✓/⚠ glyphs + label) |
| Real `<button>` elements, focusable | **PASS** |
| FAQ native `<details>/<summary>` | **PASS** |
| **Visible 4-step progress indicator** (Upload→Scan→Remove→Download, §12) | **FAIL** — not present; only a spinner + per-item status lines. |
| Scanning skeleton / per-item progress animation | **PARTIAL** — drag-over overlay ✓; no skeleton; per-item status lines only. |

## Performance

- Client-side only; code-split dynamic imports (`exifr`, `heic2any`); inline SVGs; Tailwind utility CSS.
- 30 s `STRIP_TIMEOUT_MS` cap per file; sequential batch with busy guard.
- Blob URL lifecycle managed (revoke on download, full revoke on reset).
- **No build-size/CWV measurement recorded** (no Lighthouse run).

## Legal (§13)

- Privacy Policy / Terms: localized, present — content-level legal review = owner scope.
- **Impressum: page + `/de/` footer link present, but legal identity is placeholders → launch blocker** (TMG/DDG).
- Contact page real-identity info = same placeholder concern (owner).
- No consent banner needed (cookieless); ✓ aligns Q6.

---

## Remaining Blockers / Owner Actions
1. **Fill Impressum + Contact legal identity** in all 3 locales; legal review of Privacy/Terms.
2. **Resolve ZIP lie:** add real ZIP (e.g., JSZip) or change en/de/fr copy (`features.batch.description` + FAQ q5) to match per-file downloads. Watch browser download-throttle on multi-file programmatic clicks.
3. **Enable `.env` analytics** and re-verify events fire (Plausible reachable).
4. **Real-device HEIC** (iPhone) + Safari multi-download test.
5. **og:image** (single static asset in Layout head) + confirm twitter card image.

## Recommended Next Code Fixes (non-blocking, high value)
1. **FR-1/AC-1.2:** add a size cap (e.g., 25 MB) + localized `file_too_large` / `unsupported_type` messages in `handleFiles` instead of silent skip + unlimited accept.
2. **A11y:** make dropzone focusable (`tabindex="0"`, `role="button"`, keydown→open input, focus ring), add `aria-live="polite"` region for global status, localize the 2 Layout aria-labels.
3. **Add a launch-gate CI test** (re-encode crafted fixtures, assert clean output has no APP1/APP13/COM and no GPS/IPTC/XMP keys) to satisfy "zero-metadata test passing in CI".
4. **4-step progress indicator** (or record an explicit design-owner deviation).

---

**Verdict:** *Conditionally ship.* Core engine + SEO verified solid; **go/no-go hinges on (1) legal identity, (2) ZIP copy fix or implementation, (3) analytics activation, and (4) real-device HEIC confirmation.**