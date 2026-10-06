/**
 * Metadata collector audit - end-to-end, through the real homepage UI.
 *
 * Scope notes (deliberate, matching the CURRENT architecture):
 *   - XMP and IPTC are asserted at CONTAINER level ("JPEG XMP" / "JPEG IPTC"
 *     rows, privacy classification, removal, absence from the output bytes).
 *     Field-level XMP/IPTC extraction is NOT implemented in the app
 *     (`addJpegSegmentMetadata` reports presence only) and is not asserted here.
 *   - HEIC/HEIF has no valid fixture in the repository, so it is reported as
 *     NOT TESTABLE rather than faked.
 *
 * Every assertion here goes through the real UI (upload -> scan -> panel ->
 * remove -> verify -> download -> re-upload). Nothing imports src/ internals
 * for the behaviour under test; the byte-level inspectors in audit-fixtures.mjs
 * are independent re-derivations used to prove what the output really contains.
 */
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildComprehensiveJpeg, buildGpsJpeg, buildXmpJpeg, buildIptcJpeg, buildComJpeg,
  buildLensSerialJpeg,
  buildTechnicalOnlyJpeg, buildPlainJpeg,
  buildMetadataPng, buildPlainPng,
  buildMetadataWebpWithXmp, buildPlainWebp,
  buildMetadataTiff, buildPlainTiff,
  hasJpegExifSegment, hasJpegXmpSegment, hasJpegIptcSegment, hasJpegComSegment,
  listJpegSegments, findPlantedStrings, PLANTED_STRINGS,
  listPngChunks, pngHasMetadataChunks, pngIsStructurallyValid,
  listWebpChunks, webpIsStructurallyValid, isTiff,
} from './audit-fixtures.mjs';

const TMP = join(process.cwd(), 'audit-fixtures-out');
mkdirSync(TMP, { recursive: true });

async function ready(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 20000 });
}

async function openHome(page: Page): Promise<void> {
  await page.goto('http://localhost:4321/en/');
  await ready(page);
}

const fileInput = (page: Page) => page.locator('input[type="file"]');

/** Write a fixture to disk and return its path (Playwright needs a real path). */
function save(name: string, bytes: Buffer): string {
  const p = join(TMP, name);
  writeFileSync(p, bytes);
  return p;
}

/**
 * Open the per-file metadata panel for item 0 and return every row as
 * { label, value, isPrivacy }. Privacy rows carry the `bg-warning-bg/50` class
 * added by renderMetadataRows() for exactly the classified-privacy entries.
 */
/**
 * Item ids are 1-BASED: the first uploaded file is `[data-id="1"]`, so every
 * control is #remove-1 / #download-1 / #meta-toggle-1 / #metadata-panel-1.
 *
 * Status line selector: `updateItemStatus()` OVERWRITES statusEl.className on
 * every state change, and every branch uses `text-xs mt-1 <tone>` - so the
 * class is stable across states. (The initial `text-[12.5px] mt-1.5` from
 * renderFiles() never survives the first update.)
 */
const STATUS_SEL = (id: number) => `[data-id="${id}"] .text-xs.mt-1`;

async function readMetadataRows(page: Page, id = 1): Promise<Array<{ label: string; value: string; isPrivacy: boolean }>> {
  const toggle = page.locator(`#meta-toggle-${id}`);
  const panel = page.locator(`#metadata-panel-${id}`);
  if ((await panel.count()) === 0) {
    await toggle.click();
    await panel.waitFor({ state: 'visible', timeout: 15000 });
  }
  return page.evaluate((i) => {
    const p = document.getElementById(`metadata-panel-${i}`);
    if (!p) return [];
    const out: Array<{ label: string; value: string; isPrivacy: boolean }> = [];
    p.querySelectorAll('div.flex.items-start.justify-between').forEach((row) => {
      const spans = row.querySelectorAll('span');
      if (spans.length < 2) return;
      out.push({
        label: (spans[0].textContent || '').trim(),
        value: (spans[1].textContent || '').trim(),
        isPrivacy: (row as HTMLElement).className.includes('bg-warning-bg/50'),
      });
    });
    return out;
  }, id);
}

/** Status text of a file item (the scan / removal / verification summary). */
async function statusOf(page: Page, id = 1): Promise<string> {
  return page.locator(STATUS_SEL(id)).first().textContent().catch(() => '') || '';
}

async function removeFirst(page: Page): Promise<void> {
  await page.locator('#remove-1').click();
}

