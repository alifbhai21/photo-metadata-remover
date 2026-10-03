// Integration verification: steps 8, 11, 12, 13 (behaviour, a11y, hidden tools, desktop).
const { chromium } = require('playwright');

const VPS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '820x1180', width: 820, height: 1180 },
];
const fails = [];
let pass = 0;
const ok = (c, d) => { if (c) pass++; else fails.push(d); };

(async () => {
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });

  for (const vp of VPS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true, isMobile: vp.width < 768,
    });
    const page = await ctx.newPage();
    await page.goto('http://localhost:4321/en/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.locator('#mobile-menu-toggle').click();
    await page.waitForTimeout(300);

    ok(await page.locator('#mobile-menu').isVisible(), { v: vp.name, m: 'drawer opens' });
    ok((await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded')) === 'true', { v: vp.name, m: 'aria-expanded' });
    ok((await page.locator('#mobile-menu a[data-nav-item]:visible').count()) === 7, { v: vp.name, m: '7 items visible' });
    ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, { v: vp.name, m: 'no h-overflow' });
    ok((await page.evaluate(() => document.body.style.overflow)) === 'hidden', { v: vp.name, m: 'scroll locked' });
    const db = await page.locator('#mobile-menu .pmr-drawer-panel').boundingBox();
    ok(db && db.x >= 0 && db.x + db.width <= vp.width + 1, { v: vp.name, m: 'drawer inside viewport' });
    ok((await page.locator('.pmr-drawer-cta').getAttribute('href')) === '/en/', { v: vp.name, m: 'CTA href' });
    const hid = await page.evaluate(() =>
      [...document.querySelectorAll('#mobile-menu a[href]')].map((a) => a.getAttribute('href'))
        .filter((h) => /view-photo-metadata|remove-exif-data|remove-gps-data|remove-metadata-heic/.test(h)));
    ok(hid.length === 0, { v: vp.name, m: 'hidden tools absent', leaked: hid });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(280);
    ok((await page.locator('#mobile-menu').isVisible()) === false, { v: vp.name, m: 'Escape closes' });
    ok((await page.evaluate(() => document.activeElement?.id)) === 'mobile-menu-toggle', { v: vp.name, m: 'focus after Escape' });
    ok((await page.evaluate(() => document.body.style.overflow)) === '', { v: vp.name, m: 'lock released' });

    await page.locator('#mobile-menu-toggle').click();
    await page.waitForTimeout(280);
    await page.locator('.pmr-drawer-close').click();
    await page.waitForTimeout(280);
// ---- Step 11: language switching from the drawer ----
  for (const locale of ['de', 'fr']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('http://localhost:4321/en/faq', { waitUntil: 'networkidle' });
    await page.locator('#mobile-menu-toggle').click();
    await page.waitForTimeout(300);
    const b = await page.locator(`#mobile-menu a[data-lang-switch="${locale}"]`).boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    ok(page.url().replace('http://localhost:4321', '') === `/${locale}/faq`, { m: `lang ${locale} path`, url: page.url() });
    ok((await page.evaluate(() => localStorage.getItem('pmr_lang'))) === locale, { m: `lang ${locale} pmr_lang` });
    ok((await page.evaluate(() => document.documentElement.lang)) === locale, { m: `lang ${locale} html lang` });
    await ctx.close();
  }

  // ---- Step 8: desktop unchanged ----
  for (const vp of [{ w: 1280, h: 800 }, { w: 1440, h: 900 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:4321/en/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      burgerHidden: getComputedStyle(document.querySelector('#mobile-menu-toggle').parentElement).display === 'none',
      navRowFlex: getComputedStyle(document.getElementById('nav-fit')).display === 'flex',
      drawerHidden: getComputedStyle(document.getElementById('mobile-menu')).display === 'none',
      navH: Math.round(document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cta: !!document.getElementById('nav-cta'),
      langToggle: !!document.getElementById('lang-toggle'),
    }));
    ok(r.burgerHidden && r.navRowFlex && r.drawerHidden && r.navH === 81 && r.overflow <= 1 && r.cta && r.langToggle,
      { m: `desktop ${vp.w}x${vp.h}`, ...r });
    await ctx.close();
  }

  await browser.close();
  require('fs').writeFileSync('.tmp-behave-phase2.json', JSON.stringify({ pass, fails }, null, 1));
  console.log(`TOTAL BEHAVIOUR PASS: ${pass}  FAILS: ${fails.length}`);
  console.log(JSON.stringify(fails, null, 1));
})();
    ok((await page.locator('#mobile-menu').isVisible()) === false, { v: vp.name, m: 'X closes' });
    ok((await page.evaluate(() => document.activeElement?.id)) === 'mobile-menu-toggle', { v: vp.name, m: 'focus after X' });

    await page.locator('#mobile-menu-toggle').click();
    await page.waitForTimeout(280);
    await page.locator('#mobile-menu .pmr-drawer-backdrop').click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(280);
    ok((await page.locator('#mobile-menu').isVisible()) === false, { v: vp.name, m: 'backdrop closes' });
    ok((await page.evaluate(() => document.body.style.overflow)) === '', { v: vp.name, m: 'lock released after backdrop' });
    await ctx.close();
  }
  require('fs').writeFileSync('.tmp-behavedone.json', String(pass));
  console.log('VIEWPORT BEHAVIOUR PASS: ' + pass);
})();