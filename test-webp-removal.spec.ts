/**
 * WebP metadata removal (P0 fix) — UI coverage.
 *
 * The audit finding this spec pins down:
 *   A WebP EXIF chunk usually carries its TIFF/EXIF block behind the 6-byte
 *   "Exif\0\0" identifier. The old parser fed the raw chunk to the TIFF parser,
 *   which rejected it, so the UI reported "no metadata" and the file then took
 *   the canvas re-encode path — which can only emit JPEG. Result: a WebP
 *   upload was auto-"cleaned" into a JPEG.
 *
 * Proven through the real UI:
 *   - both EXIF layouts are detected ("Exif\0\0"-prefixed and bare TIFF header,
 *     plus a big-endian "MM\0*" payload)
 *   - removal produces a download that is still a .webp, with the EXIF/XMP RIFF
 *     chunks physically gone, unchanged dimensions, alpha preserved, ICC
 *     preserved byte-for-byte and byte-identical pixels (no re-encode)
 *   - a WebP works next to another format in one batch
 *   - a malformed WebP fails, resolves, and never sticks the UI in a
 *     processing state
 *   - the controls stay usable at all six target viewports
 *
 * Run with the dev server up: npx playwright test test-webp-removal.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
// @ts-expect-error - plain ESM fixture builder shared with the Node harness
import {
  buildPrefixedExifWebp,
  buildBareExifWebp,
  buildBigEndianExifWebp,
  buildExifAndXmpWebp,
  buildMalformedWebp,
  readChunks,
  chunkIds,
  readVp8x,
  looksLikeJpeg,
  leakedPrivacyValues,
  parseWebpMetadata,
  PRIVACY_VALUES,
} from './test-webp-fixture.mjs';

const PARSE_OPTIONS = { tiff: true, exif: true, gps: true, xmp: true };

/** Privacy keys a clean WebP must never expose. */
const FORBIDDEN_KEYS = ['Make', 'Model', 'Software', 'Artist', 'Copyright', 'xmpmeta'];

const VIEWPORTS = [
  { width: 375, height: 667, label: 'mobile-small' },
  { width: 390, height: 844, label: 'mobile-large' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 820, height: 1180, label: 'tablet-large' },
  { width: 1280, height: 800, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
];

const SIZE = { width: 120, height: 80 };

let workDir = '';
let prefixedPath = ''; // "Exif\0\0" + TIFF, alpha + ICC (the audit case)
let barePath = ''; // bare TIFF header, no identifier
let bigEndianPath = ''; // "Exif\0\0" + "MM\0*"
let xmpPath = ''; // EXIF + a separate XMP chunk
let malformedPath = '';
let jpegPath = '';

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'pmr-webp-'));

  prefixedPath = join(workDir, 'privacy-photo.webp');
  writeFileSync(prefixedPath, await buildPrefixedExifWebp({ ...SIZE, alpha: true, icc: true }));

  writeFileSync((barePath = join(workDir, 'bare-exif.webp')), await buildBareExifWebp(SIZE));
  writeFileSync((bigEndianPath = join(workDir, 'big-endian-exif.webp')), await buildBigEndianExifWebp(SIZE));
  writeFileSync((xmpPath = join(workDir, 'exif-xmp.webp')), await buildExifAndXmpWebp(SIZE));
  writeFileSync((malformedPath = join(workDir, 'broken.webp')), buildMalformedWebp());
  writeFileSync(
    (jpegPath = join(workDir, 'batch-photo.jpg')),
    await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 20, b: 20 } } })
      .jpeg({ quality: 88 })
      .withExifMerge({ IFD0: { Make: 'BATCH-JPEG-MAKE', Model: 'BATCH-JPEG-MODEL' } })
      .toBuffer(),
  );
});

test.afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

/**
 * Inspect the downloaded file itself — never the UI's claim about it.
 * Container, chunks, VP8X flags, pixels, alpha and ICC are all re-derived here
 * from the raw bytes, independently of application code.
 */
