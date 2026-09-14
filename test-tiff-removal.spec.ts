/**
 * TIFF metadata removal (P0 fix) — UI coverage.
 *
 * Proves through the real UI that:
 *   - .tiff and .tif uploads are accepted (no "unsupported file" error)
 *   - TIFF privacy metadata is detected during the scan step
 *   - removal completes and never leaves a permanent "Removing..." state
 *   - the downloaded file is a real TIFF whose metadata is actually gone
 *     (re-scanned with exifr + a raw byte scan), with unchanged dimensions,
 *     unchanged pixels and a preserved ICC profile
 *   - a TIFF works alongside another format in one batch, and one failed TIFF
 *     does not block the other files
 *   - the TIFF controls stay usable at all six target viewports
 *
 * Run with the dev server up: npx playwright test test-tiff-removal.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import exifr from 'exifr';
import sharp from 'sharp';
// @ts-expect-error - plain ESM fixture builder shared with the Node harness
import { buildMetadataRichTiff, rgbPixels, PRIVACY_VALUES } from './test-tiff-fixture.mjs';

const PARSE_OPTIONS = { tiff: true, exif: true, gps: true, xmp: true, iptc: true };

const FORBIDDEN_KEYS = [
  'Make', 'Model', 'Software', 'Artist', 'Copyright', 'ImageDescription',
  'ModifyDate', 'DateTimeOriginal', 'HostComputer', 'SerialNumber', 'LensModel',
  'UserComment', 'XPTitle', 'latitude', 'longitude', 'GPSLatitude',
  'GPSLongitude', 'xmpmeta', 'GeoTiffDirectory', '65000',
];

const VIEWPORTS = [
  { width: 375, height: 667, label: 'mobile-small' },
  { width: 390, height: 844, label: 'mobile-large' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 820, height: 1180, label: 'tablet-large' },
  { width: 1280, height: 800, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
];

let workDir = '';
let tiffPath = '';
let tifPath = '';
let jpegPath = '';
let brokenTiffPath = '';
let fixtureBytes = new Uint8Array(0);
let iccBytes: Uint8Array | null = null;

async function realIcc(): Promise<Uint8Array | null> {
  const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .tiff()
    .withMetadata({ icc: 'srgb' })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return meta.icc ? new Uint8Array(meta.icc) : null;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'pmr-tiff-'));
  iccBytes = await realIcc();
  fixtureBytes = buildMetadataRichTiff({ icc: iccBytes, trailingJunk: 'TRAILING-PRIVACY-JUNK' });

  tiffPath = join(workDir, 'privacy-photo.tiff');
  writeFileSync(tiffPath, fixtureBytes);
  tifPath = join(workDir, 'privacy-photo2.tif');
  writeFileSync(tifPath, fixtureBytes);

  jpegPath = join(workDir, 'batch-photo.jpg');
  writeFileSync(
    jpegPath,
    await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 20, b: 20 } } })
      .jpeg({ quality: 88 })
      .withExifMerge({ IFD0: { Make: 'BATCH-JPEG-MAKE', Model: 'BATCH-JPEG-MODEL' } })
      .toBuffer(),
  );

  brokenTiffPath = join(workDir, 'broken.tiff');
  writeFileSync(brokenTiffPath, Buffer.from('II*\u0000 not really a tiff at all', 'latin1'));
});

test.afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

/** Scan the downloaded clean TIFF the way a TIFF-capable parser would. */
async function verifyCleanTiff(downloaded: string): Promise<void> {
  const bytes = new Uint8Array(readFileSync(downloaded));

  const parsed = await exifr.parse(Buffer.from(bytes), PARSE_OPTIONS);
  const keys = Object.keys(parsed || {});
  const leaked = keys.filter((key) => FORBIDDEN_KEYS.includes(key));
  expect(leaked, `privacy keys still present: ${leaked.join(', ')}`).toEqual([]);

  const raw = Buffer.from(bytes).toString('latin1').replace(/\u0000/g, '');
  const markers = PRIVACY_VALUES.filter((value) => raw.includes(value));
  expect(markers, `privacy payload bytes still present: ${markers.join(', ')}`).toEqual([]);

  const outputMeta = await sharp(Buffer.from(bytes)).metadata();
  const sourceMeta = await sharp(Buffer.from(fixtureBytes)).metadata();
  expect(outputMeta.width).toBe(sourceMeta.width);
  expect(outputMeta.height).toBe(sourceMeta.height);

  const before = await sharp(Buffer.from(fixtureBytes)).raw().toBuffer();
  const after = await sharp(Buffer.from(bytes)).raw().toBuffer();
  expect(Buffer.compare(before, after)).toBe(0);

  if (iccBytes) {
    // The ICC profile must survive the rewrite byte-for-byte.
    expect(outputMeta.icc).toBeTruthy();
    expect(Buffer.compare(Buffer.from(outputMeta.icc!), Buffer.from(iccBytes))).toBe(0);
  }
}
test.describe('TIFF metadata removal', () => {
  test('scan finds metadata, removal completes and the download is a clean TIFF', async ({ page }, testInfo) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles(tiffPath);

    // Accepted + rendered (no validation error, TIFF format chip, not <img>).
    await expect(page.locator('#files-list > div').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#upload-error')).toHaveClass(/hidden/);
    await expect(page.locator('#files-list > div > div.w-14').first()).toHaveText('TIFF');

    // Metadata detected before removal.
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Privacy metadata found', { timeout: 30000 });
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    // Remove.
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Metadata removed successfully');
    await expect(page.locator('#processing-status')).toHaveClass(/hidden/);
    await expect(page.locator('#files-list .text-xs').first()).not.toContainText('Removing');

    // Download through the existing download flow.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    expect(download.suggestedFilename()).toBe('privacy-photo-clean.tiff');
    const saved = join(workDir, 'downloaded-clean.tiff');
    await download.saveAs(saved);
    testInfo.attach('cleaned-tiff', { path: saved, contentType: 'image/tiff' });

    const downloaded = readFileSync(saved);
    expect(downloaded.length).toBeGreaterThan(8);
    // Real TIFF magic (II/MM + version 42), not a renamed other format.
    const isTiff =
      (downloaded[0] === 0x49 && downloaded[1] === 0x49 && downloaded[2] === 42 && downloaded[3] === 0) ||
      (downloaded[0] === 0x4d && downloaded[1] === 0x4d && downloaded[2] === 0 && downloaded[3] === 42);
    expect(isTiff).toBe(true);

    await verifyCleanTiff(saved);

    // Metadata was detected before removal, so that is what got stripped.
    const before = await exifr.parse(Buffer.from(fixtureBytes), PARSE_OPTIONS);
    expect(before?.Make).toBe('PRIVACY-TEST-CAMERA');
    expect(typeof before?.latitude).toBe('number');
  });

  test('.tif extension is accepted and processed', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles(tifPath);
    await expect(page.locator('#upload-error')).toHaveClass(/hidden/);
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Privacy metadata found', { timeout: 30000 });

    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    expect(download.suggestedFilename()).toBe('privacy-photo2-clean.tiff');
    const saved = join(workDir, 'downloaded-clean-tif-ext.tiff');
    await download.saveAs(saved);
    await verifyCleanTiff(saved);
  });

  test('batch: TIFF next to a JPEG, and a broken TIFF does not block them', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles([tiffPath, jpegPath, brokenTiffPath]);
    await expect(page.locator('#files-list > div')).toHaveCount(3, { timeout: 30000 });

    // Two files declare privacy metadata; the broken TIFF fails on its own.
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Privacy metadata found', { timeout: 30000 });
    await page.locator('#remove-all-btn').click();

    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('#remove-2')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('#remove-3')).toHaveText('Try again', { timeout: 30000 });
    await expect(page.locator('#files-list > div[data-id="3"] .text-xs')).toContainText('Failed to remove metadata');
    await expect(page.locator('#processing-status')).toHaveClass(/hidden/);

    // The failed TIFF has no usable download, the others do.
    await expect(page.locator('#download-3')).toBeDisabled();
    await expect(page.locator('#download-1')).toBeEnabled();
    await expect(page.locator('#download-2')).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    const saved = join(workDir, 'batch-clean.tiff');
    await download.saveAs(saved);
    await verifyCleanTiff(saved);
  });

  test('responsive: TIFF upload/remove/download stays usable at all six viewports', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://localhost:4321/en');
      await ensureReady(page);

      await page.locator('#file-input').setInputFiles(tiffPath);
      await expect(page.locator('#files-list > div').first()).toBeVisible({ timeout: 30000 });
      await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

      await page.locator('#remove-1').click();
      await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });

      const downloadBtn = page.locator('#download-1');
      await expect(downloadBtn).toBeEnabled();
      await expect(downloadBtn).toBeInViewport();

      // No horizontal page overflow introduced by the TIFF item.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${viewport.label} (${viewport.width}x${viewport.height}) overflows horizontally`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  });
});