// Integration verification in MAIN project. Steps 10/11: drawer navigation.
const { chromium } = require('playwright');

const VPS = [
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '820x1180', width: 820, height: 1180 },
];
const ITEMS = [
  ['Metadata', '/formats'], ['FAQ', '/faq'], ['About', '/about'],
  ['Guides', '/guides'], ['Privacy', '/privacy'], ['Security', '/security'],
];
const LABELS = {
  en: { Metadata: 'Metadata', FAQ: 'FAQ', About: 'About', Guides: 'Guides', Privacy: 'Privacy', Security: 'Security' },
  de: { Metadata: 'Metadaten', FAQ: 'FAQ', About: 'Über uns', Guides: 'Anleitungen', Privacy: 'Datenschutz', Security: 'Sicherheit' },
  fr: { Metadata: 'Métadonnées', FAQ: 'FAQ', About: 'À propos', Guides: 'Guides', Privacy: 'Confidentialité', Security: 'Sécurité' },
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fails = [];
let pass = 0;
const ok = (c, d) => { if (c) pass++; else fails.push(d); };
module.exports = { VPS, ITEMS, LABELS, esc, fails, ok, stats: () => ({ pass, fails }) };

(async () => {
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  for (const vp of VPS) {
    for (const locale of ['en', 'de', 'fr']) {
      for (const [en, suffix] of ITEMS) {
        const label = LABELS[locale][en];
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          hasTouch: true, isMobile: vp.width < 768,
        });
        const page = await ctx.newPage();
        await page.goto(`http://localhost:4321/${locale}/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
        await page.locator('#mobile-menu-toggle').click();
        await page.waitForTimeout(280);
        const loc = page.locator('#mobile-menu a[data-nav-item]').filter({ hasText: new RegExp(`^${esc(label)}$`) }).first();
        const href = await loc.getAttribute('href');
        const box = await loc.boundingBox();
        const before = page.url();
        if (box) {
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
            .catch(() => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2));
        }
        await page.waitForTimeout(1300);
        const after = page.url().replace('http://localhost:4321', '');
        const expected = `/${locale}${suffix}`;
        ok(page.url() !== before && after === expected && href === expected,
          { kind: 'nav', vp: vp.name, locale, item: en, href, after, expected });
        await ctx.close();
      }
    }
  }
  await browser.close();
  const fs = require('fs');
  fs.writeFileSync('.tmp-nav-phase1.json', JSON.stringify({ pass, fails }, null, 1));
  console.log(`NAV PASS: ${pass}  FAILS: ${fails.length}`);
  console.log(JSON.stringify(fails, null, 1));
})();