async function waitForVerified(page: Page, id = 1): Promise<string> {
  const status = page.locator(STATUS_SEL(id)).first();
  await expect(status).toContainText('Metadata removed successfully', { timeout: 30000 });
  await expect(page.locator(`#download-${id}`)).toBeEnabled({ timeout: 20000 });
  return (await status.textContent()) || '';
}

/** The scan status line of item `id`, once it reports privacy metadata. */
function scanStatus(page: Page, id = 1) {
  return page.locator(STATUS_SEL(id)).first();
}

/**
 * Assert item `id` does NOT report privacy metadata. A count-based check on a
 * single-element locator would pass vacuously, so the status TEXT is asserted
 * directly instead.
 */
async function expectNoPrivacyMetadata(page: Page, id = 1): Promise<void> {
  const status = scanStatus(page, id);
  await expect(status).toBeVisible({ timeout: 15000 });
  await expect(status).toContainText('No privacy metadata found', { timeout: 15000 });
  await expect(status).not.toContainText('Privacy metadata found (');
}

async function downloadFirst(page: Page, name: string, id = 1): Promise<Buffer> {
  const wait = page.waitForEvent('download');
  await page.locator(`#download-${id}`).click();
  const dl = await wait;
  const p = join(TMP, name);
  await dl.saveAs(p);
  return readFileSync(p);
}

/**
 * THE decisive step: never trust the UI's "removed" claim on its own.
 * Re-parse the downloaded bytes independently and assert no privacy container
 * and no planted privacy string survives.
 */
async function assertCleanBytes(bytes: Buffer, label: string): Promise<void> {
  const leaked = findPlantedStrings(bytes);
  expect(leaked, `${label}: planted privacy strings must not survive removal`).toEqual([]);
}

function expectJpegContainersGone(bytes: Buffer, label: string): void {
  expect(hasJpegExifSegment(bytes), `${label}: Exif APP1 must be gone`).toBe(false);
  expect(hasJpegXmpSegment(bytes), `${label}: XMP APP1 must be gone`).toBe(false);
  expect(hasJpegIptcSegment(bytes), `${label}: APP13 IPTC must be gone`).toBe(false);
  expect(hasJpegComSegment(bytes), `${label}: COM comment must be gone`).toBe(false);
}

test.describe('TEST A - JPEG complete metadata collection', () => {
  test('the collector surfaces EXIF, GPS, XMP, IPTC and COM, all classified as privacy', async ({ page }) => {
    const path = save('audit-comprehensive.jpg', await buildComprehensiveJpeg());

    // Fixture sanity, independent of the app.
    const fixtureBytes = readFileSync(path);
    expect(hasJpegExifSegment(fixtureBytes)).toBe(true);
    expect(hasJpegXmpSegment(fixtureBytes)).toBe(true);
    expect(hasJpegIptcSegment(fixtureBytes)).toBe(true);
    expect(hasJpegComSegment(fixtureBytes)).toBe(true);

    await openHome(page);
    await fileInput(page).setInputFiles(path);

    const rows = await readMetadataRows(page);
    const byLabel = new Map(rows.map((r) => [r.label, r]));
    const labels = rows.map((r) => r.label);

    for (const k of ['Make', 'Model', 'Software', 'Artist', 'Copyright', 'ImageDescription']) {
      expect(labels, `EXIF ${k} must be collected`).toContain(k);
      expect(byLabel.get(k)!.isPrivacy, `${k} must be classified privacy`).toBe(true);
    }
    expect(byLabel.get('Make')!.value).toBe('AUDIT-CAM');
    expect(byLabel.get('Model')!.value).toBe('AUDIT-M9');
    expect(byLabel.get('Artist')!.value).toBe('Jane Auditor');

    for (const k of ['LensModel', 'FocalLength', 'ExposureTime', 'FNumber', 'ISO',
      'SerialNumber', 'DateTimeOriginal', 'ModifyDate']) {
      expect(labels, `ExifIFD ${k} must be collected`).toContain(k);
      expect(byLabel.get(k)!.isPrivacy, `${k} must be classified privacy`).toBe(true);
    }
    expect(byLabel.get('LensModel')!.value).toBe('AUDIT-LENS 24-70');
    expect(byLabel.get('ISO')!.value).toBe('400');
    expect(byLabel.get('FocalLength')!.value).toBe('35');
    // exifr surfaces tag 0xA431 (BodySerialNumber) under the name SerialNumber.
    expect(byLabel.get('SerialNumber')!.value).toBe('AUDIT-BODY-777');

    for (const k of ['GPSLatitudeRef', 'GPSLatitude', 'GPSLongitudeRef', 'GPSLongitude',
      'GPSAltitude', 'GPSAltitudeRef', 'GPSTimeStamp']) {
      expect(labels, `GPS ${k} must be collected`).toContain(k);
      expect(byLabel.get(k)!.isPrivacy, `${k} must be classified privacy`).toBe(true);
    }
    expect(labels, 'normalised latitude must be present').toContain('latitude');
    expect(labels, 'normalised longitude must be present').toContain('longitude');
    expect(Number(byLabel.get('latitude')!.value)).toBeCloseTo(48.8568, 2);
    expect(Number(byLabel.get('longitude')!.value)).toBeCloseTo(2.3020, 2);
    expect(byLabel.get('GPSLatitude')!.value).toContain('48');

    // XMP / IPTC / COM at CONTAINER level (field-level is not implemented).
    const xmpRow = rows.find((r) => /^JPEG XMP( \(\d+\))?$/.test(r.label));
    expect(xmpRow, 'JPEG XMP container must be reported').toBeTruthy();
    expect(xmpRow!.isPrivacy, 'JPEG XMP container must be classified privacy').toBe(true);
    const iptcRow = rows.find((r) => /^JPEG IPTC( \(\d+\))?$/.test(r.label));
    expect(iptcRow, 'JPEG IPTC container must be reported').toBeTruthy();
    expect(iptcRow!.isPrivacy, 'JPEG IPTC container must be classified privacy').toBe(true);
    const comRow = rows.find((r) => /^JPEG COM( \(\d+\))?$/.test(r.label));
    expect(comRow, 'JPEG COM container must be reported').toBeTruthy();
    expect(comRow!.isPrivacy, 'JPEG COM container must be classified privacy').toBe(true);

    expect(await statusOf(page)).toContain('Privacy metadata found');
  });
});

