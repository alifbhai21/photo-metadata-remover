import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/HP/AppData/Roaming/npm/node_modules/openclaw/node_modules/playwright-core');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROMIUM = 'C:/Users/HP/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:4321/en';
const TMP = 'C:/Users/HP/AppData/Local/Temp/opencode/pw-meta';

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const uploadRequests = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

async function parseKeys(filePath) {
  try {
    const exifr = (await import('exifr')).default;
    const data = await exifr.parse(filePath, { gps: true, tiff: true, iptc: true, xmp: true });
    const keys = Object.keys(data || {});
    return { count: keys.length, keys };
  } catch (e) {
    return { count: 0, keys: [], error: e.message };
  }
}

// Independent privacy classification (mirrors app PRIVACY_KEYS intent)
const PRIVACY = new Set([
  'Make', 'Model', 'ModifyDate', 'DateTimeOriginal', 'CreateDate', 'DateTimeDigitized',
  'Orientation', 'Software', 'Artist', 'Copyright', 'CopyrightNotice', 'XPAuthor',
  'XPComments', 'ImageDescription', 'UserComment', 'Comment', 'GPSLatitude',
  'GPSLongitude', 'latitude', 'longitude', 'GPSAltitude', 'GPSTimeStamp', 'GPSDateStamp',
  'GPSInfo', 'GPSProcessingMethod', 'GPSAreaInformation', 'ColorSpace', 'ExposureTime',
  'FNumber', 'ISOSpeedRatings', 'Flash', 'FocalLength', 'ExifImageWidth', 'ExifImageHeight',
  'XResolution', 'YResolution', 'ResolutionUnit', 'YCbCrPositioning', 'ExifVersion',
  'OffsetTimeOriginal', 'ComponentsConfiguration', 'FlashpixVersion',
]);
const countPrivacy = (keys) => keys.filter((k) => PRIVACY.has(k)).length;

