---
name: photo-metadata-remover-ui
description: |
  Improve UI/UX of the Photo Metadata Remover Astro 7 + Tailwind v4 site while
  preserving its working product architecture. Use when the user asks to "improve
  the design", "polish the UI", "fix a responsive issue", "improve accessibility",
  "tweak the dropzone/navbar/footer", "add a new tool page", "fix a button", or
  any narrow visual/UX change. Do NOT use for: image-processing logic changes
  (those live in ToolUpload.astro and follow separate rules), framework
  migrations, dependency additions outside UI, or full-site redesigns (use
  ui-ux-pro-max for fresh concept generation instead — but its cinematic /
  template aesthetics must be filtered against this project's minimal/tool
  direction).
---

# Photo Metadata Remover — UI/UX Project Skill

## Inputs to collect

- The exact surface to change (file + component) and the user's pain point.
- Whether the change must respect an existing locale (EN/DE/FR) or is locale-neutral.
- Whether the change is interactive (needs new state) or purely visual.
- The target viewports: which of `360 / 375 / 390 / 768 / 1024 / 1280 / 1440`.
- Whether the change is in light mode, dark mode, or both.

If any of these are not obvious, ask before writing code. The rules in this skill fail safe to "do less" — guessing wrong is more expensive than asking.

## Hard constraints (project overrides any generic guidance)

The product is **Astro 7 + Tailwind v4 + TypeScript, client-side image processing, no backend**. Treat these as immovable unless the user explicitly says otherwise:

- **Framework stays Astro.** No React, Vue, Svelte, Next.js, or "modernization" of any kind. The 5 tool pages are Astro `[tool].astro`, not framework islands.
- **Tailwind v4 only.** No v3 syntax, no `tailwind.config.js` style files, no CSS-in-JS libraries. The design tokens are CSS custom properties under `:root` and `:root.dark` in `src/styles/global.css`; they are exposed to utilities via the `@theme { --color-* }` block. Use these tokens. Do not redefine colors ad hoc.
- **Privacy architecture stays client-side.** No upload endpoints, no server actions, no image-processing services. The Plausible analytics wrapper in `src/lib/analytics.ts` must never receive image bytes, filenames, EXIF values, GPS, or anything derived from a user photo.
- **Image-processing code in `src/components/ToolUpload.astro` is sacred.** The JPEG segment stripper, WebP RIFF EXIF extraction, HEIC→JPEG conversion + `validateJpegBlob`, AVIF detection, batch ZIP, object URL lifecycle, and progress state machine all stay as-is. Do not "clean them up" while doing a UI pass. If a UI task appears to require touching this code, stop and ask.
- **All locale strings must come from `src/locales/{en,de,fr}.json` via `t(translations, "path")`.** When adding UI text, add keys to all three files in the same change. The `t()` helper silently returns the key path when a key is missing, so an oversight won't fail the build — it will ship English to French and German readers. Verify locale parity before declaring done.
- **i18n architecture stays exactly as the codebase already has it.** No new i18n library. No key-rewriting. The `src/lib/lang.ts` cookie+localStorage flow is the source of truth for the user's preferred language; the auto-detect from `navigator.language` runs only on the root `/` page (`src/pages/index.astro`).

## Design direction

The product identity is **minimal / premium / technical / calm / privacy-first / tool-focused**. Concretely:

