/**
 * Stale batch ownership regression coverage - deterministic.
 *
 * Root cause this spec pins down (confirmed investigation):
 *   1. removeAllMetadata() snapshotted the old batch's items and awaited
 *      stripMetadata() sequentially, so a re-upload mid-loop let old items
 *      START after the new batch was already live.
 *   2. stripMetadata() captured the LIVE global `batchId`, so an old item that
 *      started after a re-upload could be adopted by the NEW batch.
 *   3. The stripMetadata() catch path called reRenderItem(item) OUTSIDE the
 *      stale-batch guard, and
 *   4. nextId resets to 1 on every upload, so old and new items share
 *      `data-id` values and reRenderItem(item) (DOM lookup by data-id only)
 *      repainted the new batch with old item state.
 *
 * The fix gives every FileItem a permanent birth batch (`item.batchId`), makes
 * stripMetadata() capture that instead of the mutable global, guards every
 * removeAllMetadata() iteration BEFORE it starts, and moves the catch path's
 * reRenderItem() inside the same current-batch guard.
 *
 * Determinism: the browser primitives a removal awaits are patched by an init
 * script so one chosen removal is frozen at an exact point (and optionally
 * forced to fail) while a second batch is uploaded, then released. The gate
 * covers the removal's own byte read (`Blob.prototype.arrayBuffer`, the first
 * thing every strip branch awaits - including the structural PNG path, which
 * never decodes) and the decode (`createImageBitmap`) used by the remaining
 * canvas paths. A MutationObserver records ANY DOM change inside the new batch,
 * so a stale repaint cannot slip through unseen, and the observer is proven
 * live with a positive control before its empty result is trusted.
 *
 * TEST 1 - stale SUCCESS: an old batch operation finishing after a re-upload
 *          must not mutate the new batch (DOM, buttons, status, metadata
 *          display, busy counter).
 * TEST 2 - stale FAILURE: the old catch path must not repaint / reset the new
 *          batch either.
 * TEST 3 - same-file re-upload regression (upload -> remove -> verify ->
 *          download, twice with the SAME file).
 * TEST 4 - high-volume batch state and counts stay correct.
 * RESPONSIVE - the stale-batch scenario at all six required viewports.
 *
 * Run with the dev server up:
 *   npx playwright test stale-batch-mutation-regression.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const VIEWPORTS = [
  { width: 375, height: 667, label: 'mobile-small' },
  { width: 390, height: 844, label: 'mobile-large' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 820, height: 1180, label: 'tablet-large' },
  { width: 1280, height: 800, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
];

let workDir = '';
let seq = 0;

test.beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'pmr-stale-batch-'));
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

/** PNG with privacy EXIF: parsed metadata -> no auto-strip, so removal is manual. */
async function makePng(label: string): Promise<string> {
  const buf = await sharp({
    create: { width: 120, height: 120, channels: 4, background: { r: 20, g: 120, b: 200, alpha: 1 } },
  })
    .png()
    .withExifMerge({
      IFD0: {
        Make: `StaleBatch-${label}`,
        Model: 'GuardProbe',
        Software: 'stale-batch-probe 1.0',
        Copyright: 'Stale Batch Probe',
      },
    })
    .toBuffer();
  const path = join(workDir, `stale-${label}-${++seq}.png`);
  writeFileSync(path, buf);
  return path;
}

/** JPEG with privacy EXIF (same-file re-upload regression). */
async function makeJpeg(label: string): Promise<string> {
  const buf = await sharp({
    create: { width: 160, height: 160, channels: 3, background: { r: 200, g: 80, b: 40 } },
  })
    .jpeg({ quality: 90 })
    .withExifMerge({
      IFD0: {
        Make: `StaleBatch-${label}`,
        Model: 'GuardProbe',
        Software: 'stale-batch-probe 1.0',
        Copyright: 'Stale Batch Probe',
      },
    })
    .toBuffer();
  const path = join(workDir, `stale-${label}-${++seq}.jpg`);
  writeFileSync(path, buf);
  return path;
}

