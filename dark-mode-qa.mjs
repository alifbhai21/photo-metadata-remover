/**
 * Dark Mode end-to-end QA.
 * Requires `astro preview` serving the freshly built `dist/`.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.PREVIEW_URL || 'http://localhost:4322';

function luminance(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(r1, g1, b1, r2, g2, b2) {
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

let passed = 0;
let failed = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Static checks on the served HTML (anti-FOUC script order)
// ---------------------------------------------------------------------------
const html = await (await fetch(`${BASE}/en/`)).text();
const head = html.slice(0, html.indexOf('</head>'));
const inlineScriptIdx = head.indexOf("getItem('pmr_theme')");
const stylesheetIdx = head.indexOf('rel="stylesheet"');
console.log('\n[1] Anti-FOUC inline theme script');
ok('inline theme script present in <head>', inlineScriptIdx >= 0);
ok(
  'inline script runs BEFORE the stylesheet (no wrong-theme flash)',
  inlineScriptIdx >= 0 && stylesheetIdx >= 0 && inlineScriptIdx < stylesheetIdx
);

// ---------------------------------------------------------------------------
const browser = await chromium.launch();

async function surfaceAudit(page, pageName) {
  const violations = await page.evaluate(() => {
    const bad = [];
    const el = document.querySelectorAll('body *');
    for (const node of el) {
      const bg = getComputedStyle(node).backgroundColor;
      if (!bg || bg === 'transparent' || bg.startsWith('rgba(0, 0, 0, 0)')) continue;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) continue;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      // Anything near-white in dark mode = accidental light surface
      if (r > 235 && g > 235 && b > 235) {
        const id = node.id ? `#${node.id}` : node.className && typeof node.className === 'string' ? `.${node.className.split(' ')[0]}` : node.tagName;
        bad.push(`${node.tagName.toLowerCase()}${id}`);
      }
    }
    return bad.filter((v, i, a) => a.indexOf(v) === i).slice(0, 20);
  });
  ok(`no near-white surfaces on /${pageName} in dark mode`, violations.length === 0, `→ ${violations.join(', ')}`);
}
// ---------------------------------------------------------------------------
console.log('\n[2] Light mode default (no saved preference, system light)');
{
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/`);
  ok('html has no .dark class by default', !(await page.evaluate(() => document.documentElement.classList.contains('dark'))));
  const htmlBg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  ok('page background is light in light mode', htmlBg === 'rgb(250, 250, 250)', htmlBg);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n[3] System dark preference honored (no saved choice)');
{
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/`);
  ok('html.dark applied from system preference', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  const htmlBg2 = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  ok('system dark page background is dark', htmlBg2 === 'rgb(10, 10, 10)', htmlBg2);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n[4] Toggle -> dark, instant switch + persistence');
{
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/`);

  const toggle = page.locator('#theme-toggle');
  ok('theme toggle button is visible', await toggle.isVisible());

  await toggle.click();
  ok('html.dark applied immediately (no reload)', await page.evaluate(() => document.documentElement.classList.contains('dark')));

  const navBg = await page.evaluate(() => getComputedStyle(document.querySelector('nav')).backgroundColor);
  const navDark = await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector('nav')).backgroundColor;
    // color-mix() can return oklab(); check brightness from the resolved page canvas
    return c !== 'rgba(0, 0, 0, 0)' && c !== 'rgb(255, 255, 255)';
  });
  ok('nav background is dark themed (not white)', navBg !== 'rgb(255, 255, 255)' && navBg !== 'rgba(0, 0, 0, 0)', navBg);
  void navDark;

  const footerBg = await page.evaluate(() => getComputedStyle(document.querySelector('footer')).backgroundColor);
  ok('footer surface is dark', footerBg === 'rgb(23, 23, 23)', footerBg);

  const stored = await page.evaluate(() => localStorage.getItem('pmr_theme'));
  ok('theme persisted to localStorage', stored === 'dark', stored);

  // Persistence after reload + across pages
  await page.reload();
  ok('dark mode persists after reload', await page.evaluate(() => document.documentElement.classList.contains('dark')));

  await page.goto(`${BASE}/en/formats/`);
  ok('dark mode persists across pages', await page.evaluate(() => document.documentElement.classList.contains('dark')));

  await page.goto(`${BASE}/en/blog/what-is-exif-data/`);
  ok('dark mode persists on article pages', await page.evaluate(() => document.documentElement.classList.contains('dark')));

  // Toggle back to light
  await page.locator('#theme-toggle').click();
  ok('toggle back removes .dark', !(await page.evaluate(() => document.documentElement.classList.contains('dark'))));
  await page.reload();
  ok('light mode persists after reload', !(await page.evaluate(() => document.documentElement.classList.contains('dark'))));
  const stored2 = await page.evaluate(() => localStorage.getItem('pmr_theme'));
  ok('light choice persisted', stored2 === 'light', stored2);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n[5] Saved dark overrides system light');
{
  const ctx = await browser.newContext({ colorScheme: 'light' });
  await ctx.addInitScript(() => { localStorage.setItem('pmr_theme', 'dark'); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/`);
  ok('saved dark wins over system light', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await ctx.close();
// ---------------------------------------------------------------------------
console.log('\n[6] No near-white surfaces anywhere in dark mode');
{
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  await ctx.addInitScript(() => { localStorage.setItem('pmr_theme', 'dark'); });
  const page = await ctx.newPage();
  const pages = [
    'en/',
    'en/about/',
    'en/faq/',
    'en/formats/',
    'en/guides/',
    'en/guides/what-is-exif/',
    'en/blog/',
    'en/blog/what-is-exif-data/',
    'en/photo-metadata-remover/',
    'en/remove-metadata-heic/',
    'en/contact/',
    'en/impressum/',
    'en/privacy/',
    'en/terms/',
    '',
  ];
  for (const p of pages) {
    await page.goto(`${BASE}/${p}`);
    await page.waitForTimeout(60);
    await surfaceAudit(page, p || '(language chooser)');
  }
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n[7] Mobile: toggle reachable & functional (375x667)');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/`);
  const toggle = page.locator('#theme-toggle');
  ok('toggle visible on mobile', await toggle.isVisible());
  await toggle.click();
  ok('toggle switches theme on mobile', !(await page.evaluate(() => document.documentElement.classList.contains('dark'))));
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n[8] Contrast ratios of the dark token pairs');
{
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const pairs = [
    ['text-text on bg', '#ededed', '#0a0a0a', 4.5],
    ['text-text-muted on bg', '#a1a1a1', '#0a0a0a', 4.5],
    ['text-text-muted on surface', '#a1a1a1', '#171717', 4.5],
    ['text-text on surface', '#ededed', '#171717', 7],
    ['white on accent-btn (buttons)', '#ffffff', '#0057c9', 4.5],
    ['accent link text on bg', '#5b9bff', '#0a0a0a', 4.5],
    ['danger-text on danger-bg', '#f87171', '#450a0a', 4.5],
    ['warning-text on warning-bg', '#fbbf24', '#451a03', 4.5],
    ['success-text on success-bg', '#4ade80', '#052e16', 4.5],
    ['muted on surface-muted (hover rows)', '#a1a1a1', '#1f1f1f', 3],
  ];
  for (const [name, fg, bg, min] of pairs) {
    const fr = hex(fg);
    const br = hex(bg);
    const c = contrast(fr[0], fr[1], fr[2], br[0], br[1], br[2]);
    ok(`contrast ${name}: ${c.toFixed(2)}:1 (min ${min}:1 on dark)`, c >= min, `actual ${c.toFixed(2)}`);
  }
  const lw = contrast(255, 255, 255, 0, 112, 243);
  ok(`light mode button contrast unchanged (white/#0070f3 = ${lw.toFixed(2)}:1)`, Math.abs(lw - 4.47) < 0.1);
}

// ---------------------------------------------------------------------------
console.log('\n[9] Availability of new semantic utilities in bundle CSS');
{
  const bundles = await (await fetch(`${BASE}/en/`)).text();
  const cssFiles = [...bundles.matchAll(/\/_astro\/[^"']+\.css/g)].map((m) => m[0]);
  ok('CSS bundle(s) referenced', cssFiles.length > 0);
  let all = '';
  for (const f of cssFiles) {
    all += await (await fetch(`${BASE}${f}`)).text();
  }
  for (const cls of ['bg-surface', 'bg-surface-muted', 'bg-surface-strong', 'bg-accent-btn', 'text-danger-text', 'bg-warning-bg', 'bg-success-bg', 'text-warning-text', 'text-success-text', '.dark']) {
    ok(`CSS contains ${cls}`, all.includes(cls));
  }
}

await browser.close();

console.log(`\n\n===== RESULT: ${passed} passed, ${failed} failed =====`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exitCode = 1;
}
}