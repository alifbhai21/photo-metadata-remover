// Spot-check: render key pages at the 6 required viewports.
// Checks: HTTP status, horizontal overflow, console/page errors, robots meta.
// Output: qa-spotcheck-screenshots/<route>/<viewport>.png + summary.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Key pages: homepage (public), a blog post with neutralized links (public),
// two public content pages, one hidden tool page (must be noindex), one
// localized blog post (content edits touched de/fr too).
const ROUTES = [
  'en/',
  'en/blog/how-to-remove-exif-data',
  'en/formats',
  'en/faq',
  'en/view-photo-metadata',
  'de/blog/what-is-exif-data',
];

const VIEWPORTS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '820x1180', width: 820, height: 1180 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
];

const BASE = 'http://localhost:4321/';
const OUT = path.join(process.cwd(), 'qa-spotcheck-screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const results = [];

  for (const route of ROUTES) {
    const routeDir = path.join(OUT, route.replace(/[\/]/g, '__').replace(/_+$/, ''));
    fs.mkdirSync(routeDir, { recursive: true });

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });

      try {
        const resp = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(500);
        const meta = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          robots: document.querySelector('meta[name="robots"]')?.content ?? '(missing)',
          h1: document.querySelector('h1')?.textContent?.trim()?.slice(0, 60) ?? '(none)',
          title: document.title.slice(0, 80),
        }));
        const file = path.join(routeDir, `${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        results.push({
          route,
          vp: vp.name,
          status: resp ? resp.status() : null,
          overflow: meta.scrollWidth > meta.clientWidth + 1,
          scrollWidth: meta.scrollWidth,
          clientWidth: meta.clientWidth,
          robots: meta.robots,
          h1: meta.h1,
          errors: errors.slice(0, 5),
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
    non200: results.filter((r) => r.status && r.status !== 200).length,
    robotsByRoute: [...new Set(results.map((r) => `${r.route} -> ${r.robots ?? 'n/a'}`))],
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})();