const st = {
  // `div[data-id]` only: an opened per-file metadata panel is inserted as a
  // sibling AFTER its item (el.after(panel)), so an unscoped child selector
  // would count panels as extra files.
  items: (page: Page) => page.locator('#files-list > div[data-id]'),
  statuses: (page: Page) => page.locator('#files-list > div[data-id] .text-xs'),
  fileInput: (page: Page) => page.locator('#file-input'),
};

/**
 * Injected before any page script runs. Patches the browser primitives a
 * removal / verification path uses so a single chosen removal can be frozen
 * (and optionally failed) at an exact point, and so every DOM mutation inside
 * the results area is recorded.
 */
const GATE_SCRIPT = function () {
  const w = window as any;
  if (w.__pmrGateInstalled) return;
  w.__pmrGateInstalled = true;

  const originalBitmap = window.createImageBitmap.bind(window);
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalArrayBuffer = Blob.prototype.arrayBuffer;

  w.__pmrToBlobCalls = 0;
  w.__pmrOutputReads = 0;
  w.__pmrMutationRecords = [];
  w.__pmrGate = { armed: false, mode: 'hold', intercepted: 0, resolved: 0, gate: null, release: null };

  w.__pmrArmGate = (mode: 'hold' | 'fail') => {
    const state: any = { armed: true, mode, intercepted: 0, resolved: 0, release: null };
    state.gate = new Promise<void>((resolve: () => void) => {
      state.release = resolve;
    });
    w.__pmrGate = state;
    return true;
  };

  w.__pmrGateState = () => ({
    armed: w.__pmrGate.armed,
    mode: w.__pmrGate.mode,
    intercepted: w.__pmrGate.intercepted,
    resolved: w.__pmrGate.resolved,
  });

  w.__pmrReleaseGate = () => {
    const state = w.__pmrGate;
    if (state && state.release) {
      state.release();
      state.release = null;
    }
    return true;
  };

  w.__pmrCounters = () => ({ toBlob: w.__pmrToBlobCalls, outputReads: w.__pmrOutputReads });

  // Every strip branch starts by reading the uploaded file's bytes, and the
  // verification tail reads the generated output. Both pass through here, so
  // the structural PNG path (which never decodes) is freezable too - the
  // pending read rejects in 'fail' mode exactly where a decode failure used to.
  // An armed gate is one-shot: it freezes exactly the removal it belongs to.
  Blob.prototype.arrayBuffer = function (this: Blob) {
    const state = w.__pmrGate;
    const gated = !!state && state.armed;
    if (gated) {
      state.armed = false;
      state.intercepted++;
    }

    const countOutputRead = (buf: ArrayBuffer): ArrayBuffer => {
      // A non-File blob is the generated output handed to verification.
      if (!(this instanceof File)) w.__pmrOutputReads++;
      return buf;
    };

    const read = () => originalArrayBuffer.call(this).then(countOutputRead);

    if (!gated) return read();
    return state.gate.then(() => {
      if (state.mode === 'fail') {
        state.resolved++;
        throw new Error('PMR deterministic stale-strip failure');
      }
      return read().then((buf: ArrayBuffer) => {
        state.resolved++;
        return buf;
      });
    });
  } as typeof Blob.prototype.arrayBuffer;

  // Every createImageBitmap the app awaits passes through here. An armed gate is
  // one-shot: it freezes exactly the removal it belongs to.
  window.createImageBitmap = (async (...args: any[]) => {
    const state = w.__pmrGate;
    if (state && state.armed) {
      state.armed = false;
      state.intercepted++;
      await state.gate;
      if (state.mode === 'fail') {
        state.resolved++;
        throw new Error('PMR deterministic stale-strip failure');
      }
      const bitmap = await originalBitmap(...(args as [ImageBitmapSource]));
      state.resolved++;
      return bitmap;
    }
    return originalBitmap(...(args as [ImageBitmapSource]));
  }) as typeof window.createImageBitmap;

  HTMLCanvasElement.prototype.toBlob = function (
    this: HTMLCanvasElement,
    ...args: Parameters<HTMLCanvasElement['toBlob']>
  ) {
    w.__pmrToBlobCalls++;
    return originalToBlob.apply(this, args);
  } as HTMLCanvasElement['toBlob'];

  // Any DOM change inside the results area / control bar is a stale repaint.
  w.__pmrInstallObserver = () => {
    w.__pmrMutationRecords = [];
    w.__pmrObserver = new MutationObserver((records: MutationRecord[]) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        w.__pmrMutationRecords.push({
          type: record.type,
          attribute: record.attributeName,
          target: (target && (target.id || String(target.className))) || record.target.nodeName,
          oldValue: record.oldValue,
        });
      }
    });
    const selectors = [
      '#files-list',
      '#remove-all-btn',
      '#download-all-btn',
      '#show-metadata-btn',
      '#global-status',
      '#processing-status',
      '#results-panel',
      '#metadata-viewer-panel',
      '#metadata-viewer-content',
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        w.__pmrObserver.observe(el, {
          attributes: true,
          attributeOldValue: true,
          childList: true,
          subtree: true,
          characterData: true,
          characterDataOldValue: true,
        });
      }
    }
    return true;
  };

  w.__pmrMutationCount = () => w.__pmrMutationRecords.length;
  w.__pmrMutations = () => w.__pmrMutationRecords;

  w.__pmrSnapshot = () => {
    const text = (el: Element | null) => (el ? (el.textContent || '').trim() : null);
    const button = (id: string) => {
      const el = document.getElementById(id) as HTMLButtonElement | null;
      if (!el) return null;
      return {
        text: (el.textContent || '').trim(),
        disabled: el.disabled,
        classes: el.className,
        hidden: el.classList.contains('hidden'),
      };
    };
    const items = Array.from(document.querySelectorAll('#files-list > div[data-id]')).map((el) => {
      const node = el as HTMLElement;
      const id = node.getAttribute('data-id') || '';
      return {
        id,
        text: (node.textContent || '').trim(),
        status: text(node.querySelector('.text-xs')),
        remove: button(`remove-${id}`),
        download: button(`download-${id}`),
        meta: button(`meta-toggle-${id}`),
        metadataPanel: document.getElementById(`metadata-panel-${id}`) ? 'open' : 'closed',
      };
    });
    return {
      itemCount: items.length,
      items,
      removeAll: button('remove-all-btn'),
      downloadAll: button('download-all-btn'),
      showMetadata: button('show-metadata-btn'),
      globalStatus: {
        text: text(document.getElementById('global-status')),
        classes: document.getElementById('global-status')?.className ?? null,
      },
      metadataViewer: {
        text: text(document.getElementById('metadata-viewer-content')),
        classes: document.getElementById('metadata-viewer-panel')?.className ?? null,
      },
      processing: document.getElementById('processing-status')?.className ?? null,
      resultsPanel: document.getElementById('results-panel')?.className ?? null,
      progress: text(document.getElementById('progress-steps')),
    };
  };
  return true;
};

