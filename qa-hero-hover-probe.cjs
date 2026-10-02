// Probe whether the hero cards currently respond to hover on the homepage.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/en/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const inspect = async (label) => {
    const data = await page.evaluate(() => {
      const fit = document.getElementById('hero-fit');
      if (!fit) return { error: 'no hero-fit' };
      const list = [];
      fit.querySelectorAll('div').forEach((el) => {
        const cls = el.className || '';
        if (/rotate-\[-?\d+deg\]/.test(cls)) {
          const style = window.getComputedStyle(el);
          list.push({
            rotate: style.rotate,
            transform: style.transform,
            transitionProperty: style.transitionProperty,
            transitionDuration: style.transitionDuration,
          });
        }
      });
      return list;
    });
    console.log(label, JSON.stringify(data, null, 2));
  };

  await inspect('BEFORE move:');
  const leftCard = page.locator('#hero-fit > div').nth(0);
  await leftCard.hover();
  await page.waitForTimeout(400);
  await inspect('AFTER hover left card:');

  const rightCard = page.locator('#hero-fit > div').nth(2);
  await rightCard.hover();
  await page.waitForTimeout(400);
  await inspect('AFTER hover right card:');

  await ctx.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });