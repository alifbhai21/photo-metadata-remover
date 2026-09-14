import { test, expect, type Page } from '@playwright/test';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

const TEST_IMAGE = 'test-original.jpg';

test.describe('Stale-state bug — alternative scenarios', () => {
  test('Clean single file → reset → re-upload should show metadata', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    const fileInput = page.locator('#file-input');

    // Upload
    await fileInput.setInputFiles(TEST_IMAGE);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    // Clean via individual button (remove-all-btn is hidden for single files)
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 15000 });

    // Reset
    await page.locator('#reset-btn').click();
    await expect(page.locator('#results-panel')).toBeHidden({ timeout: 5000 });

    // Re-upload same file
    await ensureReady(page);
    await fileInput.setInputFiles(TEST_IMAGE);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Privacy metadata found', { timeout: 10000 });

    console.log('PASSED');
  });

  test('Clean without reset → re-upload should show metadata', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    const fileInput = page.locator('#file-input');

    // Upload
    await fileInput.setInputFiles(TEST_IMAGE);
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    // Clean the file
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 15000 });

    // Clear input then re-upload same file — setInputFiles with the same
    // value won't fire 'change', so we clear first to simulate a new selection.
    // handleFiles() now clears filesList.innerHTML immediately, preventing
    // old "✓ Success" DOM from lingering during async metadata parsing.
    await ensureReady(page);
    await fileInput.setInputFiles([]);
    await fileInput.setInputFiles(TEST_IMAGE);

    // Wait for NEW DOM: the button should change from "✓ Success" back to "Remove metadata"
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Privacy metadata found', { timeout: 10000 });

    console.log('PASSED');
  });

  test('Auto-strip scenario: file with metadata should NOT auto-strip', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    const fileInput = page.locator('#file-input');

    // Upload the test-original.jpg which has metadata
    await fileInput.setInputFiles(TEST_IMAGE);

    // Wait for metadata detection — button should say "Remove metadata"
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Privacy metadata found', { timeout: 10000 });

    console.log('PASSED: auto-strip did not fire incorrectly');
  });

  test('Rapid re-upload: upload → clean → reset → immediate re-upload', async ({ page }) => {
    await page.goto('http://localhost:4321/en');
    await ensureReady(page);
    const fileInput = page.locator('#file-input');

    // Upload
    await fileInput.setInputFiles(TEST_IMAGE);
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });

    // Clean
    await page.locator('#remove-1').click();
    await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 15000 });

    // Reset and immediately re-upload (no waiting)
    await page.locator('#reset-btn').click();
    await ensureReady(page);
    await fileInput.setInputFiles(TEST_IMAGE);

    // Should detect metadata again
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
    await expect(page.locator('#files-list > div .text-xs').first()).toContainText('Privacy metadata found', { timeout: 10000 });

    console.log('PASSED');
  });
});