async function installGate(page: Page): Promise<void> {
  await page.addInitScript(GATE_SCRIPT);
}

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 15000 });
}

async function openTool(page: Page, path = '/en'): Promise<void> {
  await page.goto(`http://localhost:4321${path}`);
  await ensureReady(page);
}

async function armGate(page: Page, mode: 'hold' | 'fail'): Promise<void> {
  await page.evaluate((m) => (window as any).__pmrArmGate(m), mode);
}

async function gateState(
  page: Page,
): Promise<{ armed: boolean; mode: string; intercepted: number; resolved: number }> {
  return page.evaluate(() => (window as any).__pmrGateState());
}

async function releaseGate(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__pmrReleaseGate());
}

async function toBlobCalls(page: Page): Promise<number> {
  return (await page.evaluate(() => (window as any).__pmrCounters())).toBlob;
}

/**
 * Completed reads of a generated output blob (never the uploaded File): the
 * verification byte read. A rising count proves a removal reached its
 * verification tail - the format-neutral replacement for the canvas toBlob
 * counter, which the structural PNG path never touches.
 */
async function outputReads(page: Page): Promise<number> {
  return (await page.evaluate(() => (window as any).__pmrCounters())).outputReads;
}

async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__pmrInstallObserver());
}

async function mutationCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__pmrMutationCount());
}

async function mutationLog(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as any).__pmrMutations());
}

async function snapshot(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__pmrSnapshot());
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * The app's own visibility switch for the control buttons is the `hidden` class
 * (refreshActions toggles it), so the button state is asserted through that
 * token: in this build `.inline-flex` outranks `.hidden` for these buttons, so
 * their rendered display stays `flex` once the results panel is shown.
 */
async function hasHiddenClass(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((el) => el.classList.contains('hidden'));
}

async function waitForGateIntercept(page: Page): Promise<void> {
  await expect.poll(async () => (await gateState(page)).intercepted, { timeout: 20000 }).toBe(1);
}

async function waitForGateHandled(page: Page): Promise<void> {
  await expect.poll(async () => (await gateState(page)).resolved, { timeout: 20000 }).toBe(1);
}

/** Fails with the recorded mutation list so a stale repaint is diagnosable. */
async function expectNoMutation(page: Page, context: string): Promise<void> {
  const count = await mutationCount(page);
  if (count !== 0) {
    const log = await mutationLog(page);
    throw new Error(
      `${context}: stale operation mutated the current batch DOM (${count} mutation(s)): ` +
        JSON.stringify(log),
    );
  }
}

test.describe('Stale batch ownership - deterministic regression', () => {
  test('TEST 1 stale SUCCESS: an old batch finishing after re-upload cannot mutate the new batch', async ({
    page,
  }) => {
    const a1 = await makePng('t1-a1');
    const a2 = await makePng('t1-a2');
    const b1 = await makePng('t1-b1');
    const b2 = await makePng('t1-b2');

    await installGate(page);
    // A removal that fails logs the app's own strip error - collected so the
    // frozen removal's completion (not just its restart) can be asserted.
    const stripErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Error stripping metadata')) {
        stripErrors.push(message.text());
      }
    });
    await openTool(page);
    const fileInput = st.fileInput(page);
    const items = st.items(page);
    const statuses = st.statuses(page);

    // --- Batch A -------------------------------------------------------
    await fileInput.setInputFiles([a1, a2]);
    await expect(items).toHaveCount(2, { timeout: 30000 });
    await expect(statuses.nth(0)).toContainText('Privacy metadata found', { timeout: 20000 });
    await expect(statuses.nth(1)).toContainText('Privacy metadata found', { timeout: 20000 });

    // Freeze Batch A's FIRST removal at its decode step, so Batch B can be
    // uploaded while Batch A is provably still in flight.
    await armGate(page, 'hold');
    await page.locator('#remove-all-btn').click();
    await waitForGateIntercept(page);

    // --- Batch B replaces the DOM while Batch A is still running -------
    await fileInput.setInputFiles([b1, b2]);
    await expect(items).toHaveCount(2, { timeout: 30000 });
    await expect(statuses.nth(0)).toContainText('Privacy metadata found', { timeout: 20000 });
    await expect(statuses.nth(1)).toContainText('Privacy metadata found', { timeout: 20000 });

    // Batch B's metadata display is part of the protected state.
    await page.locator('#show-metadata-btn').click();
    await expect(page.locator('#metadata-viewer-panel')).toBeVisible();
    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible();
    await expect(page.locator('#metadata-panel-1')).toContainText('StaleBatch-t1-b1');

    await startRecording(page);
    const before = await snapshot(page);

    // --- The stale Batch A removal is released and completes SUCCESSFULLY ---
    await releaseGate(page);
    await waitForGateHandled(page); // the frozen byte read resumed
    await page.waitForTimeout(600); // allow the stale publish + drop tail to settle

    // The released removal ran to completion: the structural PNG strip is
    // synchronous after that read, so a failure would have logged the app's own
    // removal error. (The old canvas path proved completion through a
    // canvas.toBlob call; the structural path never paints a canvas, which the
    // counter below asserts.) A stale item never reaches verification - the
    // batch guard drops it first - so `busyCount` integrity is re-proven below.
    expect(stripErrors).toEqual([]);
    expect(await toBlobCalls(page)).toBe(0);

    await expectNoMutation(page, 'TEST 1 stale success');
    expect(await snapshot(page)).toEqual(before);

    // Explicit Batch B contract: count, statuses, buttons, metadata display.
    await expect(items).toHaveCount(2);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata');
    await expect(page.locator('#remove-1')).toBeEnabled();
    await expect(page.locator('#download-1')).toBeDisabled();
    await expect(page.locator('#remove-2')).toHaveText('Remove metadata');
    await expect(page.locator('#remove-2')).toBeEnabled();
    await expect(page.locator('#download-2')).toBeDisabled();
    await expect(statuses.nth(0)).toContainText('Privacy metadata found');
    await expect(statuses.nth(1)).toContainText('Privacy metadata found');
    await expect(page.locator('#metadata-panel-1')).toContainText('StaleBatch-t1-b1');
    await expect(page.locator('#results-panel')).toBeVisible();
    expect(await hasHiddenClass(page, '#remove-all-btn')).toBe(false); // pending work exists
    expect(await hasHiddenClass(page, '#download-all-btn')).toBe(true); // nothing clean yet
    await expect(page.locator('#global-status')).toBeHidden();

    // busyCount integrity: with a leaked (negative) counter Batch B's own
    // removal would show "Remove all metadata" while an item is still busy.
    await armGate(page, 'hold');
    await page.locator('#remove-all-btn').click();
    await waitForGateIntercept(page);
    await expect.poll(() => hasHiddenClass(page, '#remove-all-btn')).toBe(true); // busyCount > 0
    await expect(page.locator('#remove-1')).toBeDisabled();
    expect(await mutationCount(page)).toBeGreaterThan(0); // positive control: observer is live
    const readsBefore = await outputReads(page);
    await releaseGate(page);

    await expect(page.locator('#remove-1')).toHaveText(/Success/, { timeout: 60000 });
    await expect(page.locator('#remove-2')).toHaveText(/Success/, { timeout: 60000 });
    // The current batch's removal reached real verification: its generated PNG
    // bytes were re-read and re-scanned before the output was published.
    await expect.poll(() => outputReads(page), { timeout: 20000 }).toBeGreaterThan(readsBefore);
    await expect(page.locator('#download-1')).toBeEnabled();
    await expect(page.locator('#download-2')).toBeEnabled();
    await expect(page.locator('#global-status')).toContainText('2 files cleaned');
  });

  test('TEST 2 stale FAILURE: the old catch path cannot repaint or reset the new batch', async ({
    page,
  }) => {
    const a1 = await makePng('t2-a1');
    const a2 = await makePng('t2-a2');
    const b1 = await makePng('t2-b1');
    const b2 = await makePng('t2-b2');

    await installGate(page);
    await openTool(page);
    const fileInput = st.fileInput(page);
    const items = st.items(page);
    const statuses = st.statuses(page);

    // --- Batch A -------------------------------------------------------
    await fileInput.setInputFiles([a1, a2]);
    await expect(items).toHaveCount(2, { timeout: 30000 });
    await expect(statuses.nth(0)).toContainText('Privacy metadata found', { timeout: 20000 });

    // Batch A's first removal is frozen and will FAIL once it is released.
    await armGate(page, 'fail');
    await page.locator('#remove-all-btn').click();
    await waitForGateIntercept(page);

    // --- Batch B: item ids 1 and 2 collide with Batch A's ids ----------
    await fileInput.setInputFiles([b1, b2]);
    await expect(items).toHaveCount(2, { timeout: 30000 });
    await expect(statuses.nth(0)).toContainText('Privacy metadata found', { timeout: 20000 });
    await expect(statuses.nth(1)).toContainText('Privacy metadata found', { timeout: 20000 });

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toContainText('StaleBatch-t2-b1');
    await startRecording(page);
    const before = await snapshot(page);

    // The stale catch path still logs its error - waiting for it proves the old
    // failure has happened before the assertions below run.
    const staleError = page.waitForEvent('console', {
      predicate: (message) =>
        message.type() === 'error' && message.text().includes('Error stripping metadata'),
      timeout: 20000,
    });
    await releaseGate(page);
    await staleError;
    await page.waitForTimeout(400);

    await expectNoMutation(page, 'TEST 2 stale failure');
    expect(await snapshot(page)).toEqual(before);

    // Explicit Batch B contract: no repaint, no status/button/busy changes.
    await expect(items).toHaveCount(2);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata');
    await expect(page.locator('#remove-1')).toBeEnabled();
    await expect(page.locator('#download-1')).toBeDisabled();
    await expect(page.locator('#remove-2')).toHaveText('Remove metadata');
    await expect(page.locator('#remove-2')).toBeEnabled();
    await expect(page.locator('#download-2')).toBeDisabled();
    await expect(statuses.nth(0)).toContainText('Privacy metadata found');
    await expect(statuses.nth(1)).toContainText('Privacy metadata found');
    await expect(page.locator('#metadata-panel-1')).toContainText('StaleBatch-t2-b1');
    await expect(page.locator('#results-panel')).toBeVisible();
    expect(await hasHiddenClass(page, '#remove-all-btn')).toBe(false); // stale failure did not hide it
    await expect(page.locator('#global-status')).toBeHidden();

    // busyCount / functional probe: Batch B must still behave normally, i.e. the
    // stale catch must not have decremented the current batch's busy counter.
    await armGate(page, 'hold');
    await page.locator('#remove-all-btn').click();
    await waitForGateIntercept(page);
    await expect(page.locator('#remove-1')).toBeDisabled();
    await expect.poll(() => hasHiddenClass(page, '#remove-all-btn')).toBe(true); // busyCount > 0
    expect(await mutationCount(page)).toBeGreaterThan(0); // positive control
    await releaseGate(page);
    await expect(page.locator('#remove-1')).toHaveText(/Success/, { timeout: 60000 });
    await expect(page.locator('#remove-2')).toHaveText(/Success/, { timeout: 60000 });
    await expect(page.locator('#download-1')).toBeEnabled();
    await expect(page.locator('#global-status')).toContainText('2 files cleaned');
  });

  test('TEST 3 same-file re-upload: upload -> remove -> verify -> download, twice', async ({ page }) => {
    const file = await makeJpeg('t3-same');
    await openTool(page);
    const fileInput = st.fileInput(page);
    const items = st.items(page);
    const statuses = st.statuses(page);

    for (const round of [1, 2]) {
      // Round 2 re-selects the SAME file: clear the input first so a fresh
      // change event is always fired.
      if (round === 2) await fileInput.setInputFiles([]);
      await fileInput.setInputFiles(file);

      await expect(items).toHaveCount(1, { timeout: 30000 });
      await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
      await expect(page.locator('#remove-1')).toBeEnabled();
      await expect(page.locator('#download-1')).toBeDisabled();
      await expect(statuses.first()).toContainText('Privacy metadata found', { timeout: 20000 });

      await page.locator('#remove-1').click();
      await expect(page.locator('#remove-1')).toHaveText(/Success/, { timeout: 60000 });
      await expect(statuses.first()).not.toContainText('Privacy metadata found');
      await expect(page.locator('#download-1')).toBeEnabled();

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        page.locator('#download-1').click(),
      ]);
      expect(download.suggestedFilename()).toContain('-clean.');
      expect(download.suggestedFilename()).toMatch(/\.(jpg|jpeg|png|webp|tiff)$/i);
    }
  });

  test('TEST 4 high-volume: batch state and counts stay correct (20 files)', async ({ page }) => {
    const count = 20;
    const batch: string[] = [];
    for (let i = 0; i < count; i++) batch.push(await makePng(`t4-${i}`));
    const extra = await makePng('t4-extra');

    await openTool(page);
    const fileInput = st.fileInput(page);
    const items = st.items(page);
    const statuses = st.statuses(page);

    await fileInput.setInputFiles(batch);
    await expect(items).toHaveCount(count, { timeout: 90000 });
    await expect(statuses.nth(count - 1)).toContainText('Privacy metadata found', { timeout: 60000 });

    await page.locator('#remove-all-btn').click();
    await expect(page.locator('#remove-all-btn')).toHaveText(/Success/, { timeout: 180000 });
    await expect(statuses.nth(count - 1)).not.toContainText('Privacy metadata found');

    await expect(items).toHaveCount(count);
    const removeBtns = page.locator('#files-list button[id^="remove-"]');
    await expect(removeBtns).toHaveCount(count);
    const removeTexts = await removeBtns.allTextContents();
    expect(removeTexts.every((text) => text.includes('Success'))).toBe(true);

    const downloadBtns = page.locator('#files-list button[id^="download-"]');
    await expect(downloadBtns).toHaveCount(count);
    const allEnabled = await downloadBtns.evaluateAll((els) =>
      els.every((el) => !(el as HTMLButtonElement).disabled),
    );
    expect(allEnabled).toBe(true);

    await expect(page.locator('#global-status')).toContainText(`${count} files cleaned`);
    expect(await hasHiddenClass(page, '#remove-all-btn')).toBe(true); // nothing pending
    expect(await hasHiddenClass(page, '#download-all-btn')).toBe(false); // clean results exist

    // Re-upload resets cleanly: no stale item, no stale button state.
    await fileInput.setInputFiles([extra]);
    await expect(items).toHaveCount(1, { timeout: 30000 });
    await expect(statuses.first()).toContainText('Privacy metadata found', { timeout: 20000 });
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata');
    await expect(page.locator('#download-1')).toBeDisabled();
    expect(await hasHiddenClass(page, '#download-all-btn')).toBe(true);
    await expect(page.locator('#remove-all-btn')).toHaveText('Remove all metadata');
  });
});

