# Page Architecture Audit — Photo Metadata Remover

**Date:** 2026-09-25
**Scope:** Full site architecture (Astro static build) — pages, routes, languages, links, blog, redirects, orphans, sitemap, hierarchy.
**Method:** Read-only inspection of source (`src/`), build output (`dist/`), and `public/`. Glob/grep of all `src/pages/**`, `src/layouts/**`, `src/components/**`, `src/content/**`; full reads of key layouts; `dist/` enumeration (103 HTML files verified); `public/sitemap.xml` parsed (90 `<loc>`). No source files were modified. `npm run build` was not required — `dist/` already present and used as the ground-truth route list.

---

## 1. Counts: source templates vs. generated pages vs. redirects

| | Count |
|---|---|
| **A. Source page templates** (`src/pages/**/*.astro`) | **18** |
| **B. Generated HTML pages** (`dist/**/*.html`) | **103** (1 root + 34 × 3 languages) |
| **C. Redirect-only routes** | **0** (no redirect code anywhere; no `redirects` config in `astro.config.mjs`) |

### A. The 18 source templates

| # | Template | Route pattern | getStaticPaths |
|---|---|---|---|
| 1 | `src/pages/index.astro` | `/` | no (single page) |
| 2 | `src/pages/[lang]/index.astro` | `/{lang}/` | yes (3) |
| 3 | `src/pages/[lang]/[tool].astro` | `/{lang}/{tool}` | yes (3×5=15) |
| 4 | `src/pages/[lang]/about.astro` | `/{lang}/about` | yes |
| 5 | `src/pages/[lang]/blog.astro` | `/{lang}/blog` | yes (3) |
| 6 | `src/pages/[lang]/blog/[slug].astro` | `/{lang}/blog/{slug}` | yes (3×12=36) |
| 7 | `src/pages/[lang]/contact.astro` | `/{lang}/contact` | yes |
| 8 | `src/pages/[lang]/faq.astro` | `/{lang}/faq` | yes |
| 9 | `src/pages/[lang]/formats.astro` | `/{lang}/formats` | yes |
| 10 | `src/pages/[lang]/guides.astro` | `/{lang}/guides` | yes (3) |
| 11 | `src/pages/[lang]/guides/[slug].astro` | `/{lang}/guides/{slug}` | yes (3×3=9) |
| 12 | `src/pages/[lang]/how-it-works.astro` | `/{lang}/how-it-works` | yes |
| 13 | `src/pages/[lang]/impressum.astro` | `/{lang}/impressum` | yes |
| 14 | `src/pages/[lang]/legal.astro` | `/{lang}/legal` | yes |
| 15 | `src/pages/[lang]/open-source.astro` | `/{lang}/open-source` | yes |
| 16 | `src/pages/[lang]/privacy.astro` | `/{lang}/privacy` | yes |
| 17 | `src/pages/[lang]/security.astro` | `/{lang}/security` | yes |
| 18 | `src/pages/[lang]/terms.astro` | `/{lang}/terms` | yes |

All 17 `[lang]` templates export `getStaticPaths()`; **only `src/pages/index.astro` sets `export const prerender = true`** (line 6). No API routes, no 404 page exist (glob `src/pages/**/*` returns exactly these 18 files).

### B. Generated pages per language (34 URL patterns × 3 langs = 103)

Home · about · blog · 12 blog posts · contact · faq · formats · guides · 3 guides · how-it-works · impressum · legal · open-source · **5 tool pages** (photo-metadata-remover, view-photo-metadata, remove-exif-data, remove-gps-data, remove-metadata-heic) · privacy · security · terms

Plus non-page artifacts in `dist/`: `sitemap.xml`, `robots.txt`, favicons, `og-image.png`, `site.webmanifest`.

### C. Redirect-only routes: **0**

- No `Astro.redirect()` / meta-refresh / `_redirects` / config-level redirects found.
- The root `/` **is a real rendered page** (English language chooser) that performs a *client-side* `location.replace()` JS redirect after detection — see §10.

---

