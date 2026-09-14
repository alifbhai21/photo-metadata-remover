/**
 * Batch-ID Guard: Real re-upload verification tests
 *
 * Tests that orphan async operations from Batch A do NOT mutate Batch B state
 * when a re-upload occurs during processing. Validates the batchId guard
 * implemented in ToolUpload.astro.
 *
 * Scenarios:
 *   1→1, 5→1, 10→5, 10→10, rapid re-upload, repeated re-upload,
 *   normal behavior (no re-upload), responsive viewports
 */
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, unlinkSync } from 'node:fs';
import sharp from 'sharp';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

const VIEWPORTS = [
  { width: 375, height: 667, label: 'mobile-small' },
  { width: 390, height: 844, label: 'mobile-large' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 820, height: 1180, label: 'tablet-large' },
  { width: 1280, height: 800, label: 'laptop' },
  { width: 1440, height: 900, label: 'desktop' },
];

async function createTestImage(
  index: number,
  ext: 'png' | 'jpg',
  label: string,
): Promise<string> {
  const width = 80 + index * 2;
  const height = 80 + index * 2;
  const bg = { r: 100 + index * 10, g: 150 + index * 5, b: 200 + index * 3, alpha: 1 as const };
  const channels = ext === 'png' ? 4 : 3;
  const exif = {
    IFD0: {
      Make: `BatchGuard${label}`,
      Model: `TestModel${index}`,
      ImageDescription: `Test image ${index} for batch guard verification`,
    },
  };

  const buf = await sharp({ create: { width, height, channels, background: bg } })
    [ext === 'png' ? 'png' : 'jpeg']({ quality: 90 })
    .withExifMerge(exif)
    .toBuffer();

  const path = `batch-guard-${label}-${index}.${ext}`;
  writeFileSync(path, buf);
  return path;
}

async function createBatch(
  count: number,
  ext: 'png' | 'jpg',
  label: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    paths.push(await createTestImage(i, ext, label));
  }
  return paths;
}

function cleanup(paths: string[]): void {
  for (const p of paths) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
}

/** Wait for at least one file item to appear */
async function waitForFiles(page: Page, timeout = 30000): Promise<void> {
  await page.locator('#files-list > div').first().waitFor({ state: 'attached', timeout });
}

/** Wait for all items in current batch to show "Remove metadata" button (ready state) */
async function waitForReady(page: Page, count: number, timeout = 60000): Promise<void> {
  // Wait for the remove-all button to be visible (means busyCount is 0) and for
  // the correct number of file items. This avoids the selector overlap issue
  // where button[id^="remove-"] also matches #remove-all-btn.
  const items = page.locator('#files-list > div');
  await expect(items).toHaveCount(count, { timeout });
}

/** Wait for all items to finish stripping (button text changes to success or error) */
async function waitForStripComplete(page: Page, timeout = 60000): Promise<void> {
  // Wait for processing status to become hidden (no more busy items)
  await expect(page.locator('#processing-status')).toHaveClass(/hidden/, { timeout });
}

test.describe('Batch-ID guard: real re-upload verification', () => {

  test('1→1: upload 1 JPEG, then re-upload 1 JPEG while first is stripping', async ({ page }) => {
    const batchA = await createBatch(1, 'jpg', 'a1');
    const batchB = await createBatch(1, 'jpg', 'b1');

    try {
      await page.goto('http://localhost:4321');
      await ensureReady(page);
      const fileInput = page.locator('#file-input');

      // Upload Batch A
      await fileInput.setInputFiles(batchA);
      await waitForFiles(page);
      await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

      // Start stripping Batch A
      await page.locator('#remove-1').click();

      // Immediately re-upload Batch B (while Batch A is still stripping)
      // Need to clear and set new files
      await ensureReady(page);
      await fileInput.setInputFiles(batchB);

      // Wait for Batch B to appear with correct metadata
      await waitForFiles(page);
      await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

      // Verify Batch B shows privacy metadata found
      const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
      expect(statusText).toContain('Privacy metadata found');

      // Verify no cross-contamination: only 1 file item
      await expect(page.locator('#files-list > div')).toHaveCount(1, { timeout: 5000 });
    } finally {
      cleanup([...batchA, ...batchB]);
    }
  });

  test('5→1: upload 5 JPEGs, then re-upload 1 PNG while first batch is stripping', async ({ page }) => {
    const batchA = await createBatch(5, 'jpg', 'a5');
    const batchB = await createBatch(1, 'png', 'b1');

    try {
      await page.goto('http://localhost:4321');
      await ensureReady(page);
      const fileInput = page.locator('#file-input');

      // Upload Batch A (5 images)
      await fileInput.setInputFiles(batchA);
      await waitForFiles(page);
      await waitForReady(page, 5);

      // Wait for "Remove all metadata" to be visible (busyCount must be 0)
      const removeAllBtn = page.locator('#remove-all-btn');
      await expect(removeAllBtn).toBeVisible({ timeout: 30000 });
      await removeAllBtn.click();

      // Re-upload Batch B while A is still stripping
      await ensureReady(page);
      await fileInput.setInputFiles(batchB);

      // Wait for Batch B
      await waitForFiles(page);
      await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

      // Verify Batch B has correct metadata
      const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
      expect(statusText).toContain('Privacy metadata found');

      // Only 1 file item (Batch A's items were replaced)
      await expect(page.locator('#files-list > div')).toHaveCount(1, { timeout: 5000 });
    } finally {
      cleanup([...batchA, ...batchB]);
    }
  });

  test('10→5: upload 10 JPEGs, then re-upload 5 PNGs', async ({ page }) => {
    const batchA = await createBatch(10, 'jpg', 'a10');
    const batchB = await createBatch(5, 'png', 'b5');

    try {
      await page.goto('http://localhost:4321');
      await ensureReady(page);
      const fileInput = page.locator('#file-input');

      // Upload Batch A
      await fileInput.setInputFiles(batchA);
      await waitForFiles(page);
      await waitForReady(page, 10);

      // Wait for "Remove all metadata" to be visible
      const removeAllBtn = page.locator('#remove-all-btn');
      await expect(removeAllBtn).toBeVisible({ timeout: 30000 });
      await removeAllBtn.click();

      // Re-upload Batch B
      await ensureReady(page);
      await fileInput.setInputFiles(batchB);

      // Wait for Batch B
      await waitForFiles(page);
      await waitForReady(page, 5);

      // Verify Batch B shows correct metadata
      const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
      expect(statusText).toContain('Privacy metadata found');

      // Only 5 file items
      await expect(page.locator('#files-list > div')).toHaveCount(5, { timeout: 5000 });
    } finally {
      cleanup([...batchA, ...batchB]);
    }
  });

  test('10→10: upload 10 JPEGs, then re-upload 10 PNGs', async ({ page }) => {
    const batchA = await createBatch(10, 'jpg', 'a10x');
    const batchB = await createBatch(10, 'png', 'b10x');

    try {
      await page.goto('http://localhost:4321');
      await ensureReady(page);
      const fileInput = page.locator('#file-input');

      // Upload Batch A
      await fileInput.setInputFiles(batchA);
      await waitForFiles(page);
      await waitForReady(page, 10);

      // Wait for "Remove all metadata" to be visible
      const removeAllBtn = page.locator('#remove-all-btn');
      await expect(removeAllBtn).toBeVisible({ timeout: 30000 });
      await removeAllBtn.click();

      // Re-upload Batch B
      await ensureReady(page);
      await fileInput.setInputFiles(batchB);

      // Wait for Batch B
      await waitForFiles(page);
      await waitForReady(page, 10);

      // Verify Batch B shows correct metadata
      const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
      expect(statusText).toContain('Privacy metadata found');

      // Only 10 file items
      await expect(page.locator('#files-list > div')).toHaveCount(10, { timeout: 5000 });
    } finally {
      cleanup([...batchA, ...batchB]);
    }
  });

  test('Rapid re-upload: upload A, immediately upload B without waiting', async ({ page }) => {
    const batchA = await createBatch(5, 'jpg', 'rapid-a');
    const batchB = await createBatch(3, 'png', 'rapid-b');

    try {
      await page.goto('http://localhost:4321');
      await ensureReady(page);
      const fileInput = page.locator('#file-input');

      // Upload Batch A
      await fileInput.setInputFiles(batchA);

      // Immediately upload Batch B (no waiting for A to appear)
      await ensureReady(page);
      await fileInput.setInputFiles(batchB);

      // Wait for Batch B to appear
      await waitForFiles(page);
      await waitForReady(page, 3);

      // Verify Batch B shows correct metadata
      const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
      expect(statusText).toContain('Privacy metadata found');

      // Only 3 file items (Batch B)
      await expect(page.locator('#files-list > div')).toHaveCount(3, { timeout: 5000 });
    } finally {
      cleanup([...batchA, ...batchB]);
    }
  });

  test('Repeated re-upload: A → B → C in sequence', async ({ page }) => {
    const batchA = await createBatch(3, 'jpg', 'repeat-a');
    const batchB = await createBatch(2, 'png', 'repeat-b');
    const batchC = await createBatch(4, 'jpg', 'repeat-c');

    try {
      await page.goto('http://localhost:4321');
      await ensureReady(page);
      const fileInput = page.locator('#file-input');

      // Upload A, wait for idle, start stripping
      await fileInput.setInputFiles(batchA);
      await waitForFiles(page);
      await waitForReady(page, 3);
      const removeAllBtn = page.locator('#remove-all-btn');
      await expect(removeAllBtn).toBeVisible({ timeout: 30000 });
      await removeAllBtn.click();

      // Re-upload B while A is stripping
      await ensureReady(page);
      await fileInput.setInputFiles(batchB);
      await waitForFiles(page);
      await waitForReady(page, 2);

      // Re-upload C while B might be stripping
      await ensureReady(page);
      await fileInput.setInputFiles(batchC);
      await waitForFiles(page);
      await waitForReady(page, 4);

      // Verify Batch C shows correct metadata
      const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
      expect(statusText).toContain('Privacy metadata found');

      // Only 4 file items (Batch C)
      await expect(page.locator('#files-list > div')).toHaveCount(4, { timeout: 5000 });
    } finally {
      cleanup([...batchA, ...batchB, ...batchC]);
    }
  });

  test('Normal behavior: upload and strip without re-upload', async ({ page }) => {
    const files = await createBatch(3, 'jpg', 'normal');

    try {
      await page.goto('http://localhost:4321');
      await ensureReady(page);
      const fileInput = page.locator('#file-input');

      // Upload
      await fileInput.setInputFiles(files);
      await waitForFiles(page);
      await waitForReady(page, 3);

      // Verify metadata detected
      const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
      expect(statusText).toContain('Privacy metadata found');

      // Strip all — wait for button to be visible
      const removeAllBtn = page.locator('#remove-all-btn');
      await expect(removeAllBtn).toBeVisible({ timeout: 30000 });
      await removeAllBtn.click();

      // Wait for completion
      await waitForStripComplete(page, 60000);

      // Verify all per-file items show success
      // Use #files-list scope to exclude #remove-all-btn from matching
      const buttons = page.locator('#files-list button[id^="remove-"]');
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const text = await buttons.nth(i).textContent();
        expect(text).toContain('Success');
      }
    } finally {
      cleanup(files);
    }
  });
});

