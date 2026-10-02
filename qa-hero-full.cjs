// Full verification of the hero hover animation across all required viewports and languages.
// Captures before/after screenshots and the computed rotate value at each step.
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
const OUT_DIR = path.resolve('qa-hero-screenshots');

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = [];

  for (const vp of VIEWPORTS) {
    for (const lang of LANGS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
      });
      const page = await ctx.newPage();
      const url = `${BASE}/${lang.code}/`;
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const status = resp ? resp.status() : 'no-resp';
      await page.waitForTimeout(700);

      const isDesktop = vp.width >= 1024;

      // Read both card rotate values before any hover
      const beforeRotates = await page.evaluate(() => {
        const fit = document.getElementById('hero-fit');
        if (!fit) return null;
        const cards = [];
        fit.querySelectorAll('div').forEach((el) => {
          const cls = el.className || '';
          if (/rotate-\[-?\d+deg\]/.test(cls)) {
            const cs = window.getComputedStyle(el);
            cards.push({ rotate: cs.rotate, transitionDuration: cs.transitionDuration });
          }
        });
        return cards;
      });

      // Hover the left card and read rotate again
      let leftAfter = null;
      let rightAfter = null;
      if (isDesktop) {
        try {
          const leftCard = page.locator('#hero-fit > div').nth(0);
          await leftCard.hover();
          await page.waitForTimeout(350);
          leftAfter = await page.evaluate(() => {
            const fit = document.getElementById('hero-fit');
            if (!fit) return null;
            const cards = [];
            fit.querySelectorAll('div').forEach((el) => {
              const cls = el.className || '';
              if (/rotate-\[-?\d+deg\]/.test(cls)) {
                cards.push(window.getComputedStyle(el).rotate);
              }
            });
            return cards;
          });
        } catch (e) { leftAfter = `error: ${e.message}`; }

        try {
          const rightCard = page.locator('#hero-fit > div').nth(2);
          await rightCard.hover();
          await page.waitForTimeout(350);
          rightAfter = await page.evaluate(() => {
            const fit = document.getElementById('hero-fit');
            if (!fit) return null;
            const cards = [];
            fit.querySelectorAll('div').forEach((el) => {
              const cls = el.className || '';
              if (/rotate-\[-?\d+deg\]/.test(cls)) {
                cards.push(window.getComputedStyle(el).rotate);
              }
            });
            return cards;
          });
        } catch (e) { rightAfter = `error: ${e.message}`; }
      }

      // Move mouse away from hero (to body)
      await page.mouse.move(10, 10);
      await page.waitForTimeout(350);

      // Check for overflow
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // Capture hero region
      const heroEl = await page.locator('#hero-fit').first();
      if (await heroEl.count()) {
        try {
          const box = await heroEl.boundingBox();
          if (box) {
            await page.screenshot({
              path: path.join(OUT_DIR, `hero-${vp.name}-${lang.code}.png`),
              clip: { x: box.x, y: box.y, width: box.width, height: box.height },
            });
          }
        } catch {}
      }

      report.push({
        vp: vp.name,
        lang: lang.code,
        status,
        desktop: isDesktop,
        before: beforeRotates,
        leftHoverRotates: leftAfter,
        rightHoverRotates: rightAfter,
        scrollW: overflow.scrollWidth,
        clientW: overflow.clientWidth,
        overflow: overflow.scrollWidth > overflow.clientWidth + 1,
      });
      await ctx.close();
    }
  }
  // Reduced motion test (still inside the main browser session)
  const ctx2 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/en/`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(500);
  const leftCard = p2.locator('#hero-fit > div').nth(0);
  await leftCard.hover();
  await p2.waitForTimeout(300);
  const reducedRotates = await p2.evaluate(() => {
    const fit = document.getElementById('hero-fit');
    const cards = [];
    fit.querySelectorAll('div').forEach((el) => {
      const cls = el.className || '';
      if (/rotate-\[-?\d+deg\]/.test(cls)) {
        const cs = window.getComputedStyle(el);
        cards.push({ rotate: cs.rotate, transitionDuration: cs.transitionDuration });
      }
    });
    return cards;
  });
  await ctx2.close();

  console.log(JSON.stringify({ report, reducedMotion: reducedRotates }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });