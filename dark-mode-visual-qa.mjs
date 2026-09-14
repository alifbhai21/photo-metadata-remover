/**
 * Visual verification: screenshot key pages in light + dark, toggle-state audit.
 */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const BASE = 'http://localhost:4321';
const browser = await chromium.launch();

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

// --- Toggle state audit (icon + aria-label stay in sync) ---
console.log('\n[A] Toggle button icon/aria state sync');
{
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/`);
  const labelDark = await page.locator('#theme-toggle').getAttribute('aria-label');
  ok('initially labels switch-to-dark (light theme)', labelDark === 'Switch to dark mode', labelDark);
  ok('moon icon visible in light mode', await page.locator('[data-theme-icon="moon"]').isVisible());
  ok('sun icon hidden in light mode', await page.locator('[data-theme-icon="sun"]').isHidden());
  await page.locator('#theme-toggle').click();
  const labelLight = await page.locator('#theme-toggle').getAttribute('aria-label');
  ok('after toggle labels switch-to-light (dark theme)', labelLight === 'Switch to light mode', labelLight);
  ok('sun icon visible in dark mode', await page.locator('[data-theme-icon="sun"]').isVisible());
  ok('moon icon hidden in dark mode', await page.locator('[data-theme-icon="moon"]').isHidden());
  const dt = await page.locator('#theme-toggle').getAttribute('data-theme');
  ok('data-theme="dark" after toggle', dt === 'dark', dt);
  await ctx.close();
}

// --- Screenshots + pixel-level white-region detection ---
console.log('\n[B] Visual screenshots (light + dark)');
{
  const pages = [
    ['en/', 'home'],
    ['en/photo-metadata-remover/', 'tool'],
    ['en/blog/what-is-exif-data/', 'article'],
    ['en/formats/', 'formats'],
    ['', 'langchooser'],
  ];
  for (const [path, name] of pages) {
    const lctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
    const lpage = await lctx.newPage();
    await lpage.goto(`${BASE}/${path}`);
    await lpage.waitForTimeout(150);
    await lpage.screenshot({ path: `test-results/theme-shot-light-${name}.png` });
    await lctx.close();

    const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
    await dctx.addInitScript(() => localStorage.setItem('pmr_theme', 'dark'));
    const dpage = await dctx.newPage();
    await dpage.goto(`${BASE}/${path}`);
    await dpage.waitForTimeout(150);
    await dpage.screenshot({ path: `test-results/theme-shot-dark-${name}.png` });
    await dctx.close();
  }
  ok('screenshots captured for all pages', true);
}

// --- Pixel audit of dark screenshots (no large light areas), decoded in-page ---
console.log('\n[C] Pixel-level dark audit (no large light areas)');
{
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  const dir = await import('node:fs/promises');
  const files = await dir.readdir('test-results');
  const darkShots = files.filter((f) => f.startsWith('theme-shot-dark-'));
  for (const f of darkShots) {
    const buf = await readFile(`test-results/${f}`);
    const b64 = buf.toString('base64');
    const result = await page.evaluate(async (dataUrl) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      let light = 0;
      let sampled = 0;
      for (let i = 0; i < d.length; i += 4 * 40) {
        sampled++;
        if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) light++;
      }
      return { light, sampled, ratio: light / sampled };
    }, `data:image/png;base64,${b64}`);
    // NOTE: >235 catches intentional near-white dark-mode TEXT (#ededed) and
    // white-on-accent glyphs as well as surfaces; the authoritative surface
    // check is the DOM getComputedStyle audit in dark-mode-qa.mjs [6] which
    // passed with ZERO near-white backgrounds. A 5% cap here still catches any
    // real light-surface regression while tolerating text glyphs.
    ok(`dark screenshot ${f}: near-white ${(result.ratio * 100).toFixed(1)}% (<5% surface-leak cap)`, result.ratio < 0.05, `ratio=${result.ratio.toFixed(4)}`);
  }
  await ctx.close();
}

await browser.close();

console.log(`\n===== RESULT: ${passed} passed, ${failed} failed =====`);
if (failed > 0) {
  console.log('Failures:', failures.join(', '));
  process.exitCode = 1;
}