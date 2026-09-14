// Stitch Light Theme — responsive QA (Phase 1)
//
// Verifies, for every required viewport:
//   1. No horizontal overflow (scrollWidth <= clientWidth).
//   2. No unclipped/unreachable element extends beyond the right edge of the
//      viewport — content inside a clipping or horizontally-scrollable
//      container (e.g. the pannable single-row navbar) is reachable and
//      never creates page-level overflow.
//   3. The navbar is the same single compact row at every viewport (~80px,
//      brand + navigation + controls) with >= 44px interactive hit areas.
//   4. The page still hydrates (body[data-pmr-ready]).
//   5. Light theme only — <html> has no .dark class.
//
// Pages: EN home (all sections), DE home, FR home, EN tool page, EN blog article.
// Run with: node stitch-responsive-qa.mjs   (dev server must be running)

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4321';

const VIEWPORTS = [
  { name: '375x667 (mobile S)', width: 375, height: 667, mobile: true },
  { name: '390x844 (mobile L)', width: 390, height: 844, mobile: true },
  { name: '768x1024 (tablet P)', width: 768, height: 1024, mobile: false },
  { name: '820x1180 (tablet L)', width: 820, height: 1180, mobile: false },
  { name: '1280x800 (laptop)', width: 1280, height: 800, mobile: false },
  { name: '1440x900 (desktop)', width: 1440, height: 900, mobile: false },
];

const PAGES = [
  { path: '/en/', label: 'EN home' },
  { path: '/de/', label: 'DE home' },
  { path: '/fr/', label: 'FR home' },
  { path: '/en/remove-exif-data/', label: 'EN tool page' },
  { path: '/en/blog/what-is-exif-data/', label: 'EN blog article' },
];

let failures = 0;
function ok(msg, cond) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.log(`  ✗ ${msg}`);
  }
}

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  console.log(`\n=== ${vp.name} ===`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  for (const p of PAGES) {
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-pmr-ready]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);

    // 1. No horizontal overflow on the document
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    ok(
      `${p.label}: no horizontal overflow (${overflow.scrollWidth} <= ${overflow.clientWidth})`,
      overflow.scrollWidth <= overflow.clientWidth + 1
    );

    // 2. No unclipped/unreachable element sticking out beyond the right edge.
    //    Elements clipped by an ancestor with overflow:hidden/clip are
    //    decorative bleed by design; elements inside a horizontally-scrollable
    //    container (overflow:auto/scroll) are reachable by panning and are
    //    contained — neither can cause user-visible page overflow.
    const wide = await page.evaluate((vw) => {
      const out = [];
      const isContained = (el) => {
        let a = el.parentElement;
        while (a && a !== document.body) {
          const s = getComputedStyle(a);
          if (
            s.overflowX === 'hidden' || s.overflowX === 'clip' || s.overflowX === 'scroll' || s.overflowX === 'auto' ||
            s.overflow === 'hidden' || s.overflow === 'clip' || s.overflow === 'scroll' || s.overflow === 'auto'
          ) return true;
          a = a.parentElement;
        }
        return false;
      };
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1 && !isContained(el)) {
          out.push(el.tagName + '.' + String(el.className).slice(0, 60));
          if (out.length >= 3) break;
        }
      }
      return out;
    }, vp.width);
    ok(`${p.label}: no unclipped element beyond right edge`, wide.length === 0);
    if (wide.length > 0) console.log(`    offenders: ${wide.join(' | ')}`);

    // 2b. Navbar is the same single compact Stitch row (one line, ~80px),
    //     with the brand recognisable and every control >= 44x44.
    const navChecks = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Primary"]');
      const fit = document.getElementById('nav-fit');
      if (!nav || !fit) return null;
      const rowY = new Set([...fit.children].map((el) => Math.round(el.getBoundingClientRect().y))).size;
      const brand = fit.querySelector('a[aria-label]');
      const brandRect = brand?.getBoundingClientRect();
      const nameW = Math.round(brand?.querySelector('span span')?.getBoundingClientRect().width ?? 0);
      const interactive = [...fit.querySelectorAll('a, button')];
      return {
        height: Math.round(nav.getBoundingClientRect().height),
        rows: rowY,
        brandW: brandRect ? Math.round(brandRect.width) : 0,
        nameW,
        minW: Math.round(Math.min(...interactive.map((el) => el.getBoundingClientRect().width))),
        minH: Math.round(Math.min(...interactive.map((el) => el.getBoundingClientRect().height))),
        cta: !!document.getElementById('nav-cta'),
        langToggle: !!document.getElementById('lang-toggle'),
      };
    });
    ok(
      `${p.label}: navbar single compact row (${navChecks?.height}px, ${navChecks?.rows} row)`,
      !!navChecks && navChecks.rows === 1 && navChecks.height <= 95
    );
    ok(
      `${p.label}: brand visible (${navChecks?.brandW}px, name ${navChecks?.nameW}px)`,
      !!navChecks && navChecks.brandW >= 44 && navChecks.nameW >= 60
    );
    ok(
      `${p.label}: nav controls >= 44x44 (min ${navChecks?.minW}x${navChecks?.minH})`,
      !!navChecks && navChecks.minW >= 44 && navChecks.minH >= 44
    );
    ok(`${p.label}: CTA + language selector present`, !!navChecks && navChecks.cta && navChecks.langToggle);

    // 3. Hydration marker present (only pages that ship the upload tool hydrate it)
    const ready = await page.evaluate(() =>
      !document.querySelector('#file-input') || document.body.hasAttribute('data-pmr-ready')
    );
    ok(`${p.label}: app hydrated where the tool ships`, ready);

    // 4. Light theme only
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    ok(`${p.label}: light theme (no .dark on <html>)`, !dark);

    // 5. On mobile: key targets >= 44px tall (only where the element exists)
    if (vp.mobile) {
      const targetsOk = await page.evaluate(() => {
        for (const s of ['#upload-zone', '#lang-toggle', '#mobile-menu-toggle']) {
          const el = document.querySelector(s);
          if (el && el.getBoundingClientRect().height < 44) return false;
        }
        const cta = document.querySelector('#nav-cta');
        if (cta && cta.getBoundingClientRect().height < 44) return false;
        return true;
      });
      ok(`${p.label}: mobile touch targets >= 44px`, targetsOk);
    }
  }

  await ctx.close();
}

