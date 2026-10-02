// Visual QA for the 3 new dedicated tool pages across all required viewports.
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
const TOOLS = [
  'view-photo-metadata',
  'remove-gps-data',
  'remove-metadata-heic',
];
const OUT_DIR = path.resolve('qa-tool-screenshots');

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];
  for (const tool of TOOLS) {
    for (const vp of VIEWPORTS) {
      for (const lang of LANGS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
        });
        const page = await ctx.newPage();
        const url = `${BASE}/${lang.code}/${tool}/`;
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const status = resp ? resp.status() : 'no-resp';
        await page.waitForTimeout(700);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));

        const file = path.join(OUT_DIR, `${tool}-${vp.name}-${lang.code}.png`);
        await page.screenshot({ path: file, fullPage: true });

        report.push({
          tool,
          vp: vp.name,
          lang: lang.code,
          status,
          scrollW: overflow.scrollWidth,
          clientW: overflow.clientWidth,
          overflow: overflow.scrollWidth > overflow.clientWidth + 1,
        });
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });