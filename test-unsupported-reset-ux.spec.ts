/**
 * Focused coverage for the unsupported-file reset UX.
 *
 * Before the fix: uploading only unsupported files produced the validation error
 * banner but left `fileItems` empty, so #results-panel (and therefore #reset-btn,
 * the only reset control) stayed hidden. The user could not clear the error.
 *
 * After the fix: #upload-error carries its own dismiss control which delegates to
 * the existing resetTool(). These tests pin the required flows: one unsupported
 * file, several unsupported files, valid + unsupported mixed, reset after an
 * error, and a valid upload after that reset.
 */
import { test, expect, type Page } from '@playwright/test';
import { existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(process.cwd(), 'audit-fixtures-out');
mkdirSync(TMP, { recursive: true });

const fileInput = (page: Page) => page.locator('input[type="file"]');
const uploadError = (page: Page) => page.locator('#upload-error');
const dismissBtn = (page: Page) => page.locator('#dismiss-upload-error-btn');

/** A real JPEG from the repo's audit fixtures, copied into the temp dir. */
function validJpeg(name: string): string {
  const dest = join(TMP, name);
  copyFileSync(join(TMP, 'audit-comprehensive.jpg'), dest);
  return dest;
}

/** A file that is genuinely not a supported image type. */
function unsupportedFile(name: string, content: string): string {
  const dest = join(TMP, name);
  writeFileSync(dest, content);
  return dest;
}

async function openHome(page: Page): Promise<void> {
  await page.goto('http://localhost:4321/en/');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 20000 });
}

test.describe('unsupported-file error can always be dismissed', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !existsSync(join(TMP, 'audit-comprehensive.jpg')),
      'audit-comprehensive.jpg not generated - run the audit fixture suite first',
    );
    await openHome(page);
  });

  test('a single unsupported file shows an error that the user can dismiss', async ({ page }) => {
    const bad = unsupportedFile('ux-unsupported-one.txt', 'not an image at all');

    page.on('console', (m) => console.log('C:', m.type(), m.text()));
    page.on('pageerror', (e) => console.log('PE:', e.message));
    await fileInput(page).setInputFiles(bad);
    console.log('after1500:', await page.locator('#upload-error').getAttribute('class'));
    await expect(uploadError(page)).toBeVisible({ timeout: 15000 });
    await expect(uploadError(page)).toContainText('Unsupported file type');
    await expect(page.locator('#results-panel')).toBeHidden();

    // The reset control in the hidden results panel is unreachable, which is
    // precisely why the banner needs its own.
    await expect(page.locator('#reset-btn')).toBeHidden();
    await expect(dismissBtn(page)).toBeVisible();

    await dismissBtn(page).click();
    await expect(uploadError(page)).toBeHidden();
    await expect(page.locator('#results-panel')).toBeHidden();
  });

  test('several unsupported files are all reported and dismissed at once', async ({ page }) => {
    const a = unsupportedFile('ux-unsupported-a.txt', 'aaa');
    const b = unsupportedFile('ux-unsupported-b.bin', 'bbb');
    const c = unsupportedFile('ux-unsupported-c.doc', 'ccc');

    await fileInput(page).setInputFiles([a, b, c]);
    await expect(uploadError(page)).toBeVisible({ timeout: 15000 });
    const text = page.locator('#upload-error-text');
    await expect(text).toContainText('ux-unsupported-a.txt');
    await expect(text).toContainText('ux-unsupported-b.bin');
    await expect(text).toContainText('ux-unsupported-c.doc');

    await dismissBtn(page).click();
    await expect(uploadError(page)).toBeHidden();
  });

  test('a mixed valid + unsupported upload still works and resets normally', async ({ page }) => {
    const good = validJpeg('ux-mixed-valid.jpg');
    const bad = unsupportedFile('ux-mixed-bad.txt', 'nope');

    await fileInput(page).setInputFiles([good, bad]);
    // The valid file is processed normally...
    await expect(page.locator('#results-panel')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
    // ...and the rejected file is reported alongside it.
    await expect(uploadError(page)).toBeVisible();
    await expect(uploadError(page)).toContainText('ux-mixed-bad.txt');

    // The normal in-panel reset must keep working exactly as before.
    await expect(page.locator('#reset-btn')).toBeVisible();
    await page.locator('#reset-btn').click();
    await expect(page.locator('#results-panel')).toBeHidden();
    await expect(uploadError(page)).toBeHidden();
  });

  test('a valid upload succeeds after the error was dismissed', async ({ page }) => {
    const bad = unsupportedFile('ux-then-good-bad.txt', 'still not an image');
    await fileInput(page).setInputFiles(bad);
    await expect(uploadError(page)).toBeVisible({ timeout: 15000 });

    await dismissBtn(page).click();
    await expect(uploadError(page)).toBeHidden();

    // The tool must be fully usable again, not stuck in the error state.
    await fileInput(page).setInputFiles(validJpeg('ux-then-good.jpg'));
    await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
    await expect(uploadError(page)).toBeHidden();

    // And the full remove -> download flow still completes.
    await page.locator('#remove-1').click();
    await expect(page.locator('[data-id="1"] .text-xs.mt-1'))
      .toContainText('Privacy metadata remaining: 0', { timeout: 40000 });
    await expect(page.locator('#download-1')).toBeEnabled({ timeout: 20000 });
  });

  test('dismissing the banner leaves no stale progress stepper', async ({ page }) => {
    const bad = unsupportedFile('ux-stale-bad.txt', 'x');
    await fileInput(page).setInputFiles(bad);
    await expect(uploadError(page)).toBeVisible({ timeout: 15000 });
    await dismissBtn(page).click();
    // resetTool() hides the stepper with the banner; a stale visible stepper
    // would claim a scan is still running.
    await expect(page.locator('#progress-steps')).toBeHidden();
    await expect(page.locator('#processing-status')).toBeHidden();
  });

  test('the dismiss control is keyboard reachable and has a real label', async ({ page }) => {
    const bad = unsupportedFile('ux-a11y-bad.txt', 'x');
    await fileInput(page).setInputFiles(bad);
    await expect(uploadError(page)).toBeVisible({ timeout: 15000 });

    const label = await dismissBtn(page).getAttribute('aria-label');
    expect(label, 'the dismiss control needs an accessible name').toBeTruthy();
    expect(label, 'the raw locale key must not leak into the UI').not.toContain('dismiss_error');

    // Keyboard activation must work (Enter on a focused button).
    await dismissBtn(page).focus();
    await page.keyboard.press('Enter');
    await expect(uploadError(page)).toBeHidden();
  });
});