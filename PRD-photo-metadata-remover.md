# Product Requirements Document (PRD)

## Photo Metadata Remover — Multilingual EXIF Removal Web Tool

| Field | Detail |
|---|---|
| **Product** | Photo Metadata Remover *(working title — brand name TBD)* |
| **Version** | 1.0 |
| **Date** | 2 September 2026 |
| **Status** | Draft — for stakeholder review & sign-off |
| **Tech stack** | Astro.js (frontend + backend server endpoints), **no database** |
| **Launch scope** | 23 pages × 3 languages = **69 localized URLs** |

---

## 1. Executive Summary

Photo Metadata Remover is a free, privacy-first web tool that lets anyone upload a photo, see exactly what hidden metadata it contains (GPS location, camera model, date/time, software, personal names), remove **all** of it with one click, and download a clean, metadata-free image.

The product is built on two pillars:

1. **Primary USP:** *Remove EXIF metadata from photos instantly and privately.* Photos are processed securely and never stored.
2. **Secondary USP (conversion + SEO driver):** Fully localized experience in **10 languages**, targeting high-value markets in North America and Europe first, expanded over time based on search data.

The site pairs the tool with a content/SEO program (blog + tool-specific landing pages) and a scalable translation architecture (`/locales/*.json` dictionaries + `t()` lookups) so new languages can be added with minimal engineering effort.

**Phase 1 launches with English, German, and French.** The language system is built 10-language-ready from day one, but only 3 locales go live; the remaining languages are rolled out in phases, driven by Google Search Console and analytics demand data.

---

## 2. Problem & Opportunity

### Problem
Every photo taken by a smartphone or camera carries embedded metadata (EXIF, GPS, IPTC, XMP): exact GPS coordinates, device model, timestamps, and sometimes the owner's name. Most users:

- Don't know this data exists,
- Don't know how to check it,
- Can't easily remove it without installing desktop software.

Sharing photos online (social media, marketplaces, forums, classifieds) can therefore leak a user's **home address, device, and schedule**.

### Opportunity
- High, evergreen search demand for queries like *"how to remove EXIF data"*, *"does Instagram remove EXIF"*, *"remove location from photo"* — across English **and** major European languages, where competition is significantly lower than in English.
- Competing tools are mostly English-only, ad-cluttered, or require uploads to servers with unclear retention policies.
- A fast, clean, multilingual, privacy-first tool with strong localized content can win rankings and trust in under-served language markets.

---

## 3. Goals & Non-Goals

### Goals

| # | Goal | Measure |
|---|---|---|
| G1 | Launch a fully functional metadata remover tool | 70%+ completion rate (upload → download clean file) |
| G2 | Launch with EN + DE + FR | 69 URLs live and submitted to Google Search Console |
| G3 | Win organic search traffic in 3 languages | 69/69 URLs indexed within 8 weeks; traffic targets in §4 |
| G4 | Best-in-class privacy story | Zero photo storage, verified by tests & policy |
| G5 | i18n architecture ready for 10+ languages | Adding a locale requires only a JSON file + slugs, no code changes |
| G6 | Excellent performance | Lighthouse ≥ 90 (mobile), LCP < 2.5s |

### Non-Goals (v1)

- ❌ User accounts / sign-up / login
- ❌ Database of any kind (no user data persisted)
- ❌ Country-specific landing pages (`/en-us/`, `/en-gb/` …) — future phase, see §10.5
- ❌ Batch / multi-file processing — candidate for future phase
- ❌ Native mobile apps
- ❌ Photo editing features beyond metadata removal
- ❌ Monetization at launch (see Open Question Q2)

---

## 4. Success Metrics (KPIs)

| Metric | Target | Source |
|---|---|---|
| URLs indexed (Phase 1) | 69/69 within 8 weeks | Google Search Console |
| Organic sessions | 5k/mo by month 3; 20k/mo by month 6 *(placeholder — confirm at kickoff)* | Analytics |
| Non-EN share of traffic (DE + FR) | ≥ 25% by month 3 | Analytics |
| Tool completion rate (upload → download) | ≥ 70% | Analytics events |
| Scan time (10 MB file) | < 3 s | RUM / server timing |
| Removal time (10 MB file) | < 5 s | RUM / server timing |
| Lighthouse performance (mobile) | ≥ 90 | CI |
| LCP / CLS / INP | < 2.5s / < 0.1 / < 200ms | CWV |
| Bounce rate on tool pages | < 50% | Analytics |
| Language-switch events | Tracked (informs Phase 2 rollout) | Analytics events |

---

## 5. Target Users & Personas