async function verifyCleanWebp(downloaded: string, source: string): Promise<void> {
  const bytes = readFileSync(downloaded);

  // Still a WebP, still the right extension, definitely not a JPEG.
  expect(downloaded.endsWith('.webp'), 'download did not keep the .webp extension').toBe(true);
  expect(chunkIds(bytes).length, 'download is not a RIFF/WEBP container').toBeGreaterThan(0);
  expect(looksLikeJpeg(bytes), 'download was re-encoded to JPEG').toBe(false);

  // The RIFF size field must agree with the real file length.
  expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);

  // Image payload survives; every metadata chunk is physically gone.
  const ids = chunkIds(bytes);
  expect(ids.some((id) => id === 'VP8 ' || id === 'VP8L'), 'image payload chunk missing').toBe(true);
  expect(ids.filter((id) => id === 'EXIF'), 'EXIF chunk still present').toEqual([]);
  expect(ids.filter((id) => id === 'XMP '), 'XMP chunk still present').toEqual([]);
  expect(readChunks(bytes).length).toBe(ids.length);

  // No planted privacy payload left anywhere in the bytes.
  const leaked = leakedPrivacyValues(bytes);
  expect(leaked, `privacy payload bytes still present: ${leaked.join(', ')}`).toEqual([]);
  expect(
    bytes.toString('latin1').includes('Exif\u0000\u0000'),
    'EXIF identifier bytes still present',
  ).toBe(false);

  // VP8X must no longer advertise the removed chunks, and must keep the canvas
  // size plus the ICC/alpha feature flags.
  const vp8x = readVp8x(bytes);
  expect(vp8x, 'VP8X chunk disappeared').not.toBeNull();
  expect(vp8x.exif, 'VP8X still advertises EXIF').toBe(false);
  expect(vp8x.xmp, 'VP8X still advertises XMP').toBe(false);
  expect(vp8x.width).toBe(SIZE.width);
  expect(vp8x.height).toBe(SIZE.height);

  // Independent metadata re-scan of the downloaded container: exifr cannot read
  // a WebP file itself, so the EXIF/XMP chunk payloads are extracted first.
  const parsed = await parseWebpMetadata(bytes, PARSE_OPTIONS);
  const keys = Object.keys(parsed || {});
  const privacyKeys = keys.filter((key) => FORBIDDEN_KEYS.includes(key) || key === 'xmpmeta');
  expect(privacyKeys, `privacy keys still parseable: ${privacyKeys.join(', ')}`).toEqual([]);
  expect(keys, 'downloaded WebP still exposes metadata').toEqual([]);

  // Dimensions, alpha, ICC and pixels survive the container rewrite.
  const sourceMeta = await sharp(readFileSync(source)).metadata();
  const outputMeta = await sharp(bytes).metadata();
  expect(outputMeta.format).toBe('webp');
  expect(outputMeta.width).toBe(sourceMeta.width);
  expect(outputMeta.height).toBe(sourceMeta.height);
  expect(!!outputMeta.hasAlpha).toBe(!!sourceMeta.hasAlpha);

  if (sourceMeta.icc) {
    expect(outputMeta.icc, 'ICC profile was dropped').toBeTruthy();
    expect(Buffer.compare(Buffer.from(outputMeta.icc), Buffer.from(sourceMeta.icc))).toBe(0);
  }

  // No re-encode: the decoded pixels are byte-identical.
  const before = await sharp(readFileSync(source)).raw().toBuffer();
  const after = await sharp(bytes).raw().toBuffer();
  expect(Buffer.compare(before, after)).toBe(0);
}