## 2. Language architecture

- **3 languages:** `en`, `de`, `fr` — defined in `src/lib/lang.ts` (`SUPPORTED_LANGS`, `LANG_LABELS`) and `src/i18n/index.ts` (`locales = { en, de, fr }` loaded from `src/locales/*.json`).
- **URL pattern:** every localized page lives at `/{lang}/…`; English is *not* rootless — `/en/…` is the canonical English path.
- **Root `/`:** a language chooser + auto-redirect page (see §10).
- **Translation access:** `getTranslations(lang)` falls back to `en` when a key is missing; `t(translations, 'dot.path')` returns the path string itself if still missing (so untranslated keys surface as literal key paths).
- **Client language persistence:** `src/lib/lang.ts` — `STORAGE_KEY = 'pmr_lang'`, `saveLang()` writes localStorage **and** a `pmr_lang` cookie (1 year, `samesite=lax`); `detectBrowserLang()` used for first-visit detection.
- **`Layout.astro`:** validates `lang` prop against `SUPPORTED_LANGS` else `'en'`; emits `x-default` hreflang pointing at `/en/` variant; canonical via `localize(currentLang)`.
- **Content:** every blog post and guide exists as 3 markdown files (`src/content/{blog,guides}/**/{en,de,fr}.md`).

---

## 3. Page vs. component vs. layout vs. content vs. utility

| Category | Items |
|---|---|
| **PAGE** (18) | the templates in §1A |
| **LAYOUT** (1) | `src/layouts/Layout.astro` (HTML head, hreflang, navbar, footer, mobile menu, language picker, JSON-LD slot) |
| **COMPONENT** | `Hero`, `Features`, `HowItWorks`, `RiskAudit`, `Fidelity`, `SelectedArticles`, `FAQ`, `TrustStrip`, `ToolUpload` (main interactive tool UI), `PageHeader`, `Welcome` (**unused — never imported**), `Info/Breadcrumbs`, `Info/Icon` |
| **CONTENT** | `src/content/blog/**` (12 posts × 3 langs, frontmatter schema incl. optional `faq` array), `src/content/guides/**` (3 guides × 3 langs), `src/locales/{en,de,fr}.json` (UI strings) |
| **UTILITY** | `src/lib/lang.ts`, `src/i18n/index.ts`, `src/lib/legal.ts`, `src/lib/verify.ts`, `src/config/featured-posts.ts` (`FEATURED_POSTS` = 5 slugs), `src/content.config.ts` (collection schemas), `astro.config.mjs` (`site: 'https://photometadataremover.com'`) |

---

## 4. Page purpose audit (per URL pattern)

Purpose statements below are derived from actual source (H1/heading source, `PageHeader` usage, frontmatter, component composition) — not guessed.