| Persona | Context | Need |
|---|---|---|
| **Maya, 24 — Social sharer (Germany)** | Posts photos of her apartment, dog, workouts; heard photos can reveal her address | Check + strip location in < 30 seconds, in German |
| **Amina, 31 — Journalist / activist** | Shares photos from sensitive locations; sources must not be identifiable | Guaranteed removal of **all** metadata; proof via scan results |
| **Lukas, 38 — Freelance photographer** | Sends client portfolios; embeds his name in files but wants clean delivery copies | Remove EXIF/IPTC/XMP without re-exporting through Lightroom |
| **Sofia, 45 — Marketplace seller (France)** | Lists items with photos taken at home | Remove GPS before uploading listings, in French, no software install |

**Key insight:** the common denominator is *zero friction and trust*. Users must be able to act in under a minute without creating an account, and must believe (and see proof) that the photo is truly clean and never stored.

---

## 6. Core Product Flow

```
Step 1                          Step 2                        Step 3                       Step 4
📸 Upload Photo                 Privacy Scan                  Remove Everything            Privacy Result
      ↓                               ↓                             ↓                            ↓
[ Drop your image here ]    ⚠ GPS Location      FOUND      EXIF       ✓ removed          🔒 Your photo is now
[ Upload Photo button ]     ⚠ Camera Model      FOUND      GPS        ✓ removed             metadata-clean.
                            ⚠ Date/Time         FOUND      IPTC       ✓ removed
                            ⚠ Software          FOUND      XMP        ✓ removed               ↓
                            ✓ Personal Name  NOT FOUND     Comments   ✓ removed          [ Download Clean Photo ]
                                                            Thumbnail  ✓ removed
```

### Step details & acceptance criteria

**Step 1 — Upload**
- Drag-and-drop zone + click-to-browse ("Upload Photo" / "Drop your image here").
- Accepts: JPEG/JPG, PNG, WebP, TIFF, HEIC/HEIF *(HEIC = P1, see §11.3)*.
- Client-side validation: file type + size before upload; clear localized error messages.

> **AC-1.1** Uploading a 15 MB JPEG shows a progress state and reaches the scan step in ≤ 5 s on a 20 Mbps connection.
> **AC-1.2** Uploading a `.txt` or 40 MB file shows the localized error "Unsupported file type" / "File too large" and does **not** hit the server.

**Step 2 — Privacy Scan**
- Reads metadata and displays a checklist: GPS Location, Camera Model, Date/Time, Software, **Personal Name** (Artist/Author/Copyright fields), plus Camera, GPS Coordinates, File Size in the details panel.
- Each row shows ⚠ FOUND (with the actual value, e.g. `48.8584° N, 2.2945° E`) or ✓ NOT FOUND.

> **AC-2.1** A photo with GPS EXIF shows "⚠ GPS Location — FOUND" with coordinates parsed to human-readable form.
> **AC-2.2** A clean screenshot PNG shows all rows ✓ NOT FOUND.
> **AC-2.3** Scan results appear within 3 s for a 10 MB file.

**Step 3 — Remove Everything**
- One button: "Remove Metadata".
- Strips: **EXIF (incl. GPS), IPTC, XMP, Comments, Embedded thumbnail**. ICC color profile is preserved by default to maintain color fidelity *(decision, see §11.2)*.
- All checks turn ✓ as each metadata family is removed.

**Step 4 — Privacy Result + Download**
- Confirmation: "🔒 Your photo is now metadata-clean."
- "Download Clean Image" button; output keeps original pixel dimensions and visual quality.
- Re-scan of the cleaned file offered as proof (optional P2: "Verify" button).

> **AC-3.1** Output of a GPS-tagged JPEG contains **zero** EXIF/GPS/IPTC/XMP/Comment tags when verified with `exiftool -a -G1` (enforced by automated test).
> **AC-3.2** Output image is visually indistinguishable from input (no re-encode artifacts beyond one compression pass) and ≤ 110% of original file size.
> **AC-3.3** Nothing is written to disk on the server; no image data appears in any log (enforced by test).

---