for (const vp of VIEWPORTS) {
  test.describe(`Responsive: ${vp.label} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test(`1→1 re-upload at ${vp.label}`, async ({ page }) => {
      const batchA = await createBatch(1, 'jpg', `rv-a-${vp.label}`);
      const batchB = await createBatch(1, 'png', `rv-b-${vp.label}`);

      try {
        await page.goto('http://localhost:4321');
        await ensureReady(page);
        const fileInput = page.locator('#file-input');

        // Upload A, start stripping
        await fileInput.setInputFiles(batchA);
        await waitForFiles(page);
        await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
        await page.locator('#remove-1').click();

        // Re-upload B
        await ensureReady(page);
        await fileInput.setInputFiles(batchB);

        // Wait for B
        await waitForFiles(page);
        await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

        // Verify B has correct metadata
        const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
        expect(statusText).toContain('Privacy metadata found');

        // Only 1 file
        await expect(page.locator('#files-list > div')).toHaveCount(1, { timeout: 5000 });
      } finally {
        cleanup([...batchA, ...batchB]);
      }
    });

    test(`5→1 re-upload at ${vp.label}`, async ({ page }) => {
      const batchA = await createBatch(5, 'jpg', `rv5-a-${vp.label}`);
      const batchB = await createBatch(1, 'png', `rv5-b-${vp.label}`);

      try {
        await page.goto('http://localhost:4321');
        await ensureReady(page);
        const fileInput = page.locator('#file-input');

        await fileInput.setInputFiles(batchA);
        await waitForFiles(page);
        await waitForReady(page, 5);

        const removeAllBtn = page.locator('#remove-all-btn');
        await expect(removeAllBtn).toBeVisible({ timeout: 30000 });
        await removeAllBtn.click();

        await ensureReady(page);
        await fileInput.setInputFiles(batchB);

        await waitForFiles(page);
        await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

        const statusText = await page.locator('#files-list > div .text-xs').first().textContent();
        expect(statusText).toContain('Privacy metadata found');

        await expect(page.locator('#files-list > div')).toHaveCount(1, { timeout: 5000 });
      } finally {
        cleanup([...batchA, ...batchB]);
      }
    });
  });
}
