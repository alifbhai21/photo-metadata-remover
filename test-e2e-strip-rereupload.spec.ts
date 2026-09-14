/**
 * E2E test: Upload → strip → download → re-upload → verify badge
 *
 * Tests the FULL browser pipeline including canvas re-encode.
 * Runs against the live dev server at localhost:4321.
 */
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import sharp from 'sharp';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

const TEST_IMAGE_DIR = 'clean-verify';

test.describe('Metadata strip + re-upload E2E', () => {

  test('PNG: upload → strip → download → re-upload shows no privacy metadata', async ({ page }) => {
    // 1. Create a test PNG with privacy metadata
    const exifPNG = { IFD0: { Make: 'TestMakeE2E', Model: 'TestModelE2E', DateTime: '2024:02:20 14:00:00' } };
    const pngBuf = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 10, g: 220, b: 10, alpha: 1 } }
    })
      .png()
      .withExifMerge(exifPNG)
      .toBuffer();

    const pngPath = `${TEST_IMAGE_DIR}-e2e-test.png`;
    writeFileSync(pngPath, pngBuf);

    // 2. Navigate to the app
    await page.goto('http://localhost:4321');
    await ensureReady(page);

    // 3. Upload the PNG via file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pngPath);

    // 4. Wait for the file item to appear — status div with "Privacy metadata found"
    await expect(page.locator('div.text-xs:has-text("Privacy metadata found")')).toBeVisible({ timeout: 15000 });

    // 5. Verify initial badge: "Privacy metadata found (N)" where N > 0
    const initialStatus = page.locator('div.text-xs:has-text("Privacy metadata found")').first();
    await expect(initialStatus).toContainText(/Privacy metadata found \(\d+\)/);

    // 6. Click "Remove metadata" button
    const removeBtn = page.locator('button:has-text("Remove metadata")').first();
    await removeBtn.click();

    // 7. Wait for strip to complete — status should show success
    await expect(page.locator('div.text-success-text:has-text("Metadata removed successfully")')).toBeVisible({ timeout: 20000 });

    // 8. Verify "Privacy metadata remaining: 0"
    await expect(page.locator(':has-text("Privacy metadata remaining")').first()).toContainText('0');

    // 9. Download the clean file
    const downloadPromise = page.waitForEvent('download');
    const downloadBtn = page.locator('button:has-text("Download clean image")').first();
    await downloadBtn.click();
    const download = await downloadPromise;
    const cleanPath = `${TEST_IMAGE_DIR}-e2e-clean.png`;
    await download.saveAs(cleanPath);

    // 10. Re-upload the clean file
    await ensureReady(page);
    await fileInput.setInputFiles(cleanPath);

    // 11. Wait for re-scan — should show "No privacy metadata found" (not "Privacy metadata found")
    await expect(page.locator('div.text-xs:has-text("No privacy metadata found")')).toBeVisible({ timeout: 15000 });

    // 12. Verify the badge is NOT "Privacy metadata found"
    const reuploadStatus = page.locator('div.text-xs').first();
    const reuploadText = await reuploadStatus.textContent();
    console.log(`Re-upload status text: "${reuploadText}"`);
    expect(reuploadText).not.toContain('Privacy metadata found');
  });

  test('JPEG: upload → strip → download → re-upload shows no privacy metadata', async ({ page }) => {
    // 1. Create a test JPEG with privacy metadata
    const exifJPEG = { IFD0: { Make: 'TestMakeE2E', Model: 'TestModelE2E', DateTime: '2024:01:15 12:30:45' } };
    const jpegBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 220, g: 10, b: 10 } }
    })
      .jpeg()
      .withExifMerge(exifJPEG)
      .toBuffer();

    const jpegPath = `${TEST_IMAGE_DIR}-e2e-test.jpg`;
    writeFileSync(jpegPath, jpegBuf);

    // 2. Navigate to the app
    await page.goto('http://localhost:4321');
    await ensureReady(page);

    // 3. Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(jpegPath);

    // 4. Wait for "Privacy metadata found"
    await expect(page.locator('div.text-xs:has-text("Privacy metadata found")')).toBeVisible({ timeout: 15000 });

    // 5. Click "Remove metadata"
    const removeBtn = page.locator('button:has-text("Remove metadata")').first();
    await removeBtn.click();

    // 6. Wait for success
    await expect(page.locator('div.text-success-text:has-text("Metadata removed successfully")')).toBeVisible({ timeout: 20000 });

    // 7. Download
    const downloadPromise = page.waitForEvent('download');
    const downloadBtn = page.locator('button:has-text("Download clean image")').first();
    await downloadBtn.click();
    const download = await downloadPromise;
    const cleanPath = `${TEST_IMAGE_DIR}-e2e-clean.jpg`;
    await download.saveAs(cleanPath);

    // 8. Re-upload the clean file
    await ensureReady(page);
    await fileInput.setInputFiles(cleanPath);

    // 9. Wait for re-scan — should show "No privacy metadata found"
    await expect(page.locator('div.text-xs:has-text("No privacy metadata found")')).toBeVisible({ timeout: 15000 });

    // 10. Verify badge
    const reuploadStatus = page.locator('div.text-xs').first();
    const reuploadText = await reuploadStatus.textContent();
    console.log(`Re-upload status text: "${reuploadText}"`);
    expect(reuploadText).not.toContain('Privacy metadata found');
  });

  test('WebP: upload → strip → download → re-upload shows no privacy metadata', async ({ page }) => {
    // 1. Create a test WebP with privacy metadata
    const exifWebP = { IFD0: { Make: 'TestMakeE2E', Model: 'TestModelE2E' } };
    const webpBuf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 10, g: 10, b: 220 } }
    })
      .webp()
      .withExifMerge(exifWebP)
      .toBuffer();

    const webpPath = `${TEST_IMAGE_DIR}-e2e-test.webp`;
    writeFileSync(webpPath, webpBuf);

    // 2. Navigate to the app
    await page.goto('http://localhost:4321');
    await ensureReady(page);

    // 3. Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(webpPath);

    // 4. Wait for "Privacy metadata found"
    await expect(page.locator('div.text-xs:has-text("Privacy metadata found")')).toBeVisible({ timeout: 15000 });

    // 5. Click "Remove metadata"
    const removeBtn = page.locator('button:has-text("Remove metadata")').first();
    await removeBtn.click();

    // 6. Wait for success
    await expect(page.locator('div.text-success-text:has-text("Metadata removed successfully")')).toBeVisible({ timeout: 20000 });

    // 7. Download
    const downloadPromise = page.waitForEvent('download');
    const downloadBtn = page.locator('button:has-text("Download clean image")').first();
    await downloadBtn.click();
    const download = await downloadPromise;
    const cleanPath = `${TEST_IMAGE_DIR}-e2e-clean.webp`;
    await download.saveAs(cleanPath);

    // 8. Re-upload the clean file
    await ensureReady(page);
    await fileInput.setInputFiles(cleanPath);

    // 9. Wait for re-scan — should show "No privacy metadata found"
    await expect(page.locator('div.text-xs:has-text("No privacy metadata found")')).toBeVisible({ timeout: 15000 });

    // 10. Verify badge
    const reuploadStatus = page.locator('div.text-xs').first();
    const reuploadText = await reuploadStatus.textContent();
    console.log(`Re-upload status text: "${reuploadText}"`);
    expect(reuploadText).not.toContain('Privacy metadata found');
  });
});