## 7. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Upload via drag-and-drop and file picker; client-side type/size validation with localized errors | P0 |
| FR-2 | Metadata scan displaying found/not-found status per metadata family, with values | P0 |
| FR-3 | One-click removal of EXIF, GPS, IPTC, XMP, comments, embedded thumbnail | P0 |
| FR-4 | Download of the cleaned image (original filename + `-clean` suffix) | P0 |
| FR-5 | In-memory processing only; no storage, no disk writes, no image data in logs | P0 |
| FR-6 | Localized UI: all buttons, headings, results, errors, FAQ, privacy copy in every live language | P0 |
| FR-7 | Automatic language detection (browser language) with manual override persisted in cookie + localStorage | P0 |
| FR-8 | Header language selector (10 languages, always visible) | P0 |
| FR-9 | hreflang + x-default on every page; localized XML sitemaps | P0 |
| FR-10 | Structured data: SoftwareApplication, FAQPage, Article (blog), BreadcrumbList | P0 |
| FR-11 | Blog: 12 posts at launch (8 confirmed topics + 4 proposed, §8.1) + blog index | P0 |
| FR-12 | Static pages: About, Contact, Privacy Policy, Terms — localized | P0 |
| FR-13 | Analytics events: upload, scan_complete, removal_complete, download, language_switch | P0 |
| FR-14 | HEIC/HEIF input support (convert to clean JPEG output) | P1 |
| FR-15 | "Verify cleaned file" re-scan button on result step | P2 |
| FR-16 | Batch upload (multiple files) | P2 (future phase) |
| FR-17 | Country-specific landing pages (`/en-us/`, `/en-gb/`, `/en-ca/`, `/en-au/`) | P2 (future phase, §10.5) |

### Localized UI strings (minimum scope — from hero through errors)

- **Hero/UI:** "Photo Metadata Remover" · "Remove hidden metadata from your photos" · "Upload Photo" · "Drop your image here" · "Remove Metadata" · "Download Clean Image"
- **Scan results:** "Metadata Found" · Camera · Location · Date Taken · GPS Coordinates · Software · File Size
- **Errors/success:** "File too large" · "Unsupported file type" · "Something went wrong" · "Please upload an image" · "Your image has been cleaned"
- **FAQ:** What is photo metadata? · Why should I remove EXIF data? · Does this tool store my photos? · Is this tool free?
- **Privacy:** "Your photos are processed securely." · "We don't store your uploaded images."

---

## 8. Content Requirements

### 8.1 Blog posts (12 at launch)

**Confirmed (8):**

| # | Slug | Intent |
|---|---|---|
| 1 | `/blog/what-is-photo-metadata` | Informational |
| 2 | `/blog/what-is-exif-data` | Informational |
| 3 | `/blog/can-photos-reveal-your-location` | Problem-aware |
| 4 | `/blog/how-to-remove-location-data-from-photos` | Transactional → tool |
| 5 | `/blog/how-to-remove-exif-data` | Transactional → tool |
| 6 | `/blog/does-instagram-remove-exif` | High-volume question |
| 7 | `/blog/how-to-check-photo-metadata` | Transactional → viewer |
| 8 | `/blog/what-information-is-hidden-in-a-photo` | Problem-aware |

**Proposed additions (4) — to reach 12 and cover adjacent high-volume queries:**

| # | Slug | Intent |
|---|---|---|
| 9 | `/blog/does-whatsapp-remove-exif-data` | High-volume question |
| 10 | `/blog/how-to-remove-exif-data-on-iphone` | Device-specific how-to |
| 11 | `/blog/how-to-remove-exif-data-on-android` | Device-specific how-to |
| 12 | `/blog/iptc-vs-xmp-metadata-explained` | Deep-dive / authority |

Every post: ≥ 1,000 words (localized), embedded CTA to the tool, FAQ block with schema, internal links to tool pages and related posts.

### 8.2 Tool landing pages (5)

| # | EN slug (proposed) | Purpose |
|---|---|---|
| 1 | `/photo-metadata-remover` | Primary tool page (main SEO target) |
| 2 | `/remove-exif-data` | EXIF-specific keyword variant |
| 3 | `/remove-gps-data` | GPS/location-specific variant |
| 4 | `/view-photo-metadata` | "check metadata" intent (scan-only mode) |
| 5 | `/remove-metadata-heic` | iPhone/HEIC-specific variant *(ships at P1 with HEIC support)* |

### 8.3 Full page inventory — 23 pages per language

| # | Page | Type |
|---|---|---|
| 1 | Homepage `/` | Tool + hero |
| 2–6 | 5 tool landing pages | Tool |
| 7 | Blog index `/blog` | Content |
| 8–19 | 12 blog posts | Content |
| 20 | About | Trust |
| 21 | Contact | Trust |
| 22 | Privacy Policy | Legal |
| 23 | Terms of Service | Legal |

**23 pages × 3 launch languages = 69 URLs.** All 69 ship in Phase 1 (crawlers need the full graph; no staging subset).

---

## 9. Internationalization (i18n)

### 9.1 Language priority & markets

