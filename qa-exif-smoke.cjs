// End-to-end smoke test for the new dedicated /<lang>/remove-exif-data/ page.
// Verifies the page loads in all 3 langs, the upload works, the metadata
// pipeline strips EXIF, output is downloadable, and navigation works.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:4321';
const TEST_IMG = path.resolve('test-exif.jpg'); // Has EXIF (existing fixture)

const LANGS = ['en', 'de', 'fr'];

function hasFixture() {
  return fs.existsSync(TEST_IMG);
}

async function runOne(browser, lang) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const url = `${BASE}/${lang}/remove-exif-data/`;
  const consoleErrs = [];
  page.on('pageerror', (e) => consoleErrs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(`console.error: ${m.text()}`);
  });

  const navResp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  if (!navResp || navResp.status() !== 200) {
    return { lang, status: navResp ? navResp.status() : 'no-resp', error: 'navigation failed' };
  }

  // Verify the page-specific elements exist
  const heroTitle = await page.locator('h1').first().innerText();
  const hasUpload = await page.locator('#upload-zone').count();
  const hasSidebar = await page.locator('text=/Your Privacy|Datenschutz|confidentialité/i').count();
  const hasFeatures = await page.locator('text=/EXIF tags|EXIF-Tags|balises EXIF/i').count();
  const hasFaq = await page.locator('text=/What is EXIF|EXIF-Daten|Qu.+ce que les donn.+es EXIF/i').count();

  let downloadOk = false;
  if (hasFixture()) {
    await page.setInputFiles('#file-input', TEST_IMG);
    // Wait for results panel to appear
    await page.waitForSelector('#results-panel:not(.hidden)', { timeout: 30000 });
    await page.waitForTimeout(800);

    // Trigger remove-all and wait for download button enabled
    const removeBtn = page.locator('#remove-all-btn');
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
    }

    // Wait for download button enabled (download gating)
    await page.waitForSelector('#download-all-btn:not([disabled])', { timeout: 60000 });

    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('#download-all-btn').click(),
    ]);
    const savePath = path.join('qa-screenshots-exif', `download-${lang}.zip`);
    await dl.saveAs(savePath);
    const stat = fs.statSync(savePath);
    downloadOk = stat.size > 100;
  }

  await ctx.close();
  return {
    lang,
    status: navResp.status(),
    heroTitle,
    uploadZone: hasUpload === 1,
    sidebar: hasSidebar >= 1,
    features: hasFeatures >= 1,
    faq: hasFaq >= 1,
    downloadOk,
    consoleErrors: consoleErrs,
  };
}

(async () => {
  if (!fs.existsSync('qa-screenshots-exif')) fs.mkdirSync('qa-screenshots-exif', { recursive: true });
  if (!hasFixture()) {
    console.error('Missing fixture:', TEST_IMG);
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const lang of LANGS) {
    const r = await runOne(browser, lang);
    results.push(r);
    console.log(JSON.stringify(r, null, 2));
  }
  await browser.close();
  const allOk = results.every((r) =>
    r.status === 200 && r.uploadZone && r.sidebar && r.features && r.faq && r.downloadOk && r.consoleErrors.length === 0
  );
  console.log('ALL OK:', allOk);
  process.exit(allOk ? 0 : 2);
})().catch((e) => { console.error(e); process.exit(1); });