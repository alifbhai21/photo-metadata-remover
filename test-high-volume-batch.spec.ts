/**
 * High-volume batch processing regression coverage.
 *
 * The audit finding this spec pins down:
 *   Scanning a large batch retained one complete source-file ArrayBuffer per
 *   photo. `exifr.parse(buffer, true)` returns some EXIF values
 *   (ComponentsConfiguration, UserComment, IFD1 thumbnails, ...) as typed-array
 *   VIEWS INTO the buffer that was parsed, and the tool stored that object as
 *   `item.metadata`. Every scanned photo therefore pinned its whole source file
 *   for the lifetime of the batch, so memory grew by
 *   (batch size x file size) before any removal had even started. Measured with
 *   12 MP photos: 100 files (301 MB) drove the browser tree to ~2.2 GB, 200 files
 *   (601 MB) to ~6.5 GB, after which removal did not finish, the UI stopped
 *   responding and blob loads failed.
 *
 * What is proven here:
 *   TEST A - 5 / 10 / 20 / 50 file batches all reach a terminal state, none
 *            stuck, none processed twice, state stable afterwards.
 *   TEST B - the retention invariant itself: after a 12 MP batch is scanned, a
 *            forced heap snapshot contains (almost) no retained ArrayBuffer
 *            bytes. Before the fix this was one full file per photo.
 *   TEST C - mixed formats (JPEG + PNG + WebP + TIFF) complete.
 *   TEST D - a malformed file fails alone and does not block the batch.
 *   TEST E - the six required viewports still process a batch with no overflow.
 *   TEST F - TIFF and WebP regressions: real output, really clean bytes.
 *
 * Run with the dev server up: npx playwright test test-high-volume-batch.spec.ts
 */
import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import exifr from 'exifr';

const VIEWPORTS = [
  { width: 375, height: 667, label: 'mobile-small' },
  { width: 390, height: 844, label: 'mobile-large' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 820, height: 1180, label: 'tablet-large' },
  { width: 1280, height: 800, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
];

/** Privacy values written into every fixture so leaks are greppable. */
const PRIVACY_VALUES = [
  'HV-MAKE-CAMERA',
  'HV-MODEL-9',
  'HV-SOFTWARE 1.0',
  'Jane Photographer',
  'HV-COPYRIGHT',
];

let workDir = '';
/** ~1.2 MB camera-like JPEGs with privacy EXIF (batch/functional tests). */
let jpegBatch: string[] = [];
/** 12 MP JPEGs with privacy EXIF (retention test). */
let hugeBatch: string[] = [];
let pngPath = '';
let webpPath = '';
let tiffPath = '';
let brokenPath = '';
let plainPath = '';
let hugeBytesPerFile = 0;

function exifPayload(index: number) {
  return {
    IFD0: {
      Make: PRIVACY_VALUES[0],
      Model: PRIVACY_VALUES[1],
      Software: PRIVACY_VALUES[2],
      Artist: PRIVACY_VALUES[3],
      Copyright: PRIVACY_VALUES[4],
      ImageDescription: `HV description ${index}`,
    },
    IFD2: {
      DateTimeOriginal: '2024:05:06 07:08:09',
      UserComment: `HV comment ${index}`,
    },
  };
}

/** Camera-like gradient with light grain, so 12 MP stays a realistic ~3 MB. */
function cameraLikeRaw(width: number, height: number, seed: number): Buffer {
  const buf = Buffer.allocUnsafe(width * height * 3);
  let x = seed >>> 0;
  for (let y = 0; y < height; y++) {
    for (let px = 0; px < width; px++) {
      const i = (y * width + px) * 3;
      if (((px + y) & 3) === 0) {
        x ^= x << 13; x >>>= 0;
        x ^= x >> 17;
        x ^= x << 5; x >>>= 0;
        const n = ((x >>> 16) & 63) - 32;
        buf[i] = Math.max(0, Math.min(255, ((px / width) * 255 | 0) + n));
        buf[i + 1] = Math.max(0, Math.min(255, ((y / height) * 255 | 0) + n));
        buf[i + 2] = 128;
      } else {
        buf[i] = (px / width) * 255 | 0;
        buf[i + 1] = (y / height) * 255 | 0;
        buf[i + 2] = 128;
      }
    }
  }
  return buf;
}

async function makeJpeg(path: string, width: number, height: number, index: number): Promise<Buffer> {
  const raw = cameraLikeRaw(width, height, 9871 + index * 7919);
  const buf = await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 82 })
    .withExifMerge(exifPayload(index))
    .toBuffer();
  writeFileSync(path, buf);
  return buf;
}

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'pmr-highvolume-'));

  // 50 functional JPEGs (~1.2 MB each, 1600x1200).
  for (let i = 0; i < 50; i++) {
    const p = join(workDir, `batch-${i}.jpg`);
    await makeJpeg(p, 1600, 1200, i);
    jpegBatch.push(p);
  }

  // 12 MP files for the retention measurement.
  for (let i = 0; i < 12; i++) {
    const p = join(workDir, `huge-${i}.jpg`);
    const buf = await makeJpeg(p, 4032, 3024, 100 + i);
    hugeBatch.push(p);
    hugeBytesPerFile = buf.length;
  }

  const pngBuf = await sharp(cameraLikeRaw(1200, 900, 55), { raw: { width: 1200, height: 900, channels: 3 } })
    .png()
    .withExifMerge(exifPayload(200))
    .toBuffer();
  writeFileSync((pngPath = join(workDir, 'photo.png')), pngBuf);

  const webpBuf = await sharp(cameraLikeRaw(1200, 900, 77), { raw: { width: 1200, height: 900, channels: 3 } })
    .webp({ quality: 82 })
    .withExifMerge(exifPayload(201))
    .toBuffer();
  writeFileSync((webpPath = join(workDir, 'photo.webp')), webpBuf);

  const tiffBuf = await sharp(cameraLikeRaw(1200, 900, 99), { raw: { width: 1200, height: 900, channels: 3 } })
    .tiff()
    .withExifMerge(exifPayload(202))
    .toBuffer();
  writeFileSync((tiffPath = join(workDir, 'photo.tiff')), tiffBuf);

  writeFileSync((brokenPath = join(workDir, 'broken.jpg')), Buffer.from('not-an-image-at-all-'.repeat(64)));

  const plainBuf = await sharp(cameraLikeRaw(1200, 900, 123), { raw: { width: 1200, height: 900, channels: 3 } })
    .jpeg({ quality: 82 })
    .toBuffer();
  writeFileSync((plainPath = join(workDir, 'plain.jpg')), plainBuf);
});