| Priority | Language | Locale | Main markets | Phase |
|---|---|---|---|---|
| 1 | English | `en` | US, UK, Canada, Australia, Ireland, NZ | **1 — Launch** |
| 2 | German | `de` | Germany, Austria, Switzerland | **1 — Launch** |
| 3 | French | `fr` | France, Belgium, Switzerland, Canada | **1 — Launch** |
| 4 | Spanish | `es` | Spain, Mexico + LatAm | 2 |
| 5 | Italian | `it` | Italy, Switzerland | 2 |
| 6 | Portuguese | `pt` | Brazil, Portugal | 2 |
| 7 | Dutch | `nl` | Netherlands, Belgium | 3 |
| 8 | Polish | `pl` | Poland | 3 |
| 9 | Japanese | `ja` | Japan | 3 |
| 10 | Hindi | `hi` | India | 3 |

> **Decision (resolves a conflict in source notes):** earlier notes recommended launching with EN+DE+FR+**ES**; the final architecture specified launching with **3** languages only. This PRD locks **Phase 1 = EN, DE, FR**, with Spanish first in Phase 2 (fastest follow, ~4–6 weeks post-launch). Raising ES into Phase 1 is Open Question Q1.

### 9.2 URL structure

Language-prefixed, **translated slugs** (SEO-friendly per language):

| Page | EN | DE | FR |
|---|---|---|---|
| Homepage | `/en/` | `/de/` | `/fr/` |
| Main tool | `/en/photo-metadata-remover` | `/de/photo-metadaten-entfernen` | `/fr/supprimer-metadonnees-photo` |

Full planned slug set for the main tool page (all future locales):

`/es/eliminar-metadatos-fotos` · `/it/rimuovere-metadati-foto` · `/pt/remover-metadados-fotos` · `/nl/foto-metadata-verwijderen` · `/pl/usuwanie-metadanych-zdjec` · `/ja/photo-metadata-remover` · `/hi/photo-metadata-remover`

- Every page type gets translated slugs per language (defined in the locale config).
- Root `/` serves a **200 status** lightweight page that client-side redirects humans (see §9.5) and lists all language links for crawlers — avoids redirect chains and cloaking risk.

### 9.3 Language selector UI

- Header, right side: `🌐 English ▾`
- Dropdown panel:

```
┌─────────────────────────┐
│ 🌐 Select Language      │
├─────────────────────────┤
│ 🇺🇸 English             │
│ 🇩🇪 Deutsch             │
│ 🇫🇷 Français            │
│ 🇪🇸 Español             │
│ 🇮🇹 Italiano            │
│ 🇧🇷 Português           │
│ 🇳🇱 Nederlands          │
│ 🇵🇱 Polski              │
│ 🇯🇵 日本語                │
│ 🇮🇳 हिन्दी               │
└─────────────────────────┘
```

- Flags are decorative only; option labels are always **language names in their own language** (Deutsch, Français, 日本語 — not "German", "French", "Japanese").
- Selector always shows all 10 languages (architecture is 10-ready at launch). Languages not yet launched: mark with subtle "coming soon" state or hide — **recommendation: show only live languages until a locale ships**, to avoid dead links.
- Selecting a language navigates to the **equivalent page** in the target language (same page type + translated slug), never to the homepage.

### 9.4 Automatic language detection

```
First visit (no stored preference):
  preferred = read cookie/localStorage("preferred_language")
  if preferred exists → serve that language (NO auto-redirect)
  else:
    browserLang = navigator.language          // e.g. "de-DE"
    lang = match against supported locales     // "de-DE" → "de"
    if lang supported → redirect to /{lang}/   // e.g. /de/
    else → /en/                                // e.g. "bn-BD" → /en/

Manual selection (any time):
  user picks language → navigate → store preferred_language = {lang}
    (cookie, 365 days + localStorage)
  → automatic detection NEVER overrides it again
```

Example: a German-browser user who manually switches `/de/ → /en/` is stored as `preferred_language = en` and is never redirected back to German on future visits.

> **AC-9.1** First visit with `navigator.language = de-DE` lands on `/de/`.
> **AC-9.2** First visit with `navigator.language = fr-FR` lands on `/fr/`.
> **AC-9.3** First visit with `navigator.language = bn-BD` (unsupported) lands on `/en/`.
> **AC-9.4** After a manual switch to any language, subsequent visits (new session, browser restart) never auto-redirect away from the stored preference.
> **AC-9.5** Crawlers receive the root page with 200 + language links (no forced JS-only redirect wall).

### 9.5 What gets translated (scope)

Not just buttons — **everything the user reads**:

1. **UI:** hero, buttons, labels, tool steps, footer, navigation
2. **Metadata results:** Camera, Location, Date Taken, GPS Coordinates, Software, File Size, FOUND/NOT FOUND states
3. **Error & success messages:** all FR §7 strings
4. **FAQ:** all questions & answers
5. **Privacy messaging:** "Your photos are processed securely." / "We don't store your uploaded images."
6. **SEO elements:** title tags, meta descriptions, H1s, body content, image alt text, structured data (§10.1)

