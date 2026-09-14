import { test, type Page } from '@playwright/test';
import { writeFileSync } from 'fs';
import sharp from 'sharp';

async function ensureReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 10000 });
}

test('inspect DOM', async ({ page }) => {
  // Create test PNG
  const exifPNG = { IFD0: { Make: 'TestMake', Model: 'TestModel' } };
  const pngBuf = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 10, g: 220, b: 10, alpha: 1 } }
  }).png().withExifMerge(exifPNG).toBuffer();
  writeFileSync('clean-verify-inspect.png', pngBuf);

  await page.goto('http://localhost:4321');
  await ensureReady(page);

  // Screenshot before upload
  await page.screenshot({ path: 'debug-before.png', fullPage: true });

  // Upload
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('clean-verify-inspect.png');

  // Wait a bit for processing
  await page.waitForTimeout(5000);

  // Screenshot after upload
  await page.screenshot({ path: 'debug-after-upload.png', fullPage: true });

  // Dump the HTML of the results area
  const html = await page.evaluate(() => document.body.innerHTML);
  writeFileSync('debug-dom.html', html);

  // Try to find any elements with text about metadata
  const allText = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    const results = [];
    for (const el of els) {
      const text = el.textContent?.trim();
      if (text && (text.includes('metadata') || text.includes('Privacy') || text.includes('Remove') || text.includes('Download'))) {
        results.push({ tag: el.tagName, class: el.className, text: text.slice(0, 100) });
      }
    }
    return results;
  });
  console.log('Elements with metadata/privacy/remove/download text:', JSON.stringify(allText, null, 2));
});
