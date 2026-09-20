/**
 * PNG structural metadata removal (P0 fix) — UI coverage.
 *
 * The defect this spec pins down:
 *   PNG uploads used to fall through to the generic canvas path
 *   (createImageBitmap → canvas → canvas.toBlob('image/png')). That re-encode
 *   drops the ICC profile (iCCP), pHYs/gAMA/cHRM/sRGB/sBIT/bKGD and palette
 *   data, can change bit depth/colour type and rewrites RGB values under
 *   fully transparent pixels — real data loss in a tool whose whole point is
 *   to change nothing but the metadata. The old verifier matched: it only
 *   knew about the eXIf chunk, so tEXt/zTXt/iTXt/tIME were never checked.
 *
 * Proven through the real UI (upload → scan → remove → verify → download,
 * with byte-level inspection of the actual downloaded file):
 *   - RGB / RGBA / palette / 16-bit / transparency PNGs with eXIf
 *   - tEXt + zTXt + iTXt + tIME textual metadata
 *   - ICC profile preserved byte-for-byte
 *   - IDAT image data byte-identical (no canvas re-encode)
 *   - a malformed PNG fails, resolves, and never sticks the UI in processing
 *   - a PNG works next to a JPEG in one batch
 *   - the controls stay usable at all six target viewports
 *
 * Run with the dev server up: npx playwright test test-png-removal.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
// @ts-expect-error - plain ESM fixture builder shared with the Node harness
import {
  buildRgbExifPng, buildRgbaExifPng, buildIccPng, buildTextualPng,
  buildPalettePng, buildTrnsPng, build16BitPng, buildPlainPng,
  buildMalformedPng, buildUnknownChunkPng, buildSingleChunkPng,
  buildUnverifiableXmpPng,
  readPngChunks, pngChunkTypes, findPngChunk, readIhdr, rawChunkBytes,
  idatBytes, leakedPrivacyValues, parsePngMetadata, PNG_PRIVACY_CHUNKS,
  PNG_SIGNATURE, PRIVACY_VALUES, XMP_PAYLOAD_SIGNATURE, XMP_PRIVACY_TEXT,
} from './test-png-fixture.mjs';

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
let rgbExifPath = '';
let rgbaExifPath = '';
let iccPath = '';
let textualPath = '';
let palettePath = '';
let sixteenBitPath = '';
let plainPath = '';
let malformedPath = '';
let unknownPath = '';
let jpegPath = '';
let trnsPath = '';
let textOnlyPaths: Record<string, string> = {};
let unverifiablePath = '';

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'pmr-png-'));

  writeFileSync((rgbExifPath = join(workDir, 'rgb-exif.png')), await buildRgbExifPng(SIZE));
  writeFileSync((rgbaExifPath = join(workDir, 'rgba-exif.png')), await buildRgbaExifPng(SIZE));
  writeFileSync((iccPath = join(workDir, 'icc.png')), await buildIccPng(SIZE));
  writeFileSync((textualPath = join(workDir, 'textual.png')), await buildTextualPng(SIZE));
  writeFileSync((palettePath = join(workDir, 'palette.png')), await buildPalettePng(SIZE));
  writeFileSync((sixteenBitPath = join(workDir, 'sixteen-bit.png')), await build16BitPng());
  writeFileSync((plainPath = join(workDir, 'plain.png')), await buildPlainPng(SIZE));
  writeFileSync((malformedPath = join(workDir, 'broken.png')), buildMalformedPng());
  writeFileSync((unknownPath = join(workDir, 'unknown-chunk.png')), await buildUnknownChunkPng(SIZE));
  writeFileSync((trnsPath = join(workDir, 'trns.png')), await buildTrnsPng(SIZE));
  writeFileSync(
    (unverifiablePath = join(workDir, 'payload-in-unknown-chunk.png')),
    await buildUnverifiableXmpPng(SIZE),
  );
  textOnlyPaths = {};
  for (const chunkType of ['tEXt', 'zTXt', 'iTXt', 'tIME']) {
    const path = join(workDir, `only-${chunkType}.png`);
    writeFileSync(path, await buildSingleChunkPng(chunkType, SIZE));
    textOnlyPaths[chunkType] = path;
  }
  writeFileSync(
    (jpegPath = join(workDir, 'batch-photo.jpg')),
    await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 20, b: 20 } } })
      .jpeg({ quality: 88 })
      .withExifMerge({ IFD0: { Make: 'BATCH-JPEG-MAKE', Model: 'BATCH-JPEG-MODEL' } })
      .toBuffer(),
  );
});

test.afterAll(() => {
  if (workDir) {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

/** Upload a file, wait for its scan state, remove, wait for verified success, download. */
async function uploadRemoveDownload(
  page: Page,
  filePath: string,
  savedName: string,
): Promise<{ saved: string; suggested: string }> {
  await page.goto('http://localhost:4321/en');
  await ensureReady(page);

  await page.locator('#file-input').setInputFiles(filePath);
  await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });

  await page.locator('#remove-1').click();

  // Verification must run before the download control becomes usable.
  await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
  const downloadBtn = page.locator('#download-1');
  await expect(downloadBtn).toBeEnabled();

  const [download] = await Promise.all([page.waitForEvent('download'), downloadBtn.click()]);
  const saved = join(workDir, savedName);
  await download.saveAs(saved);
  return { saved, suggested: download.suggestedFilename() };
}