### 9.6 Translation architecture

No hard-coded per-page translations. One dictionary per locale:

```
/locales/
    en.json
    de.json
    fr.json
    es.json
    it.json
    pt.json
    nl.json
    pl.json
    ja.json
    hi.json
```

`en.json` (excerpt):

```json
{
  "hero_title": "Remove Photo Metadata Online",
  "hero_description": "Remove hidden EXIF metadata from your photos.",
  "upload_button": "Upload Photo",
  "remove_button": "Remove Metadata",
  "download_button": "Download Clean Image"
}
```

`de.json` (excerpt):

```json
{
  "hero_title": "Fotometadaten online entfernen",
  "hero_description": "Entfernen Sie versteckte EXIF-Metadaten aus Ihren Fotos.",
  "upload_button": "Foto hochladen",
  "remove_button": "Metadaten entfernen",
  "download_button": "Bereinigtes Bild herunterladen"
}
```

Usage: `t("hero_title")`, `t("upload_button")`, …

**Rules:**
- `en.json` is the source of truth; missing keys in other locales fall back to English at build time (and are flagged).
- A CI script compares all locales against `en.json` — build fails on missing keys (no silent English leaks in DE/FR UI).
- Long-form content (blog posts, FAQ answers, legal pages) lives as localized content collections in Astro (`/src/content/`), not in the JSON dictionaries; JSON holds UI strings only.
- Translations are machine-drafted then **human-reviewed by a native speaker** before a locale goes live (see Risk R1).

### 9.7 i18n acceptance criteria

> **AC-9.6** Adding a new language requires: 1 new `*.json` file + content collection entries + slug map entry. **Zero changes to components, routes, or business logic.**
> **AC-9.7** All live locales render 100% translated UI (automated screenshot diff or key-coverage test).

---

## 10. SEO Requirements

### 10.1 Localized on-page SEO

Every language version is a **fully native page**, not a translated shell:

| Element | Requirement |
|---|---|
| `<title>` | Unique per language, keyword-localized (e.g. DE: "Fotometadaten online entfernen – kostenlos & privat") |
| Meta description | Written per language, not machine-literal |
| H1 | Language-specific keyword |
| Body & FAQ | Native-quality localized content |
| Image `alt` text | Localized |
| Structured data | Localized (names, descriptions, questions) |
| Canonical | Self-referencing per language URL |

### 10.2 hreflang (mandatory on every page)

```html
<link rel="alternate" hreflang="en" href="https://example.com/en/photo-metadata-remover" />
<link rel="alternate" hreflang="de" href="https://example.com/de/photo-metadaten-entfernen" />
<link rel="alternate" hreflang="fr" href="https://example.com/fr/supprimer-metadonnees-photo" />
<link rel="alternate" hreflang="x-default" href="https://example.com/en/photo-metadata-remover" />
```

- `x-default` always points to the English version.
- hreflang set is generated from the central locale/slug config (single source of truth) so it can never drift from the URL map.
- URLs in hreflang must be absolute and match the sitemap exactly.
- Phase 2/3: adding a language automatically extends every page's hreflang set.

### 10.3 Sitemaps & indexing

- One XML sitemap per language (`/sitemap-en.xml`, `/sitemap-de.xml`, …) plus a sitemap index; or a single sitemap with `xhtml:link` alternates — **pick one, consistency enforced in CI**.
- All 69 URLs in sitemaps at launch; submitted via Search Console on day 1.
- robots.txt allows all; disallow `/api/` endpoints.

### 10.4 Structured data

| Schema | Applied to |
|---|---|
| `SoftwareApplication` (or `WebApplication`) + FAQPage | Tool pages |
| `Article` + FAQPage + BreadcrumbList | Blog posts |
| `BreadcrumbList` | All subpages |
| `Organization` + `WebSite` | Sitewide (homepage) |

Validated with Rich Results Test in CI/preview for all 69 URLs.

### 10.5 Country-specific SEO (future — not at launch)

Same-language country landing pages for later phases:

```
/en-us/photo-metadata-remover
/en-gb/photo-metadata-remover
/en-ca/photo-metadata-remover
/en-au/photo-metadata-remover
```

**Trigger to build:** Search Console shows sustained, significant demand from a country not served by the generic language page (e.g., US vs UK keyword divergence: "photo metadata remover" vs "remove photo data"). Do not build these at launch — avoid thin/duplicate content before demand is proven.

### 10.6 USP positioning (homepage messaging)

Primary messaging (hero, all languages):