- Type: **Inter** (sans) + **Geist Mono** (mono), both already declared in `global.css` `@theme` block. Do not introduce a third face. Use Inter for everything by default; Geist Mono for code blocks, mono eyebrows, or technical labels where it earns its place.
- Color: use the existing `--pmr-*` tokens. The light theme is Vercel-like (ink on canvas, hairline borders). The dark theme inverts to near-black surfaces. Do not introduce new brand colors. If you need an accent state, use `--pmr-accent` (blue).
- Borders: 1px hairlines (`--pmr-border` / `--pmr-border-strong`). No heavy shadows. No glassmorphism. No decorative gradients.
- Spacing: 4px base unit, tokens already exposed (`--space-xxs/-xs/-sm/-md/-lg/-xl/-2xl/-3xl/-4xl/-section`). Use these instead of arbitrary `p-7` values.
- Radii: 6px (sm) for inputs/buttons, 12px (md) for cards, 16px (lg) for large panels, fully rounded for marketing pills and circular icons. Two shapes only: rounded buttons, sharp-feeling cards. Don't invent new radii.
- Motion: low intensity. CSS transitions on the few states that genuinely need feedback (button hover, theme toggle, focus ring, panel open/close). `prefers-reduced-motion` is already honored globally in `global.css`; do not break that.
- Photography: none. This is a utility, not a marketing site. No hero image, no illustrations of people, no generated graphics.

If a change makes the page look "exciting" or "flashy", you are probably going the wrong way.

## Component strategy

Before creating a new component, check whether the existing component can be modified. The codebase already has the right components — most changes should be a className, a token, or a small addition to an existing file.

- Navbar lives in `src/layouts/Layout.astro` (single source). Do not create a second navbar.
- Footer lives in `src/layouts/Layout.astro` (single source). Do not create a second footer.
- The upload tool lives in `src/components/ToolUpload.astro` (single source, ~1500 LOC). The markup is in the Astro template; the client-side state machine is in the `<script>` block at the bottom. Localized strings are passed through `data-*` attributes on `#files-list` from the Astro template so the client script stays locale-agnostic. Preserve this pattern.
- Buttons, cards, badges, and pills are Tailwind utility compositions, not React components. If you find yourself wanting a `<Card>` component, use a `<div>` with existing utility classes instead.
- Page templates under `src/pages/[lang]/` are mostly identical structurally. Use the same skeleton for new pages; only the middle slot changes.

## Upload / dropzone

The dropzone is the most important visual element. It must communicate, in this order, with no decoration: (1) this is the upload area, (2) drag and drop works, (3) clicking works, (4) supported formats, (5) processing is local.

- Border: 1px dashed, color `#b5b5b5` in light mode, `--pmr-border` in dark mode. The light-mode rule is already in `global.css` (`:root:not(.dark) #upload-zone`); preserve it. The dashed border must remain visible at 360px and on retina screens — it must never appear invisible.
- Inside: format chips (JPG/PNG/WebP/TIFF/HEIC) and a "select multiple" hint. No illustrations.
- The dropzone is a `role="button"` with Enter/Space keyboard support already wired up; preserve this.
- Don't replace the dropzone with a card, a button, or a generic "drag here" placeholder — the existing structure is correct.
- After a successful scan, the result lives in the `#results-panel` block inside the same section. Don't separate "the tool" from "the results" into different visual zones.

## Upload state management

When a new file is selected after a previous result, the previous state must be cleared before processing the new one. The existing `handleFiles()` in `ToolUpload.astro` already does: revoke all `URL.createObjectURL` previews, clear `fileItems`, reset `nextId` / `busyCount`, close the metadata viewer, and clear the batch status banner. Do not change this flow.

- The "Clear all" button (id `reset-btn`) is the only reset control. Don't add a second reset button with the same effect. If you rename the button text, also rename it in the locale files for all three languages and keep the underlying `resetTool()` behavior identical.
- Object URLs must be revoked on every state transition. The `revokeAllPreviews()` helper handles this; do not bypass it.

## Responsive rules

Test the four breakpoints the product already uses plus the smallest mobile sizes: 360, 375, 390, 768, 1024, 1280, 1440. The most common failure modes are:

- Long filenames overflowing the file row — `truncate` on the name `<div>` is already there; don't remove it.
- Long metadata values pushing the metadata viewer wider than the viewport — use `break-words` and avoid fixed `min-w-*` on viewer cells.
- Navbar crowding at 360–390px — the mobile hamburger (`#mobile-menu-toggle`) is the source of truth below `md`. Don't try to fit every nav link inline.
- Touch targets — minimum 44px height for interactive elements. The pill CTAs and the upload zone already clear this; verify on smaller inputs.
- Horizontal scrolling — never let a card, table, or button row create page-level horizontal scroll. Use `flex-wrap` and `min-w-0` on flex children that contain text.