test.afterAll(() => {
  try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
});
async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

interface ItemState {
  id: number;
  status: string;
  removeLabel: string;
  downloadDisabled: boolean | null;
  done: boolean;
  inflight: boolean;
}

/**
 * Per-file state, read the same way the UI writes it. `done`/`inflight` are
 * derived from BOTH the status text and the removal button label, because the
 * status text lags behind the button while the output is being verified - a
 * status-only check would report a still-running batch as finished.
 */
const ITEM_STATE = () => {
  const items = Array.from(document.querySelectorAll('#files-list > div[data-id]'));
  const states: ItemState[] = items.map((el) => {
    const statusEl = el.querySelector('.text-xs');
    const removeBtn = el.querySelector('#remove-' + (el as HTMLElement).dataset.id);
    const dlBtn = el.querySelector('#download-' + (el as HTMLElement).dataset.id);
    const status = statusEl ? statusEl.textContent!.trim() : '';
    const removeLabel = removeBtn ? removeBtn.textContent!.trim() : '';
    return {
      id: Number((el as HTMLElement).dataset.id),
      status,
      removeLabel,
      downloadDisabled: dlBtn ? (dlBtn as HTMLButtonElement).disabled : null,
      done:
        status.includes('Metadata removed successfully') ||
        status.includes('\u2715') ||
        removeLabel.includes('Try again'),
      inflight:
        removeLabel === 'Removing...' ||
        status.includes('Verifying clean output') ||
        status.includes('Removing...'),
    };
  });
  const removeAll = document.getElementById('remove-all-btn');
  const processing = document.getElementById('processing-status');
  return {
    count: states.length,
    done: states.filter((s) => s.done).length,
    notDone: states.filter((s) => !s.done).length,
    inflight: states.filter((s) => s.inflight).length,
    success: states.filter((s) => s.status.includes('Metadata removed successfully')).length,
    failed: states.filter((s) => s.status.includes('\u2715') || s.removeLabel.includes('Try again')).length,
    anyDownloadable: states.some((s) => s.downloadDisabled === false),
    removeAllVisible: removeAll ? !removeAll.classList.contains('hidden') : null,
    processingVisible: processing ? !processing.classList.contains('hidden') : null,
    states,
  };
};

type BatchState = {
  count: number; done: number; notDone: number; inflight: number; success: number;
  failed: number; anyDownloadable: boolean; removeAllVisible: boolean | null;
  processingVisible: boolean | null; states: ItemState[];
};

async function readState(page: Page): Promise<BatchState> {
  return (await page.evaluate(ITEM_STATE)) as unknown as BatchState;
}

/** Upload `paths` and wait until the scan has completely settled. */
async function uploadBatch(page: Page, paths: string[], timeout = 120000): Promise<void> {
  await page.locator('#file-input').setInputFiles(paths);
  await expect
    .poll(async () => {
      const s = await readState(page).catch(() => null);
      return s ? `${s.count}/${s.inflight}` : 'pending';
    }, { timeout, intervals: [250, 500, 1000] })
    .toBe(`${paths.length}/0`);
}

/** Click "Remove all metadata" (when offered) and wait for every item to settle. */
async function removeAllAndWait(page: Page, expected: number, timeout = 180000): Promise<BatchState> {
  const before = await readState(page);
  if (before.removeAllVisible) {
    await page.locator('#remove-all-btn').click();
  }
  await expect
    .poll(async () => {
      const s = await readState(page).catch(() => null);
      return s ? `${s.count}/${s.inflight}/${s.notDone}` : 'pending';
    }, { timeout, intervals: [250, 500, 1000] })
    .toBe(`${expected}/0/0`);
  return readState(page);
}

/** Total ArrayBuffer backing-store bytes the page retains, via a CDP heap
 *  snapshot (a snapshot forces a GC, so unreachable buffers do not count). */
async function retainedArrayBufferBytes(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.enable').catch(() => undefined);
  const chunks: string[] = [];
  const onChunk = (ev: { chunk?: string }) => { if (ev.chunk) chunks.push(ev.chunk); };
  cdp.on('HeapProfiler.addHeapSnapshotChunk' as never, onChunk as never);
  await cdp.send('HeapProfiler.takeHeapSnapshot' as never, { reportProgress: false } as never);
  cdp.off('HeapProfiler.addHeapSnapshotChunk' as never, onChunk as never);

  const snap = JSON.parse(chunks.join('')) as {
    snapshot: { meta: { node_fields: string[]; node_types: string[][] } };
    nodes: number[];
    strings: string[];
  };
  const fields = snap.snapshot.meta.node_fields;
  const types = snap.snapshot.meta.node_types[0];
  const fc = fields.length;
  const typeIdx = fields.indexOf('type');
  const nameIdx = fields.indexOf('name');
  const sizeIdx = fields.indexOf('self_size');

  let total = 0;
  for (let i = 0; i < snap.nodes.length; i += fc) {
    if (types[snap.nodes[i + typeIdx]] !== 'native') continue;
    if (snap.strings[snap.nodes[i + nameIdx]] !== 'system / JSArrayBufferData') continue;
    total += snap.nodes[i + sizeIdx];
  }
  return total;
}

