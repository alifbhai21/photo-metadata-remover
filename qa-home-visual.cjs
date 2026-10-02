// Capture homepage screenshots at the same 6 viewports for visual parity comparison.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4321';
const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];
const OUT_DIR = path.resolve('qa-screenshots-home');

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/en/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    const file = path.join(OUT_DIR, `home-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`captured ${file}`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });