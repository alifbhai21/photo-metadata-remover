/**
 * JPEG EXIF-container detection (regression).
 *
 * The blind spot this spec pins down:
 *   `addJpegSegmentMetadata()` only reported an unreadable EXIF block when
 *   `Object.keys(metadata).length === 0`, i.e. when exifr returned *nothing at
 *   all*. Every JPEG carries JFIF, so that condition essentially never held: a
 *   JPEG whose APP1 block is present but which exifr cannot decode (empty IFD,
 *   corrupt entry count - exifr then returns only an `errors` entry) was
 *   reported as "No privacy metadata found", even though the block physically
 *   exists and `stripJpegPrivacySegments()` deletes it. Scan and strip disagreed.
 *
 * What is proven here, always through the real scan path:
 *   A  - EXIF APP1 present, zero parseable tags  -> NOT clean; one container finding
 *   A2 - corrupt IFD entry count                  -> same
 *   B  - the same, next to an ICC profile         -> still NOT clean (ICC is not EXIF)
 *   C  - normal EXIF                              -> real tags, and NO duplicate row
 *   D  - JFIF-only, no EXIF                       -> still clean (no false positive)
 *   E  - removal of the edge case                 -> verified, clean bytes, EXIF gone
 *
 * Run with the dev server up: npx playwright test test-jpeg-exif-container-detection.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 15000 });
}

/** Wrap a payload in a JPEG marker segment (2-byte big-endian length). */
function segment(marker: number, payload: Buffer): Buffer {
  const out = Buffer.alloc(payload.length + 4);
  out[0] = 0xff;
  out[1] = marker;
  out.writeUInt16BE(payload.length + 2, 2);
  payload.copy(out, 4);
  return out;
}

