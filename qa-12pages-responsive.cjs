// QA: Render 12 pages at 6 viewports and capture full-page screenshots.
// Output: qa-12pages-screenshots/<route>/<viewport>.png
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROUTES = [
  'en/view-photo-metadata',
  'de/view-photo-metadata',
  'fr/view-photo-metadata',
  'en/remove-exif-data',
  'de/remove-exif-data',
  'fr/remove-exif-data',
  'en/remove-gps-data',
  'de/remove-gps-data',
  'fr/remove-gps-data',
  'en/remove-metadata-heic',
  'de/remove-metadata-heic',
  'fr/remove-metadata-heic',
];

const VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '820x1180', width: 820, height: 1180 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
];

const OUT = path.join(process.cwd(), 'qa-12pages-screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const route of ROUTES) {
    const routeDir = path.join(OUT, route.replace(/\//g, '__'));
    fs.mkdirSync(routeDir, { recursive: true });

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });

      const url = `http://127.0.0.1:4321/${route}/`;
      try {
        const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(800);
        // Detect horizontal overflow
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
        }));
        const file = path.join(routeDir, `${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        results.push({
          route,
          vp: vp.name,
          status: resp ? resp.status() : null,
          scrollWidth: overflow.scrollWidth,
          clientWidth: overflow.clientWidth,
          overflow: overflow.scrollWidth > overflow.clientWidth + 1,
          errors: errors.slice(0, 5),
          file,
        });
      } catch (e) {
        results.push({ route, vp: vp.name, error: String(e).slice(0, 200) });
      }
      await ctx.close();
    }
  }

  await browser.close();

  const summary = {
    totalRenders: results.length,
    failures: results.filter((r) => r.error).length,
    overflows: results.filter((r) => r.overflow).length,
    consoleErrors: results.reduce((acc, r) => acc + (r.errors ? r.errors.length : 0), 0),
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})();