for (const vp of VIEWPORTS) {
  test.describe(`Responsive stale-batch guard: ${vp.label} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`batch B survives a stale batch A removal at ${vp.label}`, async ({ page }) => {
      const a1 = await makePng(`vp-a-${vp.label}`);
      const b1 = await makePng(`vp-b-${vp.label}`);

      await installGate(page);
      await openTool(page);
      const fileInput = st.fileInput(page);
      const items = st.items(page);
      const statuses = st.statuses(page);

      await fileInput.setInputFiles([a1]);
      await expect(items).toHaveCount(1, { timeout: 30000 });
      await expect(statuses.first()).toContainText('Privacy metadata found', { timeout: 20000 });

      // Single-file batch: the per-item button drives the removal.
      await armGate(page, 'hold');
      await page.locator('#remove-1').click();
      await waitForGateIntercept(page);

      await fileInput.setInputFiles([b1]);
      await expect(items).toHaveCount(1, { timeout: 30000 });
      await expect(statuses.first()).toContainText('Privacy metadata found', { timeout: 20000 });

      await startRecording(page);
      const before = await snapshot(page);

      await releaseGate(page);
      await waitForGateHandled(page);
      await page.waitForTimeout(600);

      await expectNoMutation(page, `responsive ${vp.label}`);
      expect(await snapshot(page)).toEqual(before);

      await expect(page.locator('#remove-1')).toHaveText('Remove metadata');
      await expect(page.locator('#remove-1')).toBeEnabled();
      await expect(page.locator('#download-1')).toBeDisabled();
      await expect(statuses.first()).toContainText('Privacy metadata found');

      // No new horizontal overflow; the actionable control stays in view.
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      const box = await page.locator('#remove-1').boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    });
  });
}