When in doubt, look at the existing mobile behavior in `Layout.astro` and `ToolUpload.astro` first; the responsive solutions are already in the codebase.

## Accessibility

Preserve and improve. The codebase already has:

- Live region (`#a11y-status`) for status announcements.
- `aria-current="step"` on the progress dots.
- `aria-expanded` on toggleable panels (lang dropdown, mobile menu, metadata viewer).
- `role="alert"` on the upload error banner.
- Focus moved to `#results-heading` after a scan.
- Skip-to-content link.
- `prefers-reduced-motion` honored.

When you change markup, check that these attributes still apply and still point to the right elements. Don't downgrade `role="button"` to a `div` without restoring the button semantics, and don't remove a `role="alert"` to "tidy up the markup".

Touch targets ≥ 44px. Focus rings: the global `:focus-visible` outline is 2px solid `--pmr-accent` with 2px offset; do not remove it on specific elements unless you replace it with an equally visible alternative.

## Internationalization

The UI strings live in `src/locales/{en,de,fr}.json`. The page-level long-form content lives in content collections under `src/content/{blog,guides}/<slug>/{en,de,fr}.md`.

When you add any user-facing text, even a single tooltip:

1. Add the key to `en.json` (the source of truth).
2. Add the same key with the translation to `de.json`.
3. Add the same key with the translation to `fr.json`.
4. Verify the build doesn't silently fall back (search for the new key in each locale file before declaring done).

`data-*` attributes on `#files-list` in `ToolUpload.astro` are how the client-side script reads localized strings. When you add a new string, add a new `data-*` attribute on `#files-list` and a corresponding lookup in the script. Don't introduce a separate `lang/<x>.json` runtime fetch — the strings must be inlined at build time.

## SEO

Don't break what `Layout.astro` already does: title, description, canonical, hreflang (`en` / `de` / `fr` + `x-default`), Open Graph, Twitter, JSON-LD blocks, sitemap, robots. UI changes that add or remove page sections don't need to touch any of this. If a change requires adding new JSON-LD types, use the same pattern as the existing `WebSite` / `SoftwareApplication` / `WebApplication` / `FAQPage` / `BreadcrumbList` / `Blog` blocks — emit them from the page's frontmatter and pass via the `jsonLd` prop on `<Layout>`.

URL structure is stable. Do not add new URL patterns casually; do not change slugs.

## Analytics

Plausible is the only allowed analytics. The wrapper in `src/lib/analytics.ts` already:

- No-ops when `PUBLIC_PLAUSIBLE_DOMAIN` is empty.
- Calls `trackEvent(name, { props })` and only sends plain string/number/boolean props.

When you add a new event, follow the same pattern. Do not add image data, filenames, EXIF, GPS coordinates, or any identifier that could re-identify a user. Events should be coarse (`file_upload`, `scan_complete`, `removal_complete`, `download`, `language_switch`, `theme_toggle`).

## Performance

No new heavy dependencies. No animation library, no UI kit, no icon library, no canvas/SVG framework. The existing icons are inline SVGs in the Astro templates — add new ones in the same style (24×24 viewBox, 1.5–2 stroke width, `currentColor`). The image-processing dependencies (`exifr`, `heic2any`, `jszip`) are dynamically imported inside the client script; preserve that lazy-loading.

## Change discipline

For every change:

1. Identify the exact file(s) and the exact reason. If you can't articulate the reason in one sentence, the change is probably too broad.
2. Make the smallest change that solves the problem. Three lines is better than thirty.
3. After the change, run `npm run build` and confirm zero errors.
4. Run any Playwright test whose name touches the changed area.
5. Don't commit, push, branch, or reset — modify only the working tree.

## Priority order when deciding what to improve