| URL | H1 source | Purpose (from code) |
|---|---|---|
| `/` | `{siteName}` (index.astro:88) | Language chooser: 3 language cards, JS `resolveHomeLang()` auto-redirect, `[data-lang-switch]` → `saveLang()` + `trackEvent('language_switch')` |
| `/{lang}/` | Hero component | Home: Hero + Features + HowItWorks + **ToolUpload (line 103)** + RiskAudit (`#privacy-risk`) + Fidelity (`#fidelity`) + SelectedArticles + FAQ + TrustStrip + privacy side-cards (`sidebar.privacy.items.0–3`) |
| `/{lang}/{tool}` | `PageHeader` (:108) | Tool page for 5 slugs; throws `Unknown tool:` for others; **no own `href=` attributes in template** (breadcrumbs via `Info/Breadcrumbs.astro`) |
| `/{lang}/about` | inline h1 (:48) | About page; links home (61, 202), security (65), how-it-works (206) |
| `/{lang}/blog` | `PageHeader` (:51) | Blog index; renders `getCollection('blog')`; links `/{lang}/blog/{slug}` (:61) |
| `/{lang}/blog/{slug}` | `entry.data.title` (:134) | Blog post (12 slugs); related posts (:180); CTA `/{lang}/photo-metadata-remover#tool` (:167); breadcrumb home (:117) / blog (:119) |
| `/{lang}/contact` | `PageHeader` (:53) | Contact page; links faq (65), impressum (69), `mailto:` (82) |
| `/{lang}/faq` | `t(…,'faq_page.title')` (:66) | FAQ page (uses `FAQ.astro`); links how-it-works (172), security (176), open-source (180) |
| `/{lang}/formats` | `t(…,'formats_page.title')` (:44) | Supported-formats page; links security (106, 189), home (185) |
| `/{lang}/guides` | `PageHeader` (:28) | Guide index (3 hardcoded guides: `what-is-exif`, `gps-privacy`, `social-media`); links `/{lang}/guides/{slug}` (:37) |
| `/{lang}/guides/{slug}` | `entry.data.title` (:90) | Guide page; home (83), guides index (85), `/{lang}/#tool` (:99), other guides (112); BreadcrumbList JSON-LD |
| `/{lang}/how-it-works` | `t(…,'how_it_works_page.title')` (:33) | Process explainer; home (174), security (178) |
| `/{lang}/impressum` | `PageHeader` (:26) | German-style imprint; `mailto:` (50) only |
| `/{lang}/legal` | `t(…,'legal_page.title')` (:42) | Legal hub; `hubCards` → terms/privacy/impressum/open-source via `/${currentLang}/${card.href}` (55), mailto (132), faq (142), contact (146) |
| `/{lang}/open-source` | inline h1 (:33) | Open-source page; `https://github.com` (39, 133 — **generic, not a repo URL**), home (43, 158), security (154) |
| `/{lang}/privacy` | `t(…,'privacy.hero_title')` (:35) | Privacy policy; security (153) and open-source (157) — **both correctly lang-prefixed** |
| `/{lang}/security` | `t(…,'security_page.title')` (:33) | Security page; home (136), open-source (140) |
| `/{lang}/terms` | `PageHeader` (:29) | Terms; **zero internal links** |

---

## 5. Link map

### 5.1 Navbar (Layout.astro, lines 154–159)

`/{lang}/` · `/{lang}/formats` · `/{lang}/guides` · `/{lang}/faq` · `/{lang}/about` · `/{lang}/privacy`
Logo → `/{lang}` (131). Language toggle = `<button>` (166–180), picker links `/{l}/` (322). GitHub pill (183–190) → **`https://github.com` (generic)**.

**Absent from navbar:** all 5 tool pages, `/blog`, how-it-works, security, open-source, legal, terms, contact.

### 5.2 Footer (Layout.astro)

- **Tool column:** home `/{lang}/` (198), formats, guides, faq — **no actual tool-page links.**
- **Info column:** about, how-it-works (283), privacy, security, formats (dup), faq (dup), open-source, legal (289).
- **Language picker:** `/{l}/` (322).
- **Bottom legal:** privacy, terms (339), impressum (340), contact (341).
- **No `/blog` link, no tool links anywhere in footer.**

### 5.3 Component-generated links

| Component | Links |
|---|---|
| `Features.astro` | `#how-it-works`, `#privacy-risk`, `#fidelity`, `/{lang}/guides/what-is-exif` (:55) |
| `SelectedArticles.astro` | `/{lang}/blog/{slug}` (:103), related (:113), **`/{lang}/blog` (:126) — the only component linking `/blog`**, anchors (:82, :100) |
| `FAQ.astro` | `/{lang}/faq` (:19) |
| `TrustStrip.astro` | `#how-it-works` (:66), `#faq` (:72) |
| `Info/Breadcrumbs.astro` | home (18), `/{lang}/about` (26) |
| `Welcome.astro` | external astro.build only — **UNUSED (never imported)** |

### 5.4 Per-page outgoing internal links (from `src/pages`, 46 href matches)