> **Remove EXIF metadata from photos instantly and privately.**

Secondary block (hero-adjacent / footer, all languages):

> 🌍 **Available in 10 Languages**
> Remove photo metadata privately, no matter where you are.
> English · Deutsch · Français · Español · Italiano · Português · Nederlands · Polski · 日本語 · हिन्दी

Rule: language support is a **conversion/SEO feature**, never the primary USP.

---

## 11. Technical Requirements

### 11.1 Stack & architecture

```
                     WEBSITE (Astro)
                          │
             ┌────────────┴────────────┐
             │                         │
      Language Detection        Manual Selector
      (client JS, first          (header dropdown)
       visit only)
             │                         │
             └────────────┬────────────┘
                          ↓
                  Selected Language
                          │
          ┌───────────────┴───────────────┐
          ↓                               ↓
     Localized UI                   Localized SEO
     buttons/text/errors/           title/meta/H1/FAQ/
     scan results                   schema/hreflang/slug
          │                               │
          └───────────────┬───────────────┘
                          ↓
                PHOTO METADATA TOOL
              (Astro server endpoints)
                          ↓
                Remove EXIF / GPS / IPTC /
                XMP / comments / thumbnail
                          ↓
                Download Clean Photo
```

- **Framework:** Astro (latest v5), hybrid rendering:
  - **Static (SSG):** all 69 content pages — maximum speed, full SEO crawlability.
  - **Server endpoints (`/api/scan`, `/api/clean`):** the tool only. Astro API routes deployed as serverless functions.
- **No database.** No persistent storage of any kind.
- Zero/low JS on content pages (Astro islands); interactive tool UI is one hydrated island.

### 11.2 Metadata engine

| Task | Library (proposed) | Notes |
|---|---|---|
| Read/scan metadata | `exifr` | Fast, broad EXIF/GPS/IPTC/XMP coverage, works server-side |
| Strip metadata | `sharp` | Default output strips EXIF/GPS/IPTC/XMP/comments/thumbnail; **ICC profile preserved** to protect color fidelity |
| Verification (CI/tests) | `exiftool` (dev dependency) | Automated test: cleaned files must show zero metadata tags |

- An automated CI test runs exiftool over cleaned sample files (GPS JPEG, iPhone HEIC, Photoshop IPTC PNG) — any surviving tag fails the build.
- *Alternative noted for the future:* fully client-side processing (WASM) would let us claim "photos never leave your device" — strongest possible privacy story. Deferred (Open Question Q7).

### 11.3 Supported formats & limits

| Format | Support | Phase |
|---|---|---|
| JPEG/JPG | ✅ full | Launch |
| PNG | ✅ full | Launch |
| WebP | ✅ full | Launch |
| TIFF | ✅ full | Launch |
| HEIC/HEIF | ✅ input → clean JPEG output | P1 (iPhone default format — high priority) |

