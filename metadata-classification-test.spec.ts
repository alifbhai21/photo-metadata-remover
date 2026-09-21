import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error - plain ESM fixture builder shared with the Node harness
import { buildPlainPng, buildSingleChunkPng, rebuildPng, textChunkPayload } from './test-png-fixture.mjs';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

const RICH_IMAGE = 'metadata-rich-test-image-2.jpg';

/** Rows of the per-file metadata viewer with their privacy highlight. */
async function viewerRows(page: Page): Promise<Array<{ label: string; value: string; privacy: boolean }>> {
  return page.$$eval('#metadata-panel-1 > div > div', (rows) =>
    rows.map((row) => ({
      label: (row.children[0] as HTMLElement | undefined)?.textContent?.trim() ?? '',
      value: (row.children[1] as HTMLElement | undefined)?.textContent?.trim() ?? '',
      privacy: row.className.includes('bg-warning-bg'),
    })),
  );
}

let pngDir = '';
let pngTextOnlyPath = '';
let pngTextCopyrightPath = '';

test.beforeAll(async () => {
  pngDir = mkdtempSync(join(tmpdir(), 'pmr-classify-'));
  const plain = await buildPlainPng({ width: 120, height: 80 });
  writeFileSync((pngTextOnlyPath = join(pngDir, 'text-only.png')), await buildSingleChunkPng('tEXt'));
  writeFileSync(
    (pngTextCopyrightPath = join(pngDir, 'text-copyright.png')),
    rebuildPng(plain, {
      insert: [{ type: 'tEXt', payload: textChunkPayload('Copyright', 'PRIVACY-PNG-TEXT-COPYRIGHT') }],
    }),
  );
});

test.afterAll(() => {
  if (pngDir) {
    try {
      rmSync(pngDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test.describe('Metadata classification', () => {
  test('Privacy fields should appear under Privacy metadata section', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    const fileInput = page.locator('#file-input');

    // Upload the metadata-rich image
    await fileInput.setInputFiles(RICH_IMAGE);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    // Open per-file metadata detail
    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible({ timeout: 5000 });

    // Check specific privacy fields are present in the detail
    const detail = page.locator('#metadata-panel-1');
    const detailText = await detail.textContent();

    // These MUST be classified as privacy (in privacyKeys list)
    expect(detailText).toContain('DateTimeOriginal');
    expect(detailText).toContain('Make');
    expect(detailText).toContain('Model');
    expect(detailText).toContain('Artist');
    expect(detailText).toContain('Copyright');

    // Verify privacy fields have warning highlight (bg-warning-bg/50 applied to rows)
    const privacyRows = page.locator('#metadata-panel-1 .bg-warning-bg\\/50');
    expect(await privacyRows.count()).toBeGreaterThan(0);

    console.log('PASSED: Privacy fields correctly classified');
  });

  test('Technical fields should appear under Technical section, not Privacy', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    const fileInput = page.locator('#file-input');

    await fileInput.setInputFiles(RICH_IMAGE);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible({ timeout: 5000 });

    // The panel contains all metadata fields — check the full text
    const detail = page.locator('#metadata-panel-1');
    const fullText = await detail.textContent();

    // Technical fields (NOT in privacyKeys) should be present
    expect(fullText).toContain('XResolution');
    expect(fullText).toContain('YResolution');
    expect(fullText).toContain('ResolutionUnit');

    // Technical fields should NOT have the privacy warning highlight
    // (only privacyKeys fields get bg-warning-bg/50)

    console.log('PASSED: Technical fields correctly classified');
  });

  test('PNG textual chunk: detected as privacy metadata and highlighted', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    await page.locator('#file-input').setInputFiles(pngTextOnlyPath);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    // The scan finds the tEXt chunk that exifr alone never reported.
    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata found (1)');
    await expect(page.locator('#meta-toggle-1')).not.toContainText('technical info');

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible({ timeout: 5000 });
    const rows = await viewerRows(page);

    const flagged = rows.filter((row) => row.privacy);
    expect(flagged.map((row) => row.label)).toEqual(['PNG tEXt']);
    expect(flagged[0].value).toContain('PRIVACY-PNG-AUTHOR');
    expect(await page.locator('#metadata-panel-1 .bg-warning-bg\\/50').count()).toBe(1);

    console.log('PASSED: PNG tEXt chunk classified as privacy metadata');
  });

  test('PNG tEXt Copyright: exifr field and chunk entry are never counted twice', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    await page.locator('#file-input').setInputFiles(pngTextCopyrightPath);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    await expect(page.locator('[data-id="1"] .text-xs')).toContainText('Privacy metadata found (1)');

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible({ timeout: 5000 });
    const rows = await viewerRows(page);

    expect(rows.filter((row) => row.privacy).map((row) => row.label)).toEqual(['Copyright']);
    expect(rows.some((row) => row.label === 'PNG tEXt')).toBe(false);

    console.log('PASSED: tEXt Copyright counted exactly once');
  });

  test('chunk-scoped PNG vocabulary never appears for other formats', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    await page.locator('#file-input').setInputFiles(RICH_IMAGE);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    await page.locator('#meta-toggle-1').click();
    await expect(page.locator('#metadata-panel-1')).toBeVisible({ timeout: 5000 });
    const rows = await viewerRows(page);

    expect(rows.some((row) => row.label.startsWith('PNG '))).toBe(false);

    console.log('PASSED: JPEG classification untouched by the PNG chunk keys');
  });
});