test.describe('WebP metadata removal', () => {
  test('prefixed EXIF is detected, removed, and the download is a clean WebP', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles(prefixedPath);
    await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });
    await expect(page.locator('#upload-error')).toHaveClass(/hidden/);

    // Scan step: the "Exif\0\0"-prefixed payload is detected (before the fix
    // this row said "No metadata" and the file was silently re-encoded).
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata found', {
      timeout: 30000,
    });
    await expect(page.locator('#meta-toggle-1')).toHaveText('Show image metadata');

    // Show metadata: the planted values are on screen.
    await page.locator('#meta-toggle-1').click();
    const panel = page.locator('#metadata-panel-1');
    await expect(panel).toContainText('Make');
    await expect(panel).toContainText(PRIVACY_VALUES[0]);
    await expect(panel).toContainText(PRIVACY_VALUES[1]);

    // Remove the metadata.
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata remaining');
    await expect(page.locator('#processing-status')).toHaveClass(/hidden/);

    // Download the clean file.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    expect(download.suggestedFilename()).toBe('privacy-photo-clean.webp');
    const saved = join(workDir, 'downloaded-clean.webp');
    await download.saveAs(saved);

    // Inspect the actual file, not the UI's claim.
    await verifyCleanWebp(saved, prefixedPath);

    // Re-scan the download through the UI.
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    await page.locator('#file-input').setInputFiles(saved);
    await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });
    await expect(page.locator('#meta-toggle-1')).toHaveText('No metadata found', { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs:has-text("Privacy metadata found")')).toHaveCount(0);
  });

  for (const layout of [
    { label: 'bare TIFF header (no Exif\\0\\0 identifier)', path: () => barePath },
    { label: 'big-endian "MM\\0*" EXIF payload', path: () => bigEndianPath },
  ]) {
    test(`${layout.label} is detected and removed`, async ({ page }) => {
      await page.goto('http://localhost:4321/en');
      await ensureReady(page);

      await page.locator('#file-input').setInputFiles(layout.path());
      await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });
      await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata found', {
        timeout: 30000,
      });

      await page.locator('#remove-1').click();
      await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#download-1').click(),
      ]);
      const saved = join(workDir, `downloaded-${layout.path() === barePath ? 'bare' : 'big-endian'}.webp`);
      await download.saveAs(saved);
      expect(download.suggestedFilename()).toMatch(/-clean\.webp$/);

      await verifyCleanWebp(saved, layout.path());
    });
  }

  test('EXIF and XMP chunks are both removed, output stays WebP', async ({ page }) => {
    // The fixture really does carry both chunk kinds before removal.
    expect(chunkIds(readFileSync(xmpPath))).toEqual(expect.arrayContaining(['EXIF', 'XMP ']));

    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    await page.locator('#file-input').setInputFiles(xmpPath);
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata found', {
      timeout: 30000,
    });

    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    const saved = join(workDir, 'downloaded-exif-xmp.webp');
    await download.saveAs(saved);

    const bytes = readFileSync(saved);
    expect(chunkIds(bytes)).not.toContain('XMP ');
    expect(chunkIds(bytes)).not.toContain('EXIF');
    expect(readVp8x(bytes)!.xmp).toBe(false);
    await verifyCleanWebp(saved, xmpPath);
  });

  test('batch: WebP next to a JPEG keeps both formats', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles([prefixedPath, jpegPath]);
    await expect(page.locator('#files-list > div[data-id]')).toHaveCount(2, { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata found', {
      timeout: 30000,
    });
    await expect(page.locator('[data-id="2"] .text-xs')).toContainText('Privacy metadata found', {
      timeout: 30000,
    });

    await page.locator('#remove-all-btn').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('#remove-2')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('#processing-status')).toHaveClass(/hidden/);

    const [webpDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    expect(webpDownload.suggestedFilename()).toBe('privacy-photo-clean.webp');
    const webpSaved = join(workDir, 'batch-clean.webp');
    await webpDownload.saveAs(webpSaved);
    await verifyCleanWebp(webpSaved, prefixedPath);

    const [jpegDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-2').click(),
    ]);
    expect(jpegDownload.suggestedFilename()).toBe('batch-photo-clean.jpg');
    const jpegSaved = join(workDir, 'batch-clean.jpg');
    await jpegDownload.saveAs(jpegSaved);
    const jpegBytes = readFileSync(jpegSaved);
    expect(jpegBytes[0]).toBe(0xff);
    expect(jpegBytes[1]).toBe(0xd8);
  });

  test('malformed WebP fails cleanly and never sticks the UI in processing', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles([malformedPath, prefixedPath]);
    await expect(page.locator('#files-list > div[data-id]')).toHaveCount(2, { timeout: 30000 });

    // The corrupt file resolves to a retryable error state...
    await expect(page.locator('#remove-1')).toHaveText('Try again', { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Failed to remove metadata');
    await expect(page.locator('#download-1')).toBeDisabled();
    // ...and the batch is not left processing.
    await expect(page.locator('#processing-status')).toHaveClass(/hidden/);

    // The valid WebP in the same batch is unaffected.
    await expect(page.locator('[data-id="2"] .text-xs')).toContainText('Privacy metadata found', {
      timeout: 30000,
    });
    await page.locator('#remove-all-btn').click();
    await expect(page.locator('#remove-2')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('#remove-1')).toHaveText('Try again');

    // Retrying the corrupt file resolves again instead of hanging.
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('Try again', { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Failed to remove metadata');
    await expect(page.locator('#processing-status')).toHaveClass(/hidden/);
    await expect(page.locator('#download-2')).toBeEnabled();
  });

  test('responsive: WebP upload/remove/download stays usable at all six viewports', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://localhost:4321/en');
      await ensureReady(page);

      await page.locator('#file-input').setInputFiles(prefixedPath);
      await expect(page.locator('#files-list > div[data-id]').first()).toBeVisible({ timeout: 30000 });
      await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

      await page.locator('#remove-1').click();
      await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });

      const downloadBtn = page.locator('#download-1');
      await expect(downloadBtn).toBeEnabled();
      await expect(downloadBtn).toBeInViewport();

      // No horizontal page overflow introduced by the WebP item.
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