| Page | Outgoing internal links (line) |
|---|---|
| `/` (root) | `/{l}/` language cards (93); hreflang/canonical (39–47) |
| `/{lang}/` | none in template (head via Layout; anchors only) |
| `/{lang}/{tool}` | **zero `href=` in template** (Breadcrumb component only) |
| about | home 61, security 65, home 202, how-it-works 206 |
| blog | `/{lang}/blog/{slug}` 61 |
| blog/[slug] | home 117, blog 119, `photo-metadata-remover#tool` 167, related 180 |
| contact | faq 65, impressum 69, mailto 82 |
| faq | how-it-works 172, security 176, open-source 180 |
| formats | security 106, home 185, security 189 |
| guides | `/{lang}/guides/{slug}` 37 |
| guides/[slug] | home 83, guides 85, `/{lang}/#tool` 99, other guides 112 |
| how-it-works | home 174, security 178 |
| impressum | mailto 50 |
| legal | `/${currentLang}/${card.href}` 55 (terms, privacy, impressum, open-source), mailto 132, faq 142, contact 146 |
| open-source | `https://github.com` 39, 133; home 43, 158; security 154 |
| privacy | security 153, open-source 157 — **both `/${currentLang}/…` prefixed ✓** |
| security | home 136, open-source 140 |
| terms | **none** |

### 5.5 Markdown (content) internal links

- **Guides** link `/{lang}/#tool` (e.g. `what-is-exif` :62, `gps-privacy` :51, `social-media` :54 in each language).
- **Blog posts** link tool pages (`/{lang}/view-photo-metadata`, `/{lang}/photo-metadata-remover#tool`) and each other (e.g. `/en/blog/iptc-vs-xmp-metadata-explained`, `/en/blog/how-to-remove-location-data-from-photos`).

### 5.6 Incoming-link matrix (summary)

| Target | Incoming from |
|---|---|
| `/{lang}/` (home) | navbar logo + footer (all pages), root language cards, about/how-it-works/formats/open-source/security/blog pages |
| about, formats, guides, faq, privacy | navbar (+ footer, + contact/legal/components for faq) |
| how-it-works, security, open-source, legal, terms, impressum, contact | footer, legal hub, and in-page links only — **no navbar** |
| `/blog` | **`SelectedArticles.astro` only** |
| `/blog/{slug}` | blog index, related-posts blocks, cross-blog markdown links |
| `/guides/{slug}` | guides index, related block |
| `photo-metadata-remover` | blog markdown + `blog/[slug].astro:167` |
| `view-photo-metadata` | blog markdown only |
| `remove-exif-data`, `remove-gps-data`, `remove-metadata-heic` | **NONE — zero incoming links anywhere** |

---

## 6. Navbar audit