/**
 * Byte-level assertions on a downloaded clean PNG, made with the fixture
 * module's independent chunk walker (never with the application code).
 */
async function verifyCleanPng(downloaded: string, source: string): Promise<void> {
  const bytes = readFileSync(downloaded);

  // Still a PNG, still the right extension, definitely not a JPEG.
  expect(downloaded.endsWith('.png'), 'download did not keep the .png extension').toBe(true);
  expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE), 'download is not a PNG (bad signature)').toBe(true);
  expect(bytes[0] === 0xff && bytes[1] === 0xd8, 'download was re-encoded to JPEG').toBe(false);

  // Strict structural check: chunk list parses, every CRC valid.
  const chunks = readPngChunks(bytes);
  expect(chunks[0].type).toBe('IHDR');
  expect(chunks[0].size).toBe(13);
  expect(chunks[chunks.length - 1].type).toBe('IEND');

  // Privacy chunks physically gone.
  const types = pngChunkTypes(bytes);
  for (const type of PNG_PRIVACY_CHUNKS) {
    expect(types.filter((t) => t === type), `${type} chunk still present`).toEqual([]);
  }

  // No planted privacy payload left anywhere in the bytes.
  const leaked = leakedPrivacyValues(bytes);
  expect(leaked, `privacy payload bytes still present: ${leaked.join(', ')}`).toEqual([]);

  // Independent metadata re-scan of the downloaded container.
  const parsed = await parsePngMetadata(bytes);
  const privacyKeys = Object.keys(parsed).filter((key) =>
    ['Make', 'Model', 'Software', 'Artist', 'Copyright', 'texts', 'ztxt', 'time'].includes(key));
  expect(privacyKeys, `privacy keys still parseable: ${privacyKeys.join(', ')}`).toEqual([]);

  // Dimensions, bit depth and colour type untouched.
  const inIhdr = readIhdr(readFileSync(source));
  const outIhdr = readIhdr(bytes);
  expect(outIhdr.width).toBe(inIhdr.width);
  expect(outIhdr.height).toBe(inIhdr.height);
  expect(outIhdr.bitDepth).toBe(inIhdr.bitDepth);
  expect(outIhdr.colorType).toBe(inIhdr.colorType);

  // No re-encode: the IDAT image data is byte-identical.
  expect(idatBytes(bytes).equals(idatBytes(readFileSync(source))), 'IDAT was re-encoded').toBe(true);

  // The output still decodes as a PNG with the same dimensions.
  const meta = await sharp(bytes).metadata();
  expect(meta.format).toBe('png');
  expect(meta.width).toBe(inIhdr.width);
  expect(meta.height).toBe(inIhdr.height);
}

