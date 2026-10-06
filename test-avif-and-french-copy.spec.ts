/**
 * Focused coverage for two product decisions that the audit flagged as
 * ambiguous, so neither can drift silently:
 *
 * 1. AVIF is UNSUPPORTED and must stay that way. `isAvifFile()` exists in
 *    ToolUpload.astro but is NOT AVIF support: it is a mislabel guard that runs
 *    only for a file that already passed isHeicFile() on a .heic/.heif name.
 *    AVIF is absent from VALID_TYPES and from the `accept` attribute, so a real
 *    .avif upload must be rejected as unsupported.
 * 2. The French brand wording is "Suppresseur", not "Supprimeur".
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fileInput = (page: Page) => page.locator('input[type="file"]');

async function openHome(page: Page, path = 'http://localhost:4321/en/'): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('body[data-pmr-ready]', { timeout: 20000 });
}

/** A minimal but genuine ISO-BMFF file with the `avif` brand in its ftyp box. */
function avifBytes(): Buffer {
  const box = (type: string, ...payload: number[]) => {
    const body = Buffer.from(payload);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length + 8, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body]);
  };
  // ftyp: major brand 'avif', minor version 0, compatible brands avif/mif1.
  return box('ftyp',
    0x61, 0x76, 0x69, 0x66, // 'avif'
    0x00, 0x00, 0x00, 0x00, // minor version
    0x61, 0x76, 0x69, 0x66, // compatible 'avif'
    0x6d, 0x69, 0x66, 0x31, // compatible 'mif1'
  );
}

test.describe('AVIF is intentionally unsupported', () => {
  test('a .avif upload is rejected as unsupported and no file is processed', async ({ page }) => {
    const path = join(process.cwd(), 'audit-fixtures-out', 'ux-unsupported.avif');
    writeFileSync(path, avifBytes());

    await openHome(page);
    await fileInput(page).setInputFiles(path);

    // The product states the supported set and AVIF is not in it.
    await expect(page.locator('#upload-error')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#upload-error')).toContainText('ux-unsupported.avif');
    // Nothing entered the pipeline: no file row, no download, no ZIP.
    await expect(page.locator('#results-panel')).toBeHidden();
    await expect(page.locator('#files-list > div')).toHaveCount(0);
    await expect(page.locator('#download-all-btn')).toBeHidden();
  });

  test('the advertised supported formats never claim AVIF', async ({ page }) => {
    await openHome(page);
    const accept = await page.locator('#file-input').getAttribute('accept');
    expect(accept, 'the accept attribute must list the real supported set').toBeTruthy();
    expect(accept!.toLowerCase()).not.toContain('avif');

    // The human-readable format line must not advertise it either.
    await expect(page.locator('#upload-content')).not.toContainText(/avif/i);
  });
});

test.describe('French wording', () => {
  test('no "Supprimeur" typo survives in the French locale file', () => {
    const raw = readFileSync(join(process.cwd(), 'src', 'locales', 'fr.json'), 'utf8');
    expect(
      raw.match(/Supprimeur/g) ?? [],
      'the typo "Supprimeur" must not remain anywhere in fr.json',
    ).toEqual([]);
    expect(raw, 'the correct French wording must still be used').toContain('Suppresseur');
  });

  test('the three audited French keys use the correct spelling', () => {
    const fr = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'fr.json'), 'utf8'));
    expect(fr.seo.og_image_alt).toContain('Suppresseur');
    expect(fr.seo.home.title).toContain('Suppresseur');
    expect(fr.hero.title_a).toBe('Suppresseur de Métadonnées');
  });

  test('the rendered French homepage title, hero and OG alt are correct', async ({ page }) => {
    await openHome(page, 'http://localhost:4321/fr/');

    await expect(page).toHaveTitle(/Suppresseur de Métadonnées/);
    // The hero heading is rendered from hero.title_a + title_b.
    await expect(page.locator('h1').first()).toContainText('Suppresseur de Métadonnées');
    // And the typo must not be visible anywhere on the page.
    const body = await page.locator('body').innerText();
    expect(body, 'the typo must not render').not.toContain('Supprimeur');

    const ogAlt = await page.locator('meta[property="og:image:alt"]').getAttribute('content');
    if (ogAlt) expect(ogAlt).toContain('Suppresseur');
  });

  test('EN and DE are untouched by the French fix', () => {
    const en = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'en.json'), 'utf8'));
    const de = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'de.json'), 'utf8'));
    // They must never have carried the French word at all.
    expect(JSON.stringify(en)).not.toContain('Supprimeur');
    expect(JSON.stringify(en)).not.toContain('Suppresseur');
    expect(JSON.stringify(de)).not.toContain('Supprimeur');
    expect(JSON.stringify(de)).not.toContain('Suppresseur');
  });
});