| Limit | Value |
|---|---|
| Max file size | **25 MB** (proposed — confirm against host's serverless request-body limit; e.g. some platforms cap at ~4.5 MB, which would require chunked upload or a different host; see §11.6 and Q4) |
| Rate limit | e.g., 20 uploads/min/IP (abuse prevention, tunable) |

### 11.4 Privacy engineering (product-critical)

1. Uploaded bytes exist only in memory for the duration of the request; response sent → buffer discarded. **No temp files, no disk writes.**
2. Logs contain **no image data and no image URLs** (there are no image URLs by design).
3. No third-party pixels/trackers on tool pages beyond the chosen analytics (Q6); if ad scripts are added later, they load only on content pages, never on tool pages.
4. HTTPS enforced; HSTS.
5. The privacy claim ("We don't store your uploaded images") is stated in every language and is verifiably true — validated by the AC-3.3 test.

### 11.5 Performance

- Static pages: HTML-first, minimal JS, optimized images, font subsetting per locale (incl. CJK/Devanagari when ja/hi ship).
- Tool island: lazy-hydrated on interaction.
- Budget: ≤ 100 KB JS on content pages; ≤ 200 KB on the tool page.
- CWV green on mobile at p75 (LCP < 2.5 s, CLS < 0.1, INP < 200 ms).

### 11.6 Hosting

- Astro deploys to Vercel / Netlify / Cloudflare Pages (all support Astro server endpoints).
- Selection criterion: **serverless request-body limit** must accommodate the 25 MB upload target (Cloudflare generally most generous; Vercel/Netlify function limits lower) — decide at M1 (Q4).
- No database service, no object storage provisioned.

### 11.7 Security

- Server-side MIME sniffing (never trust `Content-Type` header alone); magic-byte validation.
- File-size enforcement server-side as well as client-side.
- Rate limiting per IP on `/api/*`.
- Security headers: CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Output filename sanitized (`filename-clean.ext`).

### 11.8 Analytics

- Google Analytics 4 + Google Search Console (default), **or** cookieless analytics (Plausible/Fathom) — Q6. Cookieless would avoid a consent banner and fits the privacy brand.
- Events: `file_upload`, `scan_complete` (+ metadata-found flags), `removal_complete`, `download_click`, `language_switch` (from → to).
- Language-level dashboards (sessions per `/de/`, `/fr/` …) drive Phase 2/3 rollout decisions.

---

## 12. UX & Design Requirements

- **Mobile-first** (majority of tool usage is mobile), responsive 360px → desktop.
- Tool steps presented as a visible 4-step progress indicator (Upload → Scan → Remove → Download) matching §6.
- States to design: empty/dropzone (idle), drag-over, uploading (progress), scanning (skeleton), results (⚠/✓ checklist), removing (per-item ✓ animation), success (🔒 + download), error (localized message + retry).
- ⚠ FOUND rows show the extracted value (e.g., `GPS: 48.8584° N, 2.2945° E — Eiffel Tower area` where feasible) — *proof* drives trust and conversions.
- Clean, calm, privacy-brand visual identity: generous whitespace, single accent color, security cues (lock iconography) — explicitly avoid the ad-cluttered look of competitors.
- **Accessibility:** WCAG 2.1 AA — keyboard-operable dropzone & selector, ARIA live region announcing scan/removal results, color-independent status indicators (icon + text, not color alone), `lang` attribute set per page locale.
- Language selector per §9.3.

---

## 13. Legal & Compliance

| Item | Requirement | Phase |
|---|---|---|
| Privacy Policy | Fully localized (EN/DE/FR at launch); describes in-memory processing, no storage, analytics/tracking used | Launch |
| Terms of Service | Localized | Launch |
| **Impressum (Germany)** | German-language imprint page linked in footer of `/de/` pages (required for sites targeting Germany under §5 TMG/DDG) | Launch |
| GDPR | EU is a primary market: lawful analytics basis (consent if cookies used — avoided if cookieless analytics chosen), data-processing transparency, user rights contact | Launch |
| Cookie consent | Only if GA4 or ads are used (cookieless analytics avoids the banner entirely) — Q6 | Launch |
| Contact page | Real contact/identity info (supports Impressum & trust) | Launch |

---

## 14. Release Plan

| Milestone | Scope | Target |
|---|---|---|
| **M1 — Foundations** | Astro project, i18n scaffolding (locale config, `t()`, slug maps, hreflang generator), hosting selected (body-limit test) | Week 1 |
| **M2 — Core tool** | Upload → scan → remove → download, API endpoints, metadata-stripping CI tests green | Week 2–3 |
| **M3 — English content** | All 23 pages in EN (12 blog posts, 5 tool pages, statics, FAQ, legal) | Week 3–4 |
| **M4 — DE + FR** | Full translation (machine draft → native review), translated slugs, Impressum | Week 5 |
| **M5 — SEO & analytics** | hreflang verification, sitemaps, structured data validation, analytics events | Week 5–6 |
| **M6 — QA & hardening** | Performance budget, accessibility pass, security headers, error states, load test on API | Week 6 |
| **M7 — Soft launch** | Deploy, Search Console submission, canonical/hreflang validation in GSC | Week 7 |
| **M8 — Public launch** | Announcement, social/community seeding, begin 2–4 posts/month content cadence | Week 8 |

**Launch checklist (go/no-go):** 69 URLs live · 3 locales 100% translated (AC-9.7) · hreflang/sitemap valid · zero-metadata test passing in CI · privacy tests passing (AC-3.3) · CWV green · Impressum live · analytics events firing.

---

## 15. Localization Rollout Plan

| Phase | Languages | Entry criterion | Exit deliverables |
|---|---|---|---|
| **1** | 🇺🇸 EN · 🇩🇪 DE · 🇫🇷 FR | Launch | 69 URLs, native-reviewed translations |
| **2** | 🇪🇸 ES → 🇮🇹 IT → 🇵🇹 PT | GSC/analytics show traction (e.g., ≥ 1k organic sessions/mo per new market's language group, or strong ES demand from launch markets) | +23 URLs per language, one language at a time |
| **3** | 🇳🇱 NL · 🇵🇱 PL · 🇯🇵 JA · 🇮🇳 HI | Same data-driven trigger per language | +23 URLs per language |

Rollout order within phases: **ES → IT → PT**, then data decides among NL/PL/JA/HI. Each new locale ships as a complete set (all pages) — never a partial language.

**Standing rule:** the selector/architecture is 10-language-ready from day one; only 3 locales are *live* at launch. Empty slots stay hidden until each locale ships.

---

## 16. Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Machine translation quality harms trust (especially DE legal/privacy wording) | High — brand is "privacy & trust" | Native-speaker review before any locale goes live; CI blocks untranslated keys |
| R2 | Google AI Overviews / zero-click results reduce informational CTR | Medium | Prioritize transactional tool pages + SoftwareApplication schema; blog CTAs drive tool usage (the tool itself can't be summarized away) |
| R3 | Serverless request-body limits block large uploads | Medium | Host selection at M1 based on body-limit test; client-side compression option; Q4 |
| R4 | HEIC complexity (decoding licensing/patents, libvips build) | Medium | P1 not launch; clear localized error until shipped; high value (iPhone default) |
| R5 | hreflang misconfiguration harms indexing | Medium | Generated from single config source; CI validates reciprocity & sitemap match; GSC international report monitored |
| R6 | Privacy claim violated by accidental logging/caching | High | AC-3.3 automated test; no-log policy; image data excluded from error reporting |
| R7 | Thin content across 69 URLs at once (crawl budget) | Low–Medium | Interlinking plan; sitemap submitted day 1; all pages genuinely localized, not duplicated |
| R8 | Legal gaps for EU (Impressum, GDPR) | Medium | §13 shipped at launch, not later |
| R9 | Abuse of free API (scraping, oversized payloads) | Medium | Rate limits, size caps, magic-byte validation |

---

## 17. Open Questions

| # | Question | Recommendation / default |
|---|---|---|
| Q1 | Spanish in Phase 1 (4 languages at launch) or Phase 2? | Phase 2, ~4–6 weeks after launch (keeps launch lean per final architecture note) |
| Q2 | Monetization model — none / display ads / freemium API? | Defer ads until ≥ 10k sessions/mo; if ads, never on tool pages (UX + privacy); revisit post-launch |
| Q3 | Brand name & domain | Decide before M1 (affects hreflang absolute URLs, schema `Organization`) |
| Q4 | Max upload size & hosting (body limits) | Target 25 MB; pick host at M1 after body-limit test; Cloudflare currently favored |
| Q5 | HEIC in launch scope? | No — P1 fast-follow |
| Q6 | Analytics: GA4 (needs consent banner in EU) vs Plausible/Fathom (cookieless, no banner, on-brand) | Cookieless (Plausible) — aligns with privacy positioning |
| Q7 | Server-side (current spec) vs client-side WASM processing ("never leaves your device") | Server-side at launch (matches agreed stack); client-side as v2 differentiator |
| Q8 | Translation vendor/workflow for DE/FR review | Machine draft (DeepL) + paid native reviewer per locale (~fixed scope) |

---

## 18. Appendices

### Appendix A — Confirmed URL patterns (main tool page, all 10 locales)

```
/en/photo-metadata-remover      /it/rimuovere-metadati-foto
/de/photo-metadaten-entfernen   /pt/remover-metadados-fotos
/fr/supprimer-metadonnees-photo /nl/foto-metadata-verwijderen
/es/eliminar-metadatos-fotos    /pl/usuwanie-metadanych-zdjec
                                /ja/photo-metadata-remover
                                /hi/photo-metadata-remover
```

### Appendix B — Metadata handled by the tool

| Metadata family | Examples | Scan displays | Removal |
|---|---|---|---|
| EXIF (incl. GPS) | camera make/model, settings, GPS coordinates, timestamp | ⚠/✓ with values | ✅ |
| IPTC | captions, credits, **author/owner name**, copyright | ⚠/✓ | ✅ |
| XMP | editing history, software (e.g., "Adobe Lightroom"), ratings | ⚠/✓ | ✅ |
| File comments | JPEG COM segments | ⚠/✓ | ✅ |
| Embedded thumbnail | EXIF IFD1 preview | — | ✅ |
| ICC color profile | color profile | — | **Preserved** (color fidelity) |

### Appendix C — Glossary

- **EXIF** — Exchangeable Image File Format; camera-written metadata (device, settings, GPS, time).
- **IPTC** — news/photo-industry metadata standard (captions, credits, copyright).
- **XMP** — Adobe's extensible metadata platform (editing history, software).
- **hreflang** — HTML attribute telling Google which URL serves which language/region.
- **x-default** — the fallback URL when no language matches a user.

---

*End of PRD v1.0 — prepared 2026-09-02. Sources: project brief (tool flow, blog plan, i18n strategy, language priorities, URL/slug map, translation architecture, SEO architecture, phased rollout) consolidated into a single actionable spec. All items marked "proposed" are decisions pending owner approval.*