/**
 * Upload a PNG and drive it to a verified clean state along whichever path the
 * app takes: a file whose scan found privacy metadata waits for the Remove
 * control, a file with no detected EXIF field is already approved by the
 * automatic strip that runs on upload.
 */
async function uploadAndVerify(page: Page, filePath: string): Promise<void> {
  await page.goto('http://localhost:4321/en');
  await ensureReady(page);

  await page.locator('#file-input').setInputFiles(filePath);
  await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });

  const removeBtn = page.locator('#remove-1');
  // 'Removing…' resolves into one of these terminal labels.
  await expect(removeBtn).toHaveText(/Remove metadata|✓ Success|Try again/, { timeout: 30000 });
  const label = await removeBtn.textContent();
  if (label === 'Remove metadata' && (await removeBtn.isEnabled())) {
    await removeBtn.click();
  }
  await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
  await expect(page.locator('#download-1')).toBeEnabled();
}

/** Download the item's generated output and return the saved path. */
async function downloadTo(page: Page, savedName: string): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-1').click(),
  ]);
  const saved = join(workDir, savedName);
  await download.saveAs(saved);
  return saved;
}

/**
 * Record the exact bytes and media type of every Blob handed to
 * `URL.createObjectURL` — that is the blob the browser is asked to save — so
 * the downloaded file can be compared with the blob the app verified.
 */
async function installBlobCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pmrDownloadBlobs?: Array<{ type: string; latin1: string }> };
    w.__pmrDownloadBlobs = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource): string => {
      // Previews hand a File straight to createObjectURL; only the generated
      // output (a plain Blob) is the download payload to capture.
      if (obj instanceof Blob && !(obj instanceof File)) {
        void obj.arrayBuffer().then((buffer) => {
          const bytes = new Uint8Array(buffer);
          let latin1 = '';
          const CHUNK = 0x2000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            latin1 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          w.__pmrDownloadBlobs!.push({ type: obj.type, latin1 });
        }).catch(() => undefined);
      }
      return original(obj as Blob);
    };
  });
}

/**
 * Delay the resolution of the first generated-output byte read by `ms`. The
 * app still reads and re-scans the same bytes; the 'Removing…'/'Verifying
 * clean output…' window simply stays observable long enough to assert on, which
 * is also what proves the download control stays disabled until verification
 * has actually finished.
 */
async function installVerificationDelay(page: Page, ms: number): Promise<void> {
  await page.addInitScript((delayMs: number) => {
    const w = window as unknown as { __pmrDelayUsed?: boolean };
    w.__pmrDelayUsed = false;
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
      return original.call(this).then(async (buf: ArrayBuffer) => {
        if (this instanceof File || w.__pmrDelayUsed) return buf;
        w.__pmrDelayUsed = true;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return buf;
      });
    };
  }, ms);
}