/** Every JPEG segment of `source` except the ones named in `drop`. */
function segmentsExcept(source: Buffer, drop: number[]): Buffer[] {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let i = 2;
  while (i < source.length - 1) {
    if (source[i] !== 0xff) break;
    const marker = source[i + 1];
    if (marker === 0xda) {
      parts.push(source.subarray(i));
      break;
    }
    const length = source.readUInt16BE(i + 2);
    if (!drop.includes(marker)) parts.push(source.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return parts;
}

/** APP2 (ICC_PROFILE) payload of a fixture, or null. */
function app2Payload(source: Buffer): Buffer | null {
  let i = 2;
  while (i < source.length - 1) {
    if (source[i] !== 0xff) break;
    const marker = source[i + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = source.readUInt16BE(i + 2);
    if (marker === 0xe2) return source.subarray(i + 4, i + 2 + length);
    i += 2 + length;
  }
  return null;
}

const EXIF_JPEG = readFileSync('test-exif.jpg');
const ICC_JPEG = readFileSync('test-original.jpg');

/** test-exif.jpg: APP1 "Exif\0\0" payload, split into identifier + TIFF block. */
const exifApp1Payload = EXIF_JPEG.subarray(2 + 4, 2 + 2 + 129);
const EXIF_IDENTIFIER = Buffer.from('Exif\u0000\u0000', 'latin1');
const baseTiff = exifApp1Payload.subarray(6);

/** An APP1 EXIF segment whose IFD0 advertises `entryCount` entries. */
function exifSegmentWithEntryCount(entryCount: number): Buffer {
  const tiff = Buffer.from(baseTiff);
  // IFD0 entry count sits at offset 8 of the TIFF header.
  tiff.writeUInt16LE(entryCount, 8);
  return segment(0xe1, Buffer.concat([EXIF_IDENTIFIER, tiff]));
}

/** The same JPEG body as test-exif.jpg, with a caller-chosen leading segment. */
function buildJpeg(...leading: Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...leading,
    ...segmentsExcept(EXIF_JPEG, [0xe1]).slice(1),
  ]);
}

async function upload(page: Page, buffer: Buffer): Promise<void> {
  await page.goto('http://localhost:4321/en');
  await ensureReady(page);
  await page.locator('#file-input').setInputFiles({
    name: 'photo_metadata_test_with_exif.jpg',
    mimeType: 'image/jpeg',
    buffer,
  });
  await expect(page.locator('#remove-1')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1200);
}

/** Labelled rows of the per-file metadata viewer with their privacy highlight. */
async function viewerRows(page: Page): Promise<Array<{ label: string; value: string; privacy: boolean }>> {
  return page.$$eval('#metadata-panel-1 > div > div', (rows) =>
    rows.map((row) => ({
      label: (row.children[0] as HTMLElement | undefined)?.textContent?.trim() ?? '',
      value: (row.children[1] as HTMLElement | undefined)?.textContent?.trim() ?? '',
      privacy: row.className.includes('bg-warning-bg'),
    })),
  );
}
test.describe('JPEG EXIF container detection', () => {
  test('A - EXIF APP1 with zero parseable tags is reported, not called clean', async ({ page }) => {
    const jpeg = buildJpeg(exifSegmentWithEntryCount(0));
    // The container is physically present...
    expect(jpeg.includes(EXIF_IDENTIFIER)).toBe(true);

    await upload(page, jpeg);

    const status = (await page.locator('[data-id="1"] .text-xs').textContent()) ?? '';
    expect(status).not.toContain('No privacy metadata found');
    expect(status).toContain('Privacy metadata found (1)');

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible();
    const flagged = (await viewerRows(page)).filter((row) => row.privacy);
    expect(flagged.map((row) => row.label)).toEqual(['JPEG EXIF']);
    // The container is the finding - no individual tag may be invented.
    expect(flagged[0].value).toContain('no readable EXIF tags');
  });

  test('A2 - a corrupt IFD entry count is detected the same way', async ({ page }) => {
    await upload(page, buildJpeg(exifSegmentWithEntryCount(9999)));
    const status = (await page.locator('[data-id="1"] .text-xs').textContent()) ?? '';
    expect(status).toContain('Privacy metadata found (1)');
    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible();
    expect((await viewerRows(page)).filter((r) => r.privacy).map((r) => r.label)).toEqual(['JPEG EXIF']);
  });

  test('B - ICC beside an unreadable EXIF block still reports the EXIF', async ({ page }) => {
    const icc = app2Payload(ICC_JPEG);
    expect(icc, 'fixture must carry an ICC profile').not.toBeNull();
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      exifSegmentWithEntryCount(9999),
      segment(0xe2, icc as Buffer),
      ...segmentsExcept(ICC_JPEG, [0xe1]).slice(1),
    ]);
    await upload(page, jpeg);
    const status = (await page.locator('[data-id="1"] .text-xs').textContent()) ?? '';
    expect(status).not.toContain('No privacy metadata found');
    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible();
    expect((await viewerRows(page)).filter((r) => r.privacy).map((r) => r.label)).toEqual(['JPEG EXIF']);
  });

  test('C - a normal EXIF JPEG reports its real tags and gains no duplicate row', async ({ page }) => {
    await upload(page, EXIF_JPEG);
    const status = (await page.locator('[data-id="1"] .text-xs').textContent()) ?? '';
    expect(status).toContain('Privacy metadata found');

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible();
    const flagged = (await viewerRows(page)).filter((row) => row.privacy).map((row) => row.label);
    expect(flagged).toContain('Make');
    expect(flagged).toContain('Model');
    // exifr owns the EXIF fields here, so no container row may be added.
    expect(flagged).not.toContain('JPEG EXIF');
  });

  test('D - a JFIF-only JPEG is still reported as free of privacy metadata', async ({ page }) => {
    const jpeg = buildJpeg();
    expect(jpeg.includes(EXIF_IDENTIFIER)).toBe(false);

    await upload(page, jpeg);
    const status = (await page.locator('[data-id="1"] .text-xs').textContent()) ?? '';
    expect(status).toContain('No privacy metadata found');

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible();
    const rows = await viewerRows(page);
    expect(rows.filter((row) => row.privacy)).toEqual([]);
    expect(rows.some((row) => row.label === 'JPEG EXIF')).toBe(false);
    // The JFIF technical fields are still surfaced, and still not privacy.
    expect(rows.map((row) => row.label)).toEqual(
      expect.arrayContaining(['JFIFVersion', 'XResolution', 'YResolution', 'ResolutionUnit']),
    );
  });

  test('E - the edge case removes and verifies: the download carries no EXIF', async ({ page }, testInfo) => {
    await upload(page, buildJpeg(exifSegmentWithEntryCount(0)));

    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata remaining: 0');
    await expect(page.locator('#download-1')).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    const saved = testInfo.outputPath('cleaned-exif-container.jpg');
    await download.saveAs(saved);
    const cleaned = readFileSync(saved);
    expect(cleaned.includes(EXIF_IDENTIFIER)).toBe(false);
    expect(cleaned.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
  });
});