1. Upload clarity
2. Primary workflow clarity (Upload → Scan → Remove → Download)
3. Metadata result clarity
4. Remove action clarity
5. Download action clarity
6. Clear All clarity
7. Navigation clarity
8. Responsive behavior
9. Accessibility
10. Secondary content polish
11. Decorative refinement

Functionality before visual polish. If you only have time for one improvement, make the upload dropzone more obvious — not the hero gradient.

## Visual QA after every meaningful change

Inspect the change at these checkpoints. If you can't run a real browser, at minimum reason about each:

- **Light mode**: 360, 375, 390, desktop (≥1280).
- **Dark mode**: 360, 375, 390, desktop (≥1280).

For each, check: navbar, hero, upload dropzone, dashed border visibility, format badges, file list rows, metadata viewer, action buttons, processing spinner, success state, error state, Clear All, Download, Download ZIP, footer.

Look for: overflow, clipping, alignment drift, weak contrast, invisible borders, broken focus rings, broken buttons, layout shifts, unexpected horizontal scrolling.

## Functional QA after every change

Run through the six canonical cases below. If you can only run the build, at minimum reason about each case and call out which ones you couldn't verify.

| Test | What it verifies |
|---|---|
| A — Single file | Upload → scan → remove → download. UI reaches the success state. |
| B — Clear All | Process a file, click Clear All, verify the tool returns to empty state. |
| C — Replacement upload | Process image A, then drop image B. Verify A's metadata, preview, status, clean blob, and object URL are not retained. |
| D — Batch | Select multiple files, verify Remove All, individual downloads, and ZIP download. |
| E — Localization | EN, DE, FR. Navigation, tool text, errors, button labels, a11y labels, secondary pages. |
| F — Responsive | 360, 375, 390, desktop. No horizontal scroll, no clipped text, no overlapping controls. |

## Stop conditions — ask the user, don't proceed

- A requested UI change requires modifying image-processing logic.
- An existing component must be replaced entirely (rather than modified).
- A new dependency with significant bundle impact appears necessary.
- The requested visual behavior conflicts with the privacy architecture (e.g. "show a thumbnail preview that gets sent to the server").
- A design decision could materially change the product identity (e.g. "make it look more like a SaaS landing page" or "add a hero video").

When in doubt, ask. The rules in this skill fail safe to "do less" — guessing wrong is more expensive than asking.

## Output contract — final report per change

After every meaningful change, produce a report with these sections, each marked PASS / FAIL / REQUIRES ATTENTION:

- **A. Project audit** — what you found before changing anything.
- **B. Skills used** — list of skills consulted, including this one.
- **C. Files changed** — every file, with one-line reason.
- **D. UI/UX improvements** — what got better, in user terms.
- **E. Responsive improvements** — viewports checked.
- **F. Accessibility improvements** — what got better, or what was preserved.
- **G. Functional tests** — the six cases A–F, marked pass/fail.
- **H. Visual QA** — light/dark × {360, 375, 390, desktop}.
- **I. Build result** — `npm run build` output summary.
- **J. Remaining issues** — anything you noticed but didn't fix and why.

## Failure handling

- If `npm run build` fails after your change, fix the change — don't silence the error.
- If a Playwright test fails, fix the underlying bug. Don't weaken the assertion. Don't delete the test.
- If a locale key is missing, fix it in all three locale files. Don't leave English text in DE or FR pages.
- If a UI change requires a dependency, justify it in the report. The default is "no new dependency".

## Examples

**Good change**: "The download button on the file row wraps awkwardly at 360px. Make the file row's actions flex-wrap and tighten the gap." → Two Tailwind class changes in `ToolUpload.astro`, no locale keys added, no dependencies. Report shows Files Changed: `src/components/ToolUpload.astro` (file row action wrap on small viewports).

**Bad change**: "The site looks too minimal, let's add a hero gradient and a few decorative cards." → Out of scope. Asks the user to confirm product direction first. The product is a utility, not a marketing site.

**Bad change**: "Let's move the upload tool to a React island so we can use a real component library." → Hard constraint violation. Astro stays. Existing component is correct.