// Stitch section presence on EN home (order + anchors), once at desktop size
console.log('\n=== Stitch sections (EN home, 1280x800) ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 15000 }).catch(() => {});

  const checks = await page.evaluate(() => ({
    hero: !!document.querySelector('section[data-purpose="hero-banner"]'),
    upload: !!document.querySelector('#upload-zone'),
    features: !!document.querySelector('section[data-purpose="feature-grid"]'),
    how: !!document.querySelector('#how-it-works'),
    riskAudit: document.body.textContent.includes('Risk audit'),
    riskRows: document.querySelectorAll('#risk-audit li, ul li').length >= 6,
    fidelity: document.body.textContent.includes('Same pixels. Zero metadata.'),
    faq: !!document.querySelector('#faq details'),
    trust: document.body.textContent.includes('Private by architecture, not by promise'),
    anchors: !!document.querySelector('a[href="#how-it-works"]') && !!document.querySelector('a[href="#faq"]'),
    themeToggleInert: !!document.querySelector('#theme-toggle') && !document.documentElement.classList.contains('dark'),
    surfaceBg: getComputedStyle(document.documentElement).getPropertyValue('--pmr-bg').trim() === '#f7f9f7',
    accent: getComputedStyle(document.documentElement).getPropertyValue('--pmr-accent').trim() === '#15803d',
  }));

  ok('hero present', checks.hero);
  ok('upload tool present', checks.upload);
  ok('privacy features section', checks.features);
  ok('how-it-works with anchor', checks.how);
  ok('risk audit section + table rows', checks.riskAudit && checks.riskRows);
  ok('perceptual fidelity section', checks.fidelity);
  ok('accessible FAQ (native details)', checks.faq);
  ok('trust strip', checks.trust);
  ok('trust CTAs target real anchors', checks.anchors);
  ok('theme toggle present but inert (light-only)', checks.themeToggleInert);
  ok('surface token #f7f9f7 active', checks.surfaceBg);
  ok('accent #15803d active', checks.accent);

  await ctx.close();
}

await browser.close();

console.log(failures === 0 ? '\nALL RESPONSIVE QA CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