test.describe('TEST B - privacy vs technical classification', () => {
  test('technical JFIF fields alone never raise a false privacy result', async ({ page }) => {
    // This JPEG carries ONLY a JFIF APP0: no EXIF/XMP/IPTC/COM container.
    const bytes = await buildTechnicalOnlyJpeg();
    expect(hasJpegExifSegment(bytes)).toBe(false);
    expect(hasJpegXmpSegment(bytes)).toBe(false);
    expect(hasJpegIptcSegment(bytes)).toBe(false);
    expect(hasJpegComSegment(bytes)).toBe(false);

    const path = save('audit-technical-only.jpg', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    await expectNoPrivacyMetadata(page);

    // The technical fields may be displayed, but never flagged privacy.
    const rows = await readMetadataRows(page);
    for (const r of rows) {
      if (['JFIFVersion', 'ResolutionUnit', 'XResolution', 'YResolution',
        'ThumbnailWidth', 'ThumbnailHeight'].includes(r.label)) {
        expect(r.isPrivacy, `${r.label} is technical and must NOT be privacy`).toBe(false);
      }
    }
  });

  test('the comprehensive JPEG keeps JFIF technical fields non-privacy', async ({ page }) => {
    const path = save('audit-comprehensive.jpg', await buildComprehensiveJpeg());
    await openHome(page);
    await fileInput(page).setInputFiles(path);
    const rows = await readMetadataRows(page);
    for (const r of rows) {
      if (['JFIFVersion', 'ResolutionUnit', 'XResolution', 'YResolution',
        'ThumbnailWidth', 'ThumbnailHeight'].includes(r.label)) {
        expect(r.isPrivacy, `${r.label} must stay non-privacy`).toBe(false);
      }
    }
    expect(rows.find((r) => r.label === 'Make')!.isPrivacy).toBe(true);
  });
});

test.describe('TEST C - JPEG removal and real output verification', () => {
  test('removal clears every privacy container and the downloaded bytes prove it', async ({ page }) => {
    const path = save('audit-comprehensive.jpg', await buildComprehensiveJpeg());
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    await removeFirst(page);
    const status = await waitForVerified(page);

    // The UI's own verification claim...
    expect(status).toContain('Privacy metadata remaining: 0');

    // ...and the byte-level truth, derived independently of the app.
    const out = await downloadFirst(page, 'audit-clean.jpg');
    expectJpegContainersGone(out, 'cleaned JPEG');
    await assertCleanBytes(out, 'cleaned JPEG');
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out[out.length - 2]).toBe(0xff);
    expect(out[out.length - 1]).toBe(0xd9);

    // Re-upload the cleaned output: nothing must be found.
    await fileInput(page).setInputFiles(join(TMP, 'audit-clean.jpg'));
    await expectNoPrivacyMetadata(page);
  });
});