Covers 6 destinations (home, formats, guides, faq, about, privacy). **Missing:** all 5 tool pages (the site's core product), `/blog`, how-it-works, security, open-source, legal, terms, contact. The GitHub pill points at the generic `https://github.com` rather than a repository. Language switching is a client-side button, so hreflang-in-head is the only crawlable cross-language signal in the header.

## 7. Footer audit

Two columns. **Tool column contains no tool links** (only home/formats/guides/faq). Info column duplicates `formats` and `faq` (also present in the tool column). Blog absent. Bottom legal row links privacy/terms/impressum/contact. `legal` hub is linked once (289). Overall the footer duplicates navbar destinations while omitting the product pages entirely.

## 8. Blog architecture

- Collection: `blog` (schema in `src/content.config.ts`, optional `faq` array); 12 posts × 3 languages = 36 markdown files.
- `BLOG_SLUGS` allowlist in `blog/[slug].astro` (lines 8–21): `what-is-photo-metadata`, `what-is-exif-data`, `can-photos-reveal-your-location`, `how-to-remove-location-data-from-photos`, `how-to-remove-exif-data`, `does-instagram-remove-exif`, `how-to-check-photo-metadata`, `what-information-is-hidden-in-a-photo`, `does-whatsapp-remove-exif-data`, `how-to-remove-exif-data-on-iphone`, `how-to-remove-exif-data-on-android`, `iptc-vs-xmp-metadata-explained`.
- `langs = ['en','de','fr']` (line 7); `posts = await getCollection('blog')` (line 34); missing content throws `Missing blog content for ${lang}/${slug}`.
- Index page renders all posts; each post shows 2 related posts and a tool CTA (`photo-metadata-remover#tool`).
- `FEATURED_POSTS` (5 slugs) drives home-page `SelectedArticles`.
- **Blog is reachable only from the home page's SelectedArticles component** — not from navbar or footer.

## 9. Dynamic routes

| Route | Paths | Behavior on unknown input |
|---|---|---|
| `[lang]/[tool]` | 3 × 5 = 15 | throws `Unknown tool:` (build-time) |
| `[lang]/blog` | 3 | — |
| `[lang]/blog/[slug]` | 3 × 12 = 36 | throws `Missing blog content for …` |
| `[lang]/guides` | 3 (hardcoded 3 slugs) | — |
| `[lang]/guides/[slug]` | 3 × 3 = 9 | throws `Missing guide content …` |
| remaining `[lang]` pages | 1 each × 3 | 3 langs |

All static at build time; nothing dynamic at runtime.

## 10. Redirects

- **Zero server/meta redirects.** `astro.config.mjs` has no redirect config; no `Astro.redirect()` calls; no `_redirects`.
- Root `/` is a genuine rendered page: `resolveHomeLang()` reads saved/browser language and calls `location.replace()` client-side; language cards dispatch `saveLang(target)` + `trackEvent('language_switch', …)` (lines 107–134). The root page itself is **not** listed in `sitemap.xml` and is not the target of any internal `<a href="/">` link.

## 11. Orphan detection

**True orphans (zero incoming internal links — confirmed by grep of `src/content`, `src/pages`, `src/layouts`, `src/components`):**

1. `/{lang}/remove-exif-data`
2. `/{lang}/remove-gps-data`
3. `/{lang}/remove-metadata-heic`

(Their slugs appear only in `[tool].astro`'s own declaration lines 11–14, the three `src/locales/*.json` string tables, and blog frontmatter `slug:` values — never as a link target.)

**Weakly linked (reachable but not from any nav):**

4. `/{lang}/photo-metadata-remover` — linked only from blog markdown + `blog/[slug].astro:167`
5. `/{lang}/view-photo-metadata` — linked only from blog markdown

**Structural orphans / gaps:**

- `Welcome.astro` — component never imported by any page (dead code).
- `/blog` — only reachable via `SelectedArticles.astro` on the home page.
- `{how-it-works, legal, open-source, security}` — linked from footer/in-page links but **absent from `sitemap.xml`** (§12).
- Root `/` — not in sitemap, not internally linked.

## 12. Sitemap & indexing

- `public/robots.txt`: `User-agent: *` / `Allow: /` / `Sitemap: https://photometadataremover.com/sitemap.xml`.
- `public/sitemap.xml`: **90 `<loc>`** (30 per language), `x-default` → `https://photometadataremover.com/en/`.
- **Gap: 13 URLs exist in `dist/` but not in the sitemap** = root `/` + 4 pages × 3 languages (`how-it-works`, `legal`, `open-source`, `security`). 90 = 103 − 13 ✓. Nothing in the sitemap is missing from `dist/`.
- No noindex/robots meta issues observed; all pages prerendered.

## 13. Architecture diagram

```
/  (root — language chooser + JS redirect, NOT in sitemap)
└── /{lang}/  ×3  (home: Hero · Features · HowItWorks · ToolUpload · RiskAudit ·
    │                Fidelity · SelectedArticles · FAQ · TrustStrip)
    ├── TOOL PAGES ×5 ── photo-metadata-remover ← blog markdown + blog/[slug]:167
    │                     view-photo-metadata   ← blog markdown
    │                     remove-exif-data      ✗ ORPHAN (0 incoming links)
    │                     remove-gps-data       ✗ ORPHAN
    │                     remove-metadata-heic  ✗ ORPHAN
    ├── /blog  ← only SelectedArticles (home)
    │   └── /blog/{slug} ×12  → photo-metadata-remover#tool, related posts, cross-links
    ├── /guides  → /guides/{what-is-exif, gps-privacy, social-media}
    │                 └── → /{lang}/#tool (back to home)
    ├── NAVBAR: formats · guides · faq · about · privacy  (+ home via logo)
    ├── FOOTER: tool-col(home, formats, guides, faq)
    │           info-col(about, how-it-works, privacy, security, formats†, faq†,
    │                    open-source, legal)  † = duplicated
    │           legal-row(privacy, terms, impressum, contact)
    ├── LEGAL HUB: /legal → terms · privacy · impressum · open-source
    └── NOT IN NAV OR SITEMAP: how-it-works‡ legal‡ open-source‡ security‡
                                            ‡ missing from sitemap.xml

No redirects anywhere (0 routes). 18 templates → 103 HTML → 90 sitemap URLs.
```

## 14. Developer guidance: adding a new page

1. **Localized page:** create `src/pages/[lang]/my-page.astro`, copy the `getStaticPaths()` pattern from any sibling (returns `SUPPORTED_LANGS.map(lang => ({ params: { lang } }))`), set frontmatter-free props into `Layout` (`title`, `description`, `lang={currentLang}`), use `t(translations, 'key')` for strings and add those keys to **all three** `src/locales/{en,de,fr}.json`.
2. **H1:** either inline `<h1>` (as about/security/privacy do) or `PageHeader` (as contact/blog/guides/terms do) — one per page.
3. **Links must be language-prefixed:** always `/${currentLang}/my-page`, never a bare `/my-page` (the site has no root-level redirects to rescue mistakes).
4. **Add incoming links:** navbar (`Layout.astro` ~154–159) and/or footer columns (~198, ~283) — otherwise the page joins the orphan set documented in §11.
5. **Add to `public/sitemap.xml` ×3 languages** — the sitemap is hand-maintained and already omits 13 live URLs; nothing syncs it automatically.
6. **Blog post:** add 3 markdown files under `src/content/blog/<slug>/{en,de,fr}.md` **and** append the slug to `BLOG_SLUGS` in `blog/[slug].astro` (build throws otherwise). Optionally add to `FEATURED_POSTS` for the home page.
7. **Guide:** add markdown ×3, then extend the hardcoded slug array in `guides.astro`'s `getStaticPaths` (and `guides/[slug].astro`).
8. **New tool page:** add the slug to `[tool].astro`'s `getStaticPaths` list and to the three locale JSONs — and **link it from content or nav**, or it will be orphaned like the three in §11.

---

## 15. Findings (priority order)

| # | Finding | Evidence |
|---|---|---|
| 1 | **3 of 5 tool pages are fully orphaned** — zero incoming links from anywhere | grep of `src/content` returns no matches; no page/component links them |
| 2 | **Tool pages absent from navbar and footer** (the product is not navigable) | Layout.astro 154–159, 198–289 |
| 3 | **Sitemap missing 13 live URLs** (root + how-it-works/legal/open-source/security ×3) | 90 sitemap `<loc>` vs 103 dist HTML |
| 4 | **`/blog` unreachable from navbar/footer** — only home's `SelectedArticles` | `SelectedArticles.astro:126` is the sole link |
| 5 | **Generic `https://github.com` links** (navbar pill + open-source page) | Layout.astro:184, `open-source.astro:39,133` |
| 6 | Footer duplicates `formats` + `faq` across two columns; tool column has no tools | Layout.astro footer |
| 7 | `Welcome.astro` dead code | grep "Welcome" → never imported |
| 8 | Root `/` is a JS-redirect chooser, not in sitemap or any internal link | `index.astro:107–134` |
| 9 | Root `/` and `/{lang}/` templates have no own body links; everything flows through Layout | href grep = 0 in `[lang]/index.astro` |
| 10 | ~~privacy.astro language-prefix bug~~ **RETRACTED** — lines 153/157 correctly use `/${currentLang}/security` and `/${currentLang}/open-source` | re-grep verified |