test.describe('PNG metadata removal', () => {
  test('RGB PNG + EXIF: detected, removed, download is a clean PNG', async ({ page }) => {
    const { saved, suggested } = await uploadRemoveDownload(page, rgbExifPath, 'clean-rgb.png');
    expect(suggested).toBe('rgb-exif-clean.png');
    await verifyCleanPng(saved, rgbExifPath);
  });

  test('RGBA PNG + EXIF: detected, removed, download is a clean PNG', async ({ page }) => {
    const { saved, suggested } = await uploadRemoveDownload(page, rgbaExifPath, 'clean-rgba.png');
    expect(suggested).toBe('rgba-exif-clean.png');
    await verifyCleanPng(saved, rgbaExifPath);
  });

  test('ICC profile (iCCP) is preserved byte-for-byte while eXIf is removed', async ({ page }) => {
    // The fixture really does carry iCCP + eXIf before removal.
    expect(pngChunkTypes(readFileSync(iccPath))).toEqual(expect.arrayContaining(['iCCP', 'eXIf']));

    const { saved } = await uploadRemoveDownload(page, iccPath, 'clean-icc.png');
    await verifyCleanPng(saved, iccPath);

    const outIccp = rawChunkBytes(readFileSync(saved), 'iCCP');
    const inIccp = rawChunkBytes(readFileSync(iccPath), 'iCCP');
    expect(outIccp.length).toBe(1);
    expect(outIccp[0].equals(inIccp[0]), 'ICC profile bytes changed').toBe(true);

    const outMeta = await sharp(readFileSync(saved)).metadata();
    expect(outMeta.icc, 'ICC profile missing from the download').toBeTruthy();
  });

  test('tEXt, zTXt, iTXt and tIME are all detected as privacy chunks and removed', async ({ page }) => {
    expect(pngChunkTypes(readFileSync(textualPath))).toEqual(
      expect.arrayContaining(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']),
    );

    const { saved } = await uploadRemoveDownload(page, textualPath, 'clean-textual.png');
    await verifyCleanPng(saved, textualPath);

    const types = pngChunkTypes(readFileSync(saved));
    for (const type of ['tEXt', 'zTXt', 'iTXt', 'tIME']) {
      expect(types).not.toContain(type);
    }
  });


  test('palette PNG keeps PLTE and indexed colour type', async ({ page }) => {
    expect(pngChunkTypes(readFileSync(palettePath))).toContain('PLTE');

    const { saved } = await uploadRemoveDownload(page, palettePath, 'clean-palette.png');
    await verifyCleanPng(saved, palettePath);

    expect(rawChunkBytes(readFileSync(saved), 'PLTE')[0].equals(rawChunkBytes(readFileSync(palettePath), 'PLTE')[0]),
      'PLTE chunk bytes changed').toBe(true);
    expect(readIhdr(readFileSync(saved)).colorType).toBe(3);
  });

  test('16-bit PNG keeps its bit depth and image data', async ({ page }) => {
    const { saved } = await uploadRemoveDownload(page, sixteenBitPath, 'clean-16bit.png');
    await verifyCleanPng(saved, sixteenBitPath);
    expect(readIhdr(readFileSync(saved)).bitDepth).toBe(16);
  });

  test('unknown ancillary chunks are preserved by default', async ({ page }) => {
    expect(pngChunkTypes(readFileSync(unknownPath))).toContain('pmTX');

    const { saved } = await uploadRemoveDownload(page, unknownPath, 'clean-unknown.png');
    await verifyCleanPng(saved, unknownPath);

    const outPm = rawChunkBytes(readFileSync(saved), 'pmTX');
    expect(outPm.length, 'unknown ancillary chunk was dropped').toBe(1);
    expect(outPm[0].equals(rawChunkBytes(readFileSync(unknownPath), 'pmTX')[0])).toBe(true);
  });

  test('PNG without metadata: removal still yields a verified, byte-clean PNG', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles(plainPath);
    await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });

    // A metadata-free PNG is auto-stripped after the scan; if it is not yet,
    // trigger the removal manually. Either way it must end verified clean.
    await expect
      .poll(async () => (await page.locator('#remove-1').textContent()) || '', { timeout: 30000 })
      .toMatch(/Remove metadata|✓ Success/);
    if ((await page.locator('#remove-1').textContent()) !== '✓ Success') {
      await page.locator('#remove-1').click();
    }
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    const saved = join(workDir, 'clean-plain.png');
    await download.saveAs(saved);

    const bytes = readFileSync(saved);
    expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(pngChunkTypes(bytes).filter((t) => PNG_PRIVACY_CHUNKS.includes(t))).toEqual([]);
    expect(idatBytes(bytes).equals(idatBytes(readFileSync(plainPath)))).toBe(true);
  });

  test('malformed PNG fails cleanly and never sticks the UI in processing', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles([malformedPath, rgbExifPath]);
    await expect(page.locator('#files-list > div[data-id]')).toHaveCount(2, { timeout: 30000 });

    // The corrupt container is not auto-stripped (its scan finds technical,
    // non-privacy fields only), so it takes the manual path - and its removal
    // must resolve to a retryable error state instead of hanging in processing.
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('Try again', { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Failed to remove metadata');
    await expect(page.locator('#download-1')).toBeDisabled();
    // ...and the batch is not left processing.
    await expect(page.locator('#processing-status')).toHaveClass(/hidden/);

    // The valid PNG in the same batch is unaffected.
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

  test('batch: PNG next to a JPEG keeps both formats', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);

    await page.locator('#file-input').setInputFiles([rgbExifPath, jpegPath]);
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

    const [pngDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-1').click(),
    ]);
    expect(pngDownload.suggestedFilename()).toBe('rgb-exif-clean.png');
    const pngSaved = join(workDir, 'batch-clean.png');
    await pngDownload.saveAs(pngSaved);
    await verifyCleanPng(pngSaved, rgbExifPath);

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

  test('tRNS transparency is preserved byte-for-byte (it is image data, not metadata)', async ({ page }) => {
    const source = readFileSync(trnsPath);
    expect(pngChunkTypes(source)).toEqual(expect.arrayContaining(['PLTE', 'tRNS', 'eXIf']));

    await uploadAndVerify(page, trnsPath);
    const saved = await downloadTo(page, 'clean-trns.png');
    await verifyCleanPng(saved, trnsPath);

    const out = readFileSync(saved);
    expect(rawChunkBytes(out, 'tRNS')[0].equals(rawChunkBytes(source, 'tRNS')[0]), 'tRNS changed').toBe(true);
    expect(rawChunkBytes(out, 'PLTE')[0].equals(rawChunkBytes(source, 'PLTE')[0]), 'PLTE changed').toBe(true);
  });

  for (const chunkType of ['tEXt', 'zTXt', 'iTXt', 'tIME']) {
    test(`PNG carrying only ${chunkType}: the chunk is removed and nothing else changes`, async ({ page }) => {
      const sourcePath = textOnlyPaths[chunkType];
      const sourceTypes = pngChunkTypes(readFileSync(sourcePath));
      expect(sourceTypes).toContain(chunkType);
      expect(sourceTypes).not.toContain('eXIf');

      await uploadAndVerify(page, sourcePath);
      const saved = await downloadTo(page, `clean-only-${chunkType}.png`);
      await verifyCleanPng(saved, sourcePath);

      const savedBytes = readFileSync(saved);
      const types = pngChunkTypes(savedBytes);
      expect(types, `${chunkType} survived removal`).not.toContain(chunkType);
      expect(types).toEqual(expect.arrayContaining(['IHDR', 'IDAT', 'IEND']));
      // No planted payload of this chunk survives in the real output bytes.
      expect(savedBytes.includes(Buffer.from(XMP_PRIVACY_TEXT, 'utf8'))).toBe(false);
      expect(leakedPrivacyValues(savedBytes)).toEqual([]);
    });
  }

  test('the verified cleanBlob bytes are exactly the bytes that get downloaded', async ({ page }) => {
    await installBlobCapture(page);
    await uploadAndVerify(page, rgbExifPath);

    const saved = await downloadTo(page, 'clean-captured.png');

    const captured = await page.evaluate(
      () => (window as unknown as { __pmrDownloadBlobs: Array<{ type: string; latin1: string }> }).__pmrDownloadBlobs,
    );
    expect(captured.length, 'expected exactly one generated download blob').toBe(1);
    expect(captured[0].type).toBe('image/png');

    const downloaded = readFileSync(saved);
    const capturedBytes = Buffer.from(captured[0].latin1, 'latin1');
    expect(capturedBytes.length).toBe(downloaded.length);
    expect(capturedBytes.equals(downloaded), 'downloaded bytes differ from the verified blob').toBe(true);

    await verifyCleanPng(saved, rgbExifPath);
  });

  test('verification failure keeps the download blocked and never ships the payload', async ({ page }) => {
    const source = readFileSync(unverifiablePath);
    // The metadata payload really is in there, inside a chunk the stripper
    // preserves by default - so the generated output cannot be verified clean.
    expect(source.includes(Buffer.from(XMP_PAYLOAD_SIGNATURE, 'latin1'))).toBe(true);
    expect(pngChunkTypes(source)).toEqual(expect.arrayContaining(['eXIf', 'prVt']));

    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    await page.locator('#file-input').setInputFiles(unverifiablePath);
    await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });

    await page.locator('#remove-1').click();

    // The output was produced, but re-scanning it found the payload: the item
    // must land in the failure state instead of claiming a clean result.
    await expect(page.locator('#remove-1')).toHaveText('Try again', { timeout: 30000 });
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Verification failed');
    await expect(page.locator('#download-1')).toBeDisabled();
    await expect(page.locator('#download-all-btn')).toBeDisabled();

    // Neither download control can produce a file, even when clicked directly.
    let downloadStarted = false;
    page.on('download', () => {
      downloadStarted = true;
    });
    await page.locator('#download-1').click({ force: true }).catch(() => undefined);
    await page.locator('#download-all-btn').click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    expect(downloadStarted, 'an unverified output was downloadable').toBe(false);
  });


  test('responsive: PNG upload/remove/download stays usable at all six viewports', async ({ page }) => {
    // Keeps the processing/verification window observable at every viewport.
    await installVerificationDelay(page, 1200);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://localhost:4321/en');
      await ensureReady(page);

      await page.locator('#file-input').setInputFiles(rgbExifPath);
      await expect(page.locator('#files-list > div[data-id]').first()).toBeVisible({ timeout: 30000 });
      await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

      // Upload control is usable at this viewport.
      const uploadZone = await page.locator('#upload-zone').boundingBox();
      expect(uploadZone, `${viewport.label}: upload zone not rendered`).not.toBeNull();
      expect(uploadZone!.width).toBeGreaterThan(0);

      // Processing state is visible while the PNG is being stripped/verified,
      // and the download control stays unusable until verification finished.
      await page.locator('#remove-1').click();
      await expect(page.locator('[data-id="1"] .text-xs')).toHaveText(/Removing|Verifying/, { timeout: 30000 });
      await expect(page.locator('#download-1')).toBeDisabled();
      await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });

      const downloadBtn = page.locator('#download-1');
      await expect(downloadBtn).toBeEnabled();
      await expect(downloadBtn).toBeInViewport();
      // Verification state is visible and reports the derived count.
      await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Metadata removed successfully');

      // Touch targets stay usable: every per-file control meets the WCAG 2.5.8
      // minimum target size at all six viewports.
      const targets = await page.evaluate(() => {
        const measure = (selector: string) => {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { w: Math.round(rect.width), h: Math.round(rect.height) };
        };
        return {
          remove: measure('#remove-1'),
          download: measure('#download-1'),
          zip: measure('#download-all-btn'),
        };
      });
      for (const [name, rect] of Object.entries(targets)) {
        if (!rect) continue; // the ZIP control is hidden for a single item
        expect(rect.w, `${viewport.label}: #${name} target too narrow (${rect.w}px)`).toBeGreaterThanOrEqual(24);
        expect(rect.h, `${viewport.label}: #${name} target too short (${rect.h}px)`).toBeGreaterThanOrEqual(24);
      }

      // No horizontal page overflow introduced by the PNG item.
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