test.describe('High-volume batch processing', () => {

  test('TEST A: 5 / 10 / 20 / 50 file batches all complete with no stuck item', async ({ page }) => {
    test.setTimeout(300000);
    await page.goto('http://localhost:4321');
    await ensureReady(page);

    for (const size of [5, 10, 20, 50]) {
      await uploadBatch(page, jpegBatch.slice(0, size));
      const state = await removeAllAndWait(page, size);

      expect(state.count, `${size} files: all items present`).toBe(size);
      expect(state.inflight, `${size} files: nothing left in flight`).toBe(0);
      expect(state.notDone, `${size} files: every item reached a terminal state`).toBe(0);
      expect(state.success, `${size} files: every file was really cleaned`).toBe(size);
      expect(state.failed, `${size} files: no failures`).toBe(0);
      // Verified output only: the download button is only enabled after the
      // generated bytes were re-scanned and confirmed clean.
      for (const item of state.states) {
        expect(item.status, `${size} files: item ${item.id} reports the verified result`)
          .toContain('Privacy metadata remaining: 0');
        expect(item.downloadDisabled, `${size} files: item ${item.id} is downloadable`).toBe(false);
      }

      // No duplicate processing: the settled state must stay settled.
      await page.waitForTimeout(2500);
      const after = await readState(page);
      expect(after.inflight, `${size} files: nothing restarted after settling`).toBe(0);
      expect(after.notDone, `${size} files: still terminal after waiting`).toBe(0);
      expect(after.success).toBe(size);
    }
  });

  test('TEST B: a scanned 12 MP batch retains no source ArrayBuffers', async ({ page, context }) => {
    test.setTimeout(300000);
    const cdp = await context.newCDPSession(page);

    await page.goto('http://localhost:4321');
    await ensureReady(page);

    await uploadBatch(page, hugeBatch);
    const scanned = await readState(page);
    expect(scanned.count).toBe(hugeBatch.length);

    // The scan phase alone is measured: no removal has run yet, so nothing that
    // is still retained here is needed by the tool.
    await page.evaluate(() => {
      const g = (window as unknown as { gc?: () => void }).gc;
      if (typeof g === 'function') g();
    });
    const retained = await retainedArrayBufferBytes(cdp);
    const inputBytes = hugeBytesPerFile * hugeBatch.length;

    // Before the fix this was one full source file per photo (>= inputBytes).
    // The allowance is a quarter of one file - far below any real retention.
    const allowance = Math.floor(hugeBytesPerFile / 4);
    expect(
      retained,
      `retained ArrayBuffer bytes ${(retained / 1048576).toFixed(2)}MB for a ` +
      `${(inputBytes / 1048576).toFixed(1)}MB batch (allowance ${(allowance / 1048576).toFixed(2)}MB)`,
    ).toBeLessThanOrEqual(allowance);
  });

  test('TEST C: mixed formats (JPEG + PNG + WebP + TIFF) all complete', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('http://localhost:4321');
    await ensureReady(page);

    const paths = [jpegBatch[0], pngPath, webpPath, tiffPath, jpegBatch[1], pngPath];
    await uploadBatch(page, paths);
    const state = await removeAllAndWait(page, paths.length);

    expect(state.count).toBe(paths.length);
    expect(state.inflight).toBe(0);
    expect(state.notDone).toBe(0);
    expect(state.failed).toBe(0);
    expect(state.success).toBe(paths.length);
    expect(state.anyDownloadable).toBe(true);
  });
test('TEST D: a malformed file fails alone and never blocks the batch', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('http://localhost:4321');
    await ensureReady(page);

    const paths = [jpegBatch[0], brokenPath, pngPath, webpPath, tiffPath, plainPath];
    await uploadBatch(page, paths);
    const state = await removeAllAndWait(page, paths.length);

    expect(state.count).toBe(paths.length);
    expect(state.inflight, 'no item stays in a processing state').toBe(0);
    expect(state.notDone, 'the broken file reaches its own failure state').toBe(0);
    // The valid files still succeed and stay downloadable.
    expect(state.success).toBeGreaterThanOrEqual(paths.length - 1);
    expect(state.anyDownloadable).toBe(true);
  });

  for (const vp of VIEWPORTS) {
    test(`TEST E: 10-file batch completes and stays usable at ${vp.label} (${vp.width}x${vp.height})`, async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:4321');
      await ensureReady(page);

      const paths = jpegBatch.slice(0, 10);
      await uploadBatch(page, paths);
      const state = await removeAllAndWait(page, paths.length);
      expect(state.inflight).toBe(0);
      expect(state.notDone).toBe(0);
      expect(state.success).toBe(paths.length);

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${vp.label}: no horizontal page overflow`).toBeLessThanOrEqual(1);
    });
  }

  test('TEST F: TIFF and WebP outputs really are clean (regression)', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto('http://localhost:4321');
    await ensureReady(page);

    const paths = [tiffPath, webpPath];
    await uploadBatch(page, paths);
    const state = await removeAllAndWait(page, paths.length);
    expect(state.failed).toBe(0);
    expect(state.success).toBe(paths.length);

    // Download both outputs and prove that the privacy payload is gone from the
    // real bytes, while the technical image information these formats keep
    // (TIFF structure, ICC, pixels) is still intact.
    const PRIVACY_KEYS = [
      'Make', 'Model', 'Software', 'Artist', 'Copyright', 'ImageDescription',
      'DateTimeOriginal', 'DateTimeDigitized', 'DateTime', 'userComment', 'UserComment',
    ];
    for (const [id, label] of [[1, 'TIFF'], [2, 'WebP']] as const) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator(`#download-${id}`).click(),
      ]);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const bytes = Buffer.concat(chunks);

      expect(bytes.length, `${label}: output is not empty`).toBeGreaterThan(0);
      const latin1 = bytes.toString('latin1');

      // The container must still be the same real format (TIFF/WebP P0 intact).
      if (label === 'TIFF') {
        const magic = latin1.slice(0, 2);
        expect(['II', 'MM'], `${label}: output is still a real TIFF`).toContain(magic);
      } else {
        expect(latin1.slice(0, 4), `${label}: output is still a real RIFF container`).toBe('RIFF');
        expect(latin1.slice(8, 12), `${label}: output is still a real WebP`).toBe('WEBP');
      }

      // No privacy value and no privacy container may survive in the bytes.
      for (const value of PRIVACY_VALUES) {
        expect(latin1, `${label}: privacy value "${value}" must not survive`).not.toContain(value);
      }
      expect(latin1, `${label}: EXIF payload must not survive`).not.toContain('Exif\u0000\u0000');
      expect(latin1, `${label}: XMP payload must not survive`).not.toContain('http://ns.adobe.com/xap/1.0/');
      expect(latin1, `${label}: IPTC payload must not survive`).not.toContain('Photoshop 3.0');

      // Where the parser understands the output, no privacy field may be left
      // either (exifr has no WebP reader, so that case is covered byte-wise).
      let parsed: Record<string, unknown> | undefined;
      try {
        parsed = (await exifr.parse(bytes, true)) as Record<string, unknown> | undefined;
      } catch {
        parsed = undefined;
      }
      for (const key of PRIVACY_KEYS) {
        expect(Object.keys(parsed ?? {}), `${label}: privacy field ${key} must not survive`).not.toContain(key);
      }
    }
  });
});
