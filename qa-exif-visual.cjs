// Visual QA for the Remove EXIF Data page across all required viewports.
// Captures full-page screenshots and reports any horizontal overflow.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4321';
const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-820', width: 820, height: 1180 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];
const LANGS = [
  { code: 'en', name: 'EN' },
  { code: 'de', name: 'DE' },
  { code: 'fr', name: 'FR' },
];
const OUT_DIR = path.resolve('qa-screenshots-exif');

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  for (const vp of VIEWPORTS) {
    for (const lang of LANGS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      const url = `${BASE}/${lang.code}/remove-exif-data/`;
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const status = resp ? resp.status() : 'no-resp';
      // Allow styles/fonts to settle
      await page.waitForTimeout(800);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));

      const file = path.join(OUT_DIR, `exif-${vp.name}-${lang.code}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const stat = fs.statSync(file);
      report.push({
        vp: vp.name,
        lang: lang.code,
        status,
        scrollW: overflow.scrollWidth,
        clientW: overflow.clientWidth,
        overflow: overflow.scrollWidth > overflow.clientWidth + 1,
        screenshotBytes: stat.size,
      });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});