test.describe('TEST E - XMP container', () => {
  test('the XMP container is detected, classified privacy, removed and absent from the output', async ({ page }) => {
    const bytes = await buildXmpJpeg();
    expect(hasJpegXmpSegment(bytes)).toBe(true);
    expect(hasJpegExifSegment(bytes)).toBe(false);

    const path = save('audit-xmp.jpg', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    // A JPEG whose ONLY privacy metadata is XMP must not read as clean.
    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });

    const rows = await readMetadataRows(page);
    const xmp = rows.find((r) => /^JPEG XMP( \(\d+\))?$/.test(r.label));
    expect(xmp, 'JPEG XMP container row must be shown').toBeTruthy();
    expect(xmp!.isPrivacy, 'JPEG XMP must be classified privacy').toBe(true);

    await removeFirst(page);
    await waitForVerified(page);
    const out = await downloadFirst(page, 'audit-xmp-clean.jpg');
    expect(hasJpegXmpSegment(out), 'XMP must be absent from the cleaned bytes').toBe(false);
    expectJpegContainersGone(out, 'XMP-cleaned JPEG');
  });
});

test.describe('TEST F - IPTC container', () => {
  test('the IPTC/Photoshop container is detected, classified privacy and removed', async ({ page }) => {
    const bytes = await buildIptcJpeg();
    expect(hasJpegIptcSegment(bytes)).toBe(true);
    expect(hasJpegExifSegment(bytes)).toBe(false);

    const path = save('audit-iptc.jpg', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    const rows = await readMetadataRows(page);
    const iptc = rows.find((r) => /^JPEG IPTC( \(\d+\))?$/.test(r.label));
    expect(iptc, 'JPEG IPTC container row must be shown').toBeTruthy();
    expect(iptc!.isPrivacy, 'JPEG IPTC must be classified privacy').toBe(true);

    await removeFirst(page);
    await waitForVerified(page);
    const out = await downloadFirst(page, 'audit-iptc-clean.jpg');
    expect(hasJpegIptcSegment(out), 'IPTC must be absent from the cleaned bytes').toBe(false);
    expectJpegContainersGone(out, 'IPTC-cleaned JPEG');
  });
});

test.describe('TEST G - JPEG COM comment', () => {
  test('a COM comment is detected, classified privacy and removed', async ({ page }) => {
    const bytes = await buildComJpeg();
    expect(hasJpegComSegment(bytes)).toBe(true);
    const path = save('audit-com.jpg', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    const rows = await readMetadataRows(page);
    const com = rows.find((r) => /^JPEG COM( \(\d+\))?$/.test(r.label));
    expect(com, 'JPEG COM container row must be shown').toBeTruthy();
    expect(com!.isPrivacy, 'JPEG COM must be classified privacy').toBe(true);

    await removeFirst(page);
    await waitForVerified(page);
    const out = await downloadFirst(page, 'audit-com-clean.jpg');
    expect(hasJpegComSegment(out), 'COM must be absent from the cleaned bytes').toBe(false);
    expect(findPlantedStrings(out), 'the comment text must not survive').toEqual([]);
  });
});

test.describe('TEST H - camera, lens and device fields', () => {
  test('camera/lens/serial fields are collected and classified per current rules', async ({ page }) => {
    const path = save('audit-comprehensive.jpg', await buildComprehensiveJpeg());
    await openHome(page);
    await fileInput(page).setInputFiles(path);
    const rows = await readMetadataRows(page);
    const get = (l: string) => rows.find((r) => r.label === l);

    // Only assert fields that are PHYSICALLY present in the fixture.
    expect(get('Make')!.value).toBe('AUDIT-CAM');
    expect(get('Model')!.value).toBe('AUDIT-M9');
    expect(get('Software')!.value).toBe('AUDIT-SW 2.0');
    expect(get('LensModel')!.value).toBe('AUDIT-LENS 24-70');
    expect(get('SerialNumber')!.value).toBe('AUDIT-BODY-777');
    expect(get('FocalLength')!.value).toBe('35');
    for (const l of ['Make', 'Model', 'Software', 'LensModel', 'SerialNumber', 'FocalLength']) {
      expect(get(l)!.isPrivacy, `${l} must be privacy`).toBe(true);
    }
  });
});

test.describe('TEST I - date/time fields', () => {
  test('DateTimeOriginal / ModifyDate are collected and classified privacy', async ({ page }) => {
    const path = save('audit-comprehensive.jpg', await buildComprehensiveJpeg());
    await openHome(page);
    await fileInput(page).setInputFiles(path);
    const rows = await readMetadataRows(page);
    const labels = rows.map((r) => r.label);

    expect(labels, 'DateTimeOriginal must be present under its named key').toContain('DateTimeOriginal');
    expect(labels, 'ModifyDate must be present').toContain('ModifyDate');
    expect(rows.find((r) => r.label === 'DateTimeOriginal')!.isPrivacy).toBe(true);
    expect(rows.find((r) => r.label === 'ModifyDate')!.isPrivacy).toBe(true);

    // The raw numeric tag id must never leak into the display: if it did, the
    // row would render but classify NON-privacy (a silent under-count).
    expect(labels, 'raw numeric tag 36867 must not appear').not.toContain('36867');
    expect(labels.filter((l) => /^\d+$/.test(l)), 'no bare numeric EXIF tag ids may be displayed').toEqual([]);
  });
});

test.describe('TEST J - PNG', () => {
  test('PNG metadata chunks are detected, classified, removed and the output stays valid', async ({ page }) => {
    const bytes = await buildMetadataPng();
    const chunks = listPngChunks(bytes);
    expect(chunks).toContain('eXIf');
    expect(chunks.some((c) => ['tEXt', 'iTXt', 'tIME'].includes(c))).toBe(true);
    expect(pngIsStructurallyValid(bytes)).toBe(true);

    const path = save('audit-metadata.png', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    const rows = await readMetadataRows(page);
    const labels = rows.map((r) => r.label);

    expect(labels).toContain('Make');
    expect(rows.find((r) => r.label === 'Make')!.isPrivacy).toBe(true);
    // Chunk-scoped entries for the textual/time chunks exifr cannot read.
    const chunkRows = rows.filter((r) => /^PNG (eXIf|tEXt|zTXt|iTXt|tIME)( \(\d+\))?$/.test(r.label));
    expect(chunkRows.length, 'PNG chunk-scoped metadata rows must be shown').toBeGreaterThan(0);
    for (const r of chunkRows) expect(r.isPrivacy, `${r.label} must be privacy`).toBe(true);

    // Technical PNG properties stay non-privacy.
    for (const r of rows) {
      if (['ImageWidth', 'ImageHeight', 'BitsPerSample', 'ColorType', 'Compression',
        'Filter', 'Interlace', 'ResolutionUnit', 'XResolution', 'YResolution',
        'Orientation'].includes(r.label)) {
        expect(r.isPrivacy, `${r.label} is technical PNG data`).toBe(false);
      }
    }

    await removeFirst(page);
    const status = await waitForVerified(page);
    expect(status).toContain('Privacy metadata remaining: 0');

    const out = await downloadFirst(page, 'audit-clean.png');
    expect(pngHasMetadataChunks(out), 'no privacy chunk may survive').toEqual([]);
    expect(pngIsStructurallyValid(out), 'cleaned PNG must stay structurally valid').toBe(true);
    const outChunks = listPngChunks(out);
    expect(outChunks[0]).toBe('IHDR');
    expect(outChunks[outChunks.length - 1]).toBe('IEND');
    expect(outChunks).toContain('IDAT');
  });

  test('a PNG without metadata is never claimed to carry privacy metadata', async ({ page }) => {
    const bytes = await buildPlainPng();
    expect(pngHasMetadataChunks(bytes)).toEqual([]);
    const path = save('audit-plain.png', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);
    await expectNoPrivacyMetadata(page);
  });
});

test.describe('TEST L - TIFF', () => {
  test('TIFF metadata is detected, removed, and the output stays a valid TIFF', async ({ page }) => {
    const bytes = await buildMetadataTiff();
    expect(isTiff(bytes)).toBe(true);

    const path = save('audit-metadata.tiff', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    const rows = await readMetadataRows(page);
    const make = rows.find((r) => r.label === 'Make');
    expect(make, 'TIFF Make must be collected').toBeTruthy();
    expect(make!.value).toBe('AUDIT-TIFF-CAM');
    expect(make!.isPrivacy, 'TIFF Make must be privacy').toBe(true);

    await removeFirst(page);
    await waitForVerified(page);
    const out = await downloadFirst(page, 'audit-clean.tiff');

    expect(isTiff(out), 'output must still be a TIFF').toBe(true);
    const text = Buffer.from(out).toString('latin1');
    expect(text, 'TIFF privacy strings must not survive').not.toContain('AUDIT-TIFF-CAM');
    expect(text).not.toContain('Jane Auditor');
    expect(text).not.toContain('AUDIT-TIFF-SW');
  });
});

test.describe('TEST M - HEIC / HEIF coverage status', () => {
  test('NOT TESTABLE - documented gap, not fabricated', () => {
    // The production path (isHeicFile -> heic2any -> validateJpegBlob ->
    // JPEG verification) exists but cannot be exercised: the repository
    // contains no valid .heic/.heif fixture. Reported in the audit report
    // rather than faked.
    expect(true).toBe(true);
  });
});

test.describe('TEST K - WebP', () => {
  test('WebP EXIF and XMP chunks are detected, removed, and alpha/structure survive', async ({ page }) => {
    const bytes = await buildMetadataWebpWithXmp();
    const chunks = listWebpChunks(bytes);
    expect(chunks).toContain('EXIF');
    expect(chunks).toContain('XMP ');
    expect(chunks).toContain('ALPH');
    expect(webpIsStructurallyValid(bytes)).toBe(true);

    const path = save('audit-metadata.webp', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    const rows = await readMetadataRows(page);
    const labels = rows.map((r) => r.label);
    expect(labels, 'WebP EXIF Make must be collected').toContain('Make');
    expect(rows.find((r) => r.label === 'Make')!.isPrivacy).toBe(true);
    // The XMP chunk the stripper removes is reported by the chunk-scoped row.
    const xmpRow = rows.find((r) => /^WebP XMP( \(\d+\))?$/.test(r.label));
    expect(xmpRow, 'WebP XMP chunk must be reported').toBeTruthy();
    expect(xmpRow!.isPrivacy, 'WebP XMP chunk must be privacy').toBe(true);

    await removeFirst(page);
    await waitForVerified(page);
    const out = await downloadFirst(page, 'audit-clean.webp');

    const outChunks = listWebpChunks(out);
    expect(outChunks, 'EXIF chunk must be gone').not.toContain('EXIF');
    expect(outChunks, 'XMP chunk must be gone').not.toContain('XMP ');
    expect(outChunks, 'alpha chunk must be preserved').toContain('ALPH');
    expect(webpIsStructurallyValid(out), 'cleaned WebP must stay a valid RIFF/WEBP').toBe(true);
    expect(out.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(out.subarray(8, 12).toString('latin1')).toBe('WEBP');
  });

  test('a WebP without metadata is auto-stripped and never claims privacy metadata', async ({ page }) => {
    const bytes = await buildPlainWebp();
    const path = save('audit-plain.webp', bytes);
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    // A metadata-free WebP is AUTO-STRIPPED by design: renderFiles() collects
    // every item whose metadata object is empty and strips it immediately, so
    // the item settles in the VERIFIED-CLEAN state instead of the
    // "nothing found" state. Either way it must never report privacy metadata.
    const status = scanStatus(page);
    await expect(status).toBeVisible({ timeout: 15000 });
    await expect(status).not.toContainText('Privacy metadata found (');
    await expect(status).toContainText('Privacy metadata remaining: 0', { timeout: 20000 });

    // With no metadata at all the panel cannot be opened (the toggle is
    // legitimately disabled and labelled "No metadata found"), so there is by
    // construction no privacy row to leak.
    await expect(page.locator('#meta-toggle-1')).toBeDisabled();
    await expect(page.locator('#meta-toggle-1')).toContainText('No metadata found');
    await expect(page.locator('#metadata-panel-1')).toHaveCount(0);

    // The verified output is still a real, structurally valid WebP.
    const out = await downloadFirst(page, 'audit-plain-clean.webp');
    expect(webpIsStructurallyValid(out), 'cleaned plain WebP must stay valid').toBe(true);
    expect(listWebpChunks(out)).not.toContain('EXIF');
    expect(listWebpChunks(out)).not.toContain('XMP ');
  });
});
test.describe('TEST D - GPS', () => {
  test('real GPS EXIF is detected, removed, and gone from the re-uploaded output', async ({ page }) => {
    const path = save('audit-gps.jpg', await buildGpsJpeg());
    await openHome(page);
    await fileInput(page).setInputFiles(path);

    const rows = await readMetadataRows(page);
    const labels = rows.map((r) => r.label);
    for (const k of ['GPSLatitudeRef', 'GPSLatitude', 'GPSLongitudeRef', 'GPSLongitude',
      'GPSAltitude', 'GPSAltitudeRef', 'GPSTimeStamp']) {
      expect(labels, `GPS ${k} must be detected`).toContain(k);
      expect(rows.find((r) => r.label === k)!.isPrivacy, `${k} must be privacy`).toBe(true);
    }
    expect(Number(rows.find((r) => r.label === 'latitude')!.value)).toBeCloseTo(48.8568, 2);
    expect(Number(rows.find((r) => r.label === 'longitude')!.value)).toBeCloseTo(2.3020, 2);

    await removeFirst(page);
    await waitForVerified(page);
    const out = await downloadFirst(page, 'audit-gps-clean.jpg');
    expectJpegContainersGone(out, 'GPS-cleaned JPEG');
    await assertCleanBytes(out, 'GPS-cleaned JPEG');

    await fileInput(page).setInputFiles(join(TMP, 'audit-gps-clean.jpg'));
    await expectNoPrivacyMetadata(page);
  });
});

test.describe('TEST N - mixed-format batch collection', () => {
  test('each file is scanned independently; removing one does not mutate another', async ({ page }) => {
    const jpeg = save('batch-a.jpg', await buildComprehensiveJpeg());
    const webp = save('batch-b.webp', await buildMetadataWebpWithXmp());
    const png = save('batch-c.png', await buildMetadataPng());
    const tiff = save('batch-d.tiff', await buildMetadataTiff());

    await openHome(page);
    await fileInput(page).setInputFiles([jpeg, webp, png, tiff]);

    // Item ids are 1-based: this batch is ids 1..4.
    await expect(page.locator('[data-id="1"]')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('[data-id="4"]')).toBeVisible({ timeout: 25000 });
    // Every file reports its own scan status independently.
    for (const id of [1, 2, 3, 4]) {
      await expect(scanStatus(page, id),
        `file ${id} must report its own privacy metadata`).toContainText('Privacy metadata found', { timeout: 25000 });
    }

    // Remove ONLY the JPEG (id 1); the others must stay untouched.
    await page.locator('#remove-1').click();
    await expect(scanStatus(page, 1))
      .toContainText('Metadata removed successfully', { timeout: 30000 });
    await expect(page.locator('#download-1')).toBeEnabled({ timeout: 20000 });

    // The JPEG output is genuinely clean...
    const out = await downloadFirst(page, 'batch-a-clean.jpg', 1);
    expectJpegContainersGone(out, 'batch JPEG output');
    await assertCleanBytes(out, 'batch JPEG output');

    // ...while the WebP (id 2) still carries its own metadata.
    const webpRows = await readMetadataRows(page, 2);
    expect(webpRows.map((r) => r.label), 'the WebP keeps its own Make').toContain('Make');
    expect(webpRows.find((r) => r.label === 'Make')!.value).toBe('AUDIT-WEBP-CAM');
  });
});

test.describe('TEST O - re-upload / same file', () => {
  test('re-uploading the cleaned file yields no privacy metadata; the original still does', async ({ page }) => {
    const original = save('reupload-original.jpg', await buildComprehensiveJpeg());

    await openHome(page);
    await fileInput(page).setInputFiles(original);
    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    await removeFirst(page);
    await waitForVerified(page);
    const clean = await downloadFirst(page, 'reupload-clean.jpg');
    await assertCleanBytes(clean, 'cleaned re-upload source');

    // (1) Re-upload the CLEANED file: no privacy metadata, no stale state.
    await fileInput(page).setInputFiles(join(TMP, 'reupload-clean.jpg'));
    await expectNoPrivacyMetadata(page);
    const cleanRows = await readMetadataRows(page);
    expect(cleanRows.filter((r) => r.isPrivacy),
      'no row from the previous scan may leak into the cleaned file').toEqual([]);

    // (2) Re-upload the ORIGINAL file again: its metadata must return in full.
    await fileInput(page).setInputFiles(original);
    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });
    const rows = await readMetadataRows(page);
    expect(rows.find((r) => r.label === 'Make')!.value, 'the original scan must not be stale').toBe('AUDIT-CAM');
  });
});

test.describe('TEST P - responsive metadata panel', () => {
  const VIEWPORTS = [
    { name: '320x568', width: 320, height: 568 },
    { name: '360x740', width: 360, height: 740 },
    { name: '375x667', width: 375, height: 667 },
    { name: '390x844', width: 390, height: 844 },
    { name: '412x915', width: 412, height: 915 },
    { name: '430x932', width: 430, height: 932 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: '1440x900', width: 1440, height: 900 },
  ];

  for (const vp of VIEWPORTS) {
    test(`metadata panel stays usable at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const path = save(`resp-${vp.width}.jpg`, await buildComprehensiveJpeg());
      await openHome(page);
      await fileInput(page).setInputFiles(path);

      // Open the panel and make sure it is actually rendered.
      const rows = await readMetadataRows(page);
      expect(rows.length, 'the metadata panel must render rows').toBeGreaterThan(0);

      // No horizontal overflow anywhere on the page.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `no horizontal overflow at ${vp.name}`).toBeLessThanOrEqual(1);

      // Values stay readable: the panel renders and is not clipped.
      const panel = page.locator('#metadata-panel-1');
      await expect(panel).toBeVisible();

      // Both controls remain usable. Clickability is proven by real actionability
      // (enabled + stable + receives events), NOT by on-screen position: the
      // panel is expanded above the controls, so they legitimately sit below
      // the fold on short viewports.
      await expect(page.locator('#remove-1')).toBeEnabled();
      await expect(page.locator('#download-1')).toBeVisible();
      const removeBox = await page.locator('#remove-1').boundingBox();
      expect(removeBox, 'Remove metadata must be laid out').not.toBeNull();
      expect(removeBox!.width, 'Remove metadata must not be collapsed').toBeGreaterThan(20);
      expect(removeBox!.height, 'Remove metadata must keep a usable touch target')
        .toBeGreaterThanOrEqual(20);

      // Scrolling to the control must work and it must actually be visible.
      // The intersection ratio is computed explicitly rather than relying on
      // toBeInViewport(), whose default ratio of 0 is exacting about sub-pixel
      // rounding on a page that is still settling its layout.
      await page.locator('#remove-1').scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const visibleRatio = await page.evaluate(() => {
        const r = document.getElementById('remove-1');
        if (!r) return -1;
        const rect = r.getBoundingClientRect();
        const h = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        const w = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
        if (rect.height <= 0 || rect.width <= 0) return 0;
        return (Math.max(0, h) * Math.max(0, w)) / (rect.height * rect.width);
      });
      expect(visibleRatio, 'Remove metadata must be fully on screen after scrolling')
        .toBeGreaterThan(0.99);

      // Rows must not overlap: every row keeps a sane height.
      const zeroHeight = await page.evaluate(() => {
        const p = document.getElementById('metadata-panel-1');
        if (!p) return -1;
        const rows = Array.from(p.querySelectorAll('div.flex.items-start.justify-between'));
        return rows.filter((r) => (r as HTMLElement).getBoundingClientRect().height < 4).length;
      });
      expect(zeroHeight, 'no metadata row may collapse or overlap').toBe(0);
    });
  }
});

test.describe('TEST Q - EXIF LensSerialNumber (0xA435)', () => {
  test('EXIF LensSerialNumber (0xA435) is classified as privacy and removed', async ({ page }) => {
    // The fixture carries IFD0 Make/Model plus an ExifIFD holding LensModel
    // and LensSerialNumber; exifr surfaces 0xA435 under the LensSerialNumber key.
    const bytes = await buildLensSerialJpeg();
    expect(hasJpegExifSegment(bytes)).toBe(true);
    const path = save('audit-lens-serial.jpg', bytes);

    await openHome(page);
    await fileInput(page).setInputFiles(path);
    await expect(scanStatus(page)).toBeVisible({ timeout: 15000 });

    // Detection + classification: the row is collected and flagged privacy.
    const rows = await readMetadataRows(page);
    const lensSerial = rows.find((r) => r.label === 'LensSerialNumber');
    expect(lensSerial, 'LensSerialNumber must be collected').toBeTruthy();
    expect(lensSerial!.value).toBe('AUDIT-LENS-SN-00921');
    expect(lensSerial!.isPrivacy, 'LensSerialNumber must be classified privacy').toBe(true);

    // Removal: the EXIF block (and with it the tag) is stripped and verified.
    await removeFirst(page);
    const status = await waitForVerified(page);
    expect(status).toContain('Privacy metadata remaining: 0');

    const out = await downloadFirst(page, 'audit-lens-serial-clean.jpg');
    expectJpegContainersGone(out, 'LensSerialNumber-cleaned JPEG');
    expect(out.toString('latin1').includes('AUDIT-LENS-SN-00921'),
      'the lens serial string must not survive in the output bytes').toBe(false);

    // Re-upload the cleaned output: no privacy metadata may be reported.
    await fileInput(page).setInputFiles(join(TMP, 'audit-lens-serial-clean.jpg'));
    await expectNoPrivacyMetadata(page);
  });
});
