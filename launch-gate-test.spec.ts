import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

// Launch-gate CI tests for the photo-metadata-remover tool.
//
// These assert the product's core privacy promise ("the cleaned file is
// metadata-free") at the byte level, plus the FR-1 upload validation
// guarantees (type + 40 MB size cap with localized errors) and the batch ZIP
// deliverable. They run in CI against the dev server (baseURL per playwright.config).

const BASE = 'http://localhost:4321/en';
const RICH_IMAGE = 'metadata-rich-test-image-2.jpg';
const SECOND_IMAGE = 'test-exif.jpg';

// JPEG markers that must never survive cleaning:
//   0xE1 = APP1 (EXIF + XMP), 0xED = APP13 (IPTC/Photoshop), 0xFE = COM comment.
const FORBIDDEN_JPEG_MARKERS = [0xe1, 0xed, 0xfe];

// Walks the JPEG segment table (SOI -> segments w/ length -> SOS/EOI) and
// returns the segment marker bytes actually present in the file. Marker-level
// scanning (as opposed to a raw byte scan) avoids false positives from entropy
// data, because a 0xFF byte inside scan data must be followed by 0x00.
function jpegMarkers(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return markers; // not a JPEG
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    let m = bytes[i + 1];
    // Marker fill bytes (0xFF 0xFF ...) are permitted between markers.
    while (m === 0xff && i + 2 < bytes.length) {
      i++;
      m = bytes[i + 1];
    }
    if (m === 0xd9) {
      markers.push(0xd9); // EOI
      return markers;
    }
    // Standalone markers without a length payload.
    if ((m >= 0xd0 && m <= 0xd8) || m === 0x01 || m === 0x00) {
      markers.push(m);
      i += 2;
      continue;
    }
    // All other markers carry a 2-byte big-endian length (including itself).
    if (i + 3 >= bytes.length) return markers;
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return markers;
    markers.push(m);
    i += 2 + len;
  }
  return markers;
}

// Raw ASCII strings that must never appear in a cleaned file or archive.
const FORBIDDEN_STRINGS = ['Exif', 'GPS', 'IPTC', 'XMP', 'Photoshop', 'http://ns.adobe.com'];

function expectNoPrivacyContent(bytes: Uint8Array): void {
  const latin = Buffer.from(bytes).toString('latin1'); // 1:1 byte mapping
  for (const needle of FORBIDDEN_STRINGS) {
    expect(latin, `clean output must not contain "${needle}"`).not.toContain(needle);
  }
}

test.describe('Launch gate – zero-metadata guarantee (RW)', () => {
  test('cleaned JPEG has no APP1/APP13/COM segments and no privacy strings', async ({ page }) => {
    await page.goto(BASE);
    await ensureReady(page);
    await page.locator('#file-input').setInputFiles(RICH_IMAGE);

    // Metadata detected -> the per-file remove action is available.
    // 45s handles the dev-server cold start (Vite dependency re-optimization).
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 45000 });

    // Strip metadata and wait for per-file success confirmation.
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 60000 });

    // Download the cleaned file and inspect its bytes.
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-1').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('metadata-rich-test-image-2-clean.jpg');
    const bytes = new Uint8Array(await readFile((await download.path()) as string));

    // Marker-level check: no EXIF/XMP APP1, no IPTC APP13, no comment segment.
    const forbidden = jpegMarkers(bytes).filter((m) => FORBIDDEN_JPEG_MARKERS.includes(m));
    expect(forbidden, `no forbidden JPEG markers, got: ${forbidden.map((m) => m.toString(16))}`).toEqual([]);

    // Content-level check: no privacy metadata strings anywhere in the file.
    expectNoPrivacyContent(bytes);

    console.log('PASSED: cleaned JPEG is metadata-free (segment + content level)');
  });

  test('batch ZIP downloads as one archive containing metadata-free clean images', async ({ page }) => {
    await page.goto(BASE);
    await ensureReady(page);
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles([RICH_IMAGE, SECOND_IMAGE]);

    // Batch actions appear once two files are queued.
    await expect(page.locator('#remove-all-btn')).toBeVisible({ timeout: 45000 });
    await page.locator('#remove-all-btn').click();

    // Both files succeed, then the ZIP button becomes clickable.
    await expect(page.locator('#download-all-btn')).toBeEnabled({ timeout: 90000 });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download-all-btn').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('clean-images.zip');
    const bytes = await readFile((await download.path()) as string);

    // Valid ZIP: local-file signature PK\x03\x04.
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04');

    // Both clean files are present under their -clean names in the archive.
    const latin = bytes.toString('latin1');
    expect(latin).toContain('metadata-rich-test-image-2-clean.jpg');
    expect(latin).toContain('test-exif-clean.jpg');

    // The clean JPEGs inside the archive carry no EXIF/XMP/IPTC content.
    for (const needle of ['Exif', 'Photoshop 3.0', 'http://ns.adobe.com', 'IPTC']) {
      expect(latin, `ZIP must not contain "${needle}"`).not.toContain(needle);
    }

    console.log('PASSED: batch ZIP is valid and contains only metadata-free clean images');
  });
});

test.describe('Launch gate – FR-1 upload validation (RW)', () => {
  test('unsupported file types are rejected with a localized error and never enter the pipeline', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not a photo'),
    });

    const error = page.locator('#upload-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('Unsupported file type');
    await expect(error).toContainText('notes.txt');

    // Nothing was accepted: no results panel, no rows, no ZIP/download state.
    await expect(page.locator('#results-panel')).toBeHidden();
    await expect(page.locator('#download-all-btn')).toBeHidden();
    console.log('PASSED: unsupported type rejected with localized error');
  });

  test('files over the 40 MB cap are rejected with a localized error and never enter the pipeline', async ({ page }) => {
    await page.goto(BASE);
    const oversized = Buffer.alloc(40 * 1024 * 1024 + 1, 0xff);
    await page.locator('#file-input').setInputFiles({
      name: 'huge.jpg',
      mimeType: 'image/jpeg',
      buffer: oversized,
    });

    const error = page.locator('#upload-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('huge.jpg is too large');
    await expect(error).toContainText('(max');

    await expect(page.locator('#results-panel')).toBeHidden();
    console.log('PASSED: oversized file rejected with localized error');
  });
});