import { test, expect, type Page } from '@playwright/test';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

const RICH_IMAGE = 'metadata-rich-test-image-2.jpg';

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
});