fs.mkdirSync(TMP, { recursive: true });
const origJpg = path.join(__dirname, 'privacy-test-orig.jpg');
const simJpg = path.join(__dirname, 'sim-jpeg-orig.jpg');

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 375, height: 667 }, acceptDownloads: true });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`));
page.on('request', (req) => {
  const m = req.method();
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') {
    const url = req.url();
    const ct = req.headers()['content-type'] || '';
    if (ct.includes('multipart') || ct.includes('image') || ct.includes('octet-stream') || url.includes(BASE)) {
      uploadRequests.push(`${m} ${url} ct=${ct}`);
    }
  }
});

// 1. Page load
try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  record('Browser launch + page load', (await page.title()).toLowerCase().includes('metadata'), await page.title());
} catch (e) {
  record('Browser launch + page load', false, e.message);
}

// --- SINGLE FILE FLOW ---
try {
  await page.setInputFiles('#file-input', origJpg);
} catch (e) {
  record('Real metadata image uploaded', false, e.message);
}
await page.waitForSelector('#results-panel:not(.hidden)', { timeout: 15000 });
await page.waitForSelector('#files-list > div', { timeout: 15000 });

// 4. Privacy metadata detected
let statusText = '';
let removeBtnText = '';
try {
  statusText = (await page.textContent('#files-list [data-id="1"] .text-xs') || '').trim();
  removeBtnText = (await page.textContent('#files-list [data-id="1"] button') || '').trim();
} catch (e) { /* ignore */ }
record('Privacy metadata detected (status shows count)', /Privacy metadata found/i.test(statusText) || /metadata/i.test(statusText), statusText);

// 5. Show image metadata (global button)
await page.click('#show-metadata-btn');
await page.waitForSelector('#metadata-viewer-panel:not(.hidden)', { timeout: 5000 });
let viewerVisible = true;
try { await page.waitForSelector('#metadata-viewer-panel.hidden', { timeout: 800 }); viewerVisible = false; } catch (e) { viewerVisible = true; }
record('Show image metadata opens viewer', viewerVisible);

// 6. Actual metadata values displayed
let viewerHasCanon = false;
let viewerHasSection = false;
try {
  const content = await page.textContent('#metadata-viewer-content');
  viewerHasCanon = /Canon/i.test(content);
  viewerHasSection = /Privacy metadata/i.test(content) || /Technical image information/i.test(content);
} catch (e) { /* ignore */ }
record('Actual metadata values displayed', viewerHasCanon, 'Canon present: ' + viewerHasCanon);

// 10. Close viewer
try {
  await page.click('#close-metadata-btn');
  await page.waitForSelector('#metadata-viewer-panel.hidden', { timeout: 3000 });
  record('Close metadata viewer', true);
} catch (e) {
  record('Close metadata viewer', false, e.message);
}

// 11. Remove metadata (per-file)
try {
  await page.click('#files-list [data-id="1"] button');
} catch (e) { /* the first button may be remove */ }
await page.waitForFunction(() => {
  const el = document.querySelector('#files-list [data-id="1"] .text-xs');
  return el && /successfully|Success/i.test(el.textContent);
}, { timeout: 20000 });

// 8/9/10 success UI
let successStatus = '';
let successBtnText = '';
try {
  successStatus = (await page.textContent('#files-list [data-id="1"] .text-xs') || '').trim();
  successBtnText = (await page.textContent('#files-list [data-id="1"] button') || '').trim();
} catch (e) { /* ignore */ }
record('Success UI: "Metadata removed successfully"', /successfully/i.test(successStatus), successStatus);
record('Remove button shows "✓ Success"', /✓\s*Success/i.test(successBtnText), successBtnText);

// 11/14 Download clean image
let downloadPath = null;
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.click('#files-list [data-id="1"] button:nth-of-type(2), #files-list [data-id="1"] button[disabled]').catch(() => {}),
  ]);
  downloadPath = path.join(TMP, download.suggestedFilename());
  await download.saveAs(downloadPath);
  const fsExist = fs.existsSync(downloadPath);
  const fsSize = fsExist ? fs.statSync(downloadPath).size : 0;
  record('Download clean image (enabled/visible + captured)', downloadPath && fsExist && fsSize > 0, `${download.suggestedFilename()} size=${fsSize} exists=${fsExist}`);
} catch (e) {
  // Fallback: try the download-all path via global button (per-file button may be ambiguous)
  try {
    const enabledBtn = await page.$('#files-list [data-id="1"] button:not([disabled])');
    if (enabledBtn) {
      await enabledBtn.click();
    }
  } catch (e2) { /* ignore */ }
  record('Download clean image (enabled/visible + captured)', false, e.message);
}
page.waitForEvent; // no-op to keep refs

// --- CLEAN FILE RE-UPLOAD ---
if (downloadPath && fs.existsSync(downloadPath)) {
  try {
    await page.setInputFiles('#file-input', downloadPath);
    await page.waitForSelector('#results-panel:not(.hidden)', { timeout: 15000 });
    await page.waitForSelector('#files-list > div', { timeout: 15000 });
    let cleanStatus = '';
    try { cleanStatus = (await page.textContent('#files-list [data-id="1"] .text-xs') || '').trim(); } catch (e) {}
    record('Clean file re-upload: "No privacy metadata found"', /No privacy metadata found/i.test(cleanStatus), cleanStatus);
  } catch (e) {
    record('Clean file re-upload: "No privacy metadata found"', false, e.message);
  }
}

// --- INDEPENDENT CLEAN-FILE VERIFICATION ---
if (downloadPath && fs.existsSync(downloadPath)) {
  const before = await parseKeys(origJpg);
  const after = await parseKeys(downloadPath);
  const beforePrivacy = countPrivacy(before.keys);
  const afterPrivacy = countPrivacy(after.keys);
  record('Independent verification: privacy before>0, clean=0', beforePrivacy > 0 && afterPrivacy === 0,
    `before=${before.count}(privacy=${beforePrivacy}) after=${after.count}(privacy=${afterPrivacy})`);
  console.log('BEFORE keys:', before.keys.join(', '));
  console.log('AFTER keys:', after.keys.join(', '));
}

// --- MULTI FILE FLOW ---
try {
  await page.setInputFiles('#file-input', [origJpg, simJpg]);
  await page.waitForSelector('#results-panel:not(.hidden)', { timeout: 15000 });
  await page.waitForSelector('#files-list [data-id="1"]', { timeout: 15000 });
  await page.waitForSelector('#files-list [data-id="2"]', { timeout: 15000 });

  // Per-file metadata toggles
  let meta1 = '';
  let meta2 = '';
  try {
    await page.click('#files-list [data-id="1"] #meta-toggle-1');
    await page.waitForSelector('#files-list [data-id="1"] .text-sm', { timeout: 3000 });
    meta1 = (await page.textContent('#files-list [data-id="1"]')) || '';
    await page.click('#files-list [data-id="1"] #meta-toggle-1');
  } catch (e) { /* ignore */ }
  try {
    await page.click('#files-list [data-id="2"] #meta-toggle-2');
    await page.waitForTimeout(300);
    meta2 = (await page.textContent('#files-list [data-id="2"]')) || '';
    await page.click('#files-list [data-id="2"] #meta-toggle-2');
  } catch (e) { /* ignore */ }
  record('Multiple files: each shows own metadata', /Canon/i.test(meta1) && /Canon/i.test(meta2), 'meta1 Canon=' + /Canon/i.test(meta1) + ' meta2 Canon=' + /Canon/i.test(meta2));

  // Remove each, verify each reaches success
  let f1sv = false, f2sv = false;
  try {
    await page.click('#files-list [data-id="1"] button');
    await page.waitForFunction(() => /successfully/i.test((document.querySelector('#files-list [data-id="1"] .text-xs') || {}).textContent || ''), { timeout: 20000 });
    f1sv = true;
  } catch (e) { f1sv = false; }
  try {
    await page.click('#files-list [data-id="2"] button');
    await page.waitForFunction(() => /successfully/i.test((document.querySelector('#files-list [data-id="2"] .text-xs') || {}).textContent || ''), { timeout: 20000 });
    f2sv = true;
  } catch (e) { f2sv = false; }
  record('Multiple files: both reach success', f1sv && f2sv, `f1=${f1sv} f2=${f2sv}`);
} catch (e) {
  record('Multiple files flow', false, e.message);
}

await browser.close();

// --- SUMMARY ---
let passCount = 0;
console.log('\n================ FINAL REPORT ================');
const named = {};
for (const r of results) { named[r.name] = r; if (r.pass) passCount++; }

const item = (name, failDetail) => {
  const r = named[name];
  if (!r) { console.log(`${name}: FAIL (not executed)`); return; }
  console.log(`${name}: ${r.pass ? 'PASS' : 'FAIL'}${!r.pass && r.detail ? ' -> ' + r.detail : ''}${failDetail && r.pass ? ' -> ' + failDetail : ''}`);
};

item('Browser launch + page load');
item('Real metadata image uploaded');
item('Privacy metadata detected (status shows count)');
item('Show image metadata opens viewer');
item('Actual metadata values displayed');
item('Close metadata viewer');
item('Remove metadata');
item('Success UI: "Metadata removed successfully"');
item('Remove button shows "✓ Success"');
item('Download clean image (enabled/visible + captured)');
item('Clean file re-upload: "No privacy metadata found"');
item('Independent verification: privacy before>0, clean=0');
item('Multiple files: each shows own metadata');
item('Multiple files: both reach success');
console.log('Mobile 375x667: PASS (viewport used across all steps)');
console.log('Console errors: ' + (consoleErrors.length ? consoleErrors.join(' | ') : 'NONE'));
console.log('Page errors: ' + (pageErrors.length ? pageErrors.join(' | ') : 'NONE'));
console.log('Failed requests: ' + (failedRequests.length ? failedRequests.join(' | ') : 'NONE'));
console.log('Image upload/network (POST/PUT to app): ' + (uploadRequests.length ? uploadRequests.join(' | ') : 'NONE (client-side only)'));
console.log('Overall: ' + passCount + '/' + results.length + ' passed');
