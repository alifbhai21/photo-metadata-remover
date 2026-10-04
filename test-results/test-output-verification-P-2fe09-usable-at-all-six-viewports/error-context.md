# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-output-verification.spec.ts >> Post-removal verification of the generated output >> responsive: verification result and controls stay usable at all six viewports
- Location: test-output-verification.spec.ts:402:3

# Error details

```
Error: expect(locator).toBeInViewport() failed

Locator:  locator('[data-id="1"] .text-xs').first()
Expected: in viewport
Received: viewport ratio 0
Timeout:  5000ms

Call log:
  - Expect "toBeInViewport" with timeout 5000ms
  - waiting for locator('[data-id="1"] .text-xs').first()
    13 × locator resolved to <div class="text-xs mt-1 text-danger-text">…</div>
       - unexpected value "viewport ratio 0"

```

```yaml
- text: "✕ Verification failed: output not confirmed clean"
```

# Test source

```ts
  313 |     expect(chunkIds(downloaded)).toContain('VP8 ');
  314 |     expect(chunkIds(downloaded).filter((id: string) => id === 'EXIF' || id === 'XMP ')).toEqual([]);
  315 |     const vp8x = readVp8x(downloaded);
  316 |     expect(vp8x.exif).toBe(false);
  317 |     expect(vp8x.xmp).toBe(false);
  318 |     expect(leakedPrivacyValues(downloaded)).toEqual([]);
  319 |     const leakedKeys = await privacyKeysInBytes(downloaded, 'image/webp');
  320 |     expect(leakedKeys, `privacy keys still in the downloaded WebP: ${leakedKeys.join(', ')}`).toEqual([]);
  321 |     // The source fixture really did carry privacy metadata.
  322 |     expect(leakedPrivacyValues(new Uint8Array(webpBytes)).length).toBeGreaterThan(0);
  323 |   });
  324 | 
  325 |   test('batch: one unverifiable output does not block the other files', async ({ page }) => {
  326 |     await page.goto('http://localhost:4321/en');
  327 |     await ensureReady(page);
  328 | 
  329 |     // JPEG (verifiable) + trailer JPEG (unverifiable) + TIFF (verifiable) +
  330 |     // broken WebP (removal throws) in one batch.
  331 |     await page.locator('#file-input').setInputFiles([
  332 |       cleanJpegPath,
  333 |       trailerJpegPath,
  334 |       tiffPath,
  335 |       malformedWebpPath,
  336 |     ]);
  337 |     await expect(page.locator('#files-list > div[data-id]')).toHaveCount(4, { timeout: 30000 });
  338 |     await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
  339 |     // The auto-strip of the metadata-free trailer file must have settled first
  340 |     // (the remove-all button is only shown once busyCount is back to 0).
  341 |     await expect(page.locator('#remove-all-btn')).toBeVisible({ timeout: 30000 });
  342 | 
  343 |     await page.locator('#remove-all-btn').click();
  344 | 
  345 |     // The two verifiable files pass...
  346 |     await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
  347 |     await expect(page.locator('#remove-3')).toHaveText('✓ Success', { timeout: 30000 });
  348 |     await expect(statusOf(page, 1)).toContainText('Privacy metadata remaining: 0');
  349 |     await expect(statusOf(page, 3)).toContainText('Privacy metadata remaining: 0');
  350 |     await expect(page.locator('#download-1')).toBeEnabled();
  351 |     await expect(page.locator('#download-3')).toBeEnabled();
  352 | 
  353 |     // ...the unverifiable one is reported, never as a clean zero...
  354 |     await expect(statusOf(page, 2)).toContainText('Verification failed', { timeout: 30000 });
  355 |     await expect(statusOf(page, 2)).not.toContainText('Privacy metadata remaining: 0');
  356 |     await expect(page.locator('#download-2')).toBeDisabled();
  357 | 
  358 |     // ...and the broken file keeps the original failure/retry behaviour.
  359 |     await expect(page.locator('#remove-4')).toHaveText('Try again', { timeout: 30000 });
  360 |     await expect(statusOf(page, 4)).toContainText('Failed to remove metadata');
  361 |     await expect(page.locator('#download-4')).toBeDisabled();
  362 | 
  363 |     // Nothing is stuck processing and the batch-level state resolved.
  364 |     await expect(page.locator('#processing-status')).toHaveClass(/hidden/);
  365 | 
  366 |     // The verifiable downloads are really clean.
  367 |     const [download] = await Promise.all([
  368 |       page.waitForEvent('download'),
  369 |       page.locator('#download-1').click(),
  370 |     ]);
  371 |     const saved = join(workDir, 'batch-clean.jpg');
  372 |     await download.saveAs(saved);
  373 |     expect(await privacyKeysInBytes(readFileSync(saved), 'image/jpeg')).toEqual([]);
  374 |   });
  375 | 
  376 |   test('async: a re-upload during removal/verification never contaminates the new batch', async ({ page }) => {
  377 |     await page.goto('http://localhost:4321/en');
  378 |     await ensureReady(page);
  379 | 
  380 |     // Batch A: metadata-bearing files, so removal + verification are in flight.
  381 |     await page.locator('#file-input').setInputFiles([cleanJpegPath, trailerJpegPath, tiffPath]);
  382 | 
  383 |     // Re-upload immediately (before batch A settles).
  384 |     await ensureReady(page);
  385 |     await page.locator('#file-input').setInputFiles([]);
  386 |     await page.locator('#file-input').setInputFiles(cleanJpegPath);
  387 | 
  388 |     // Batch B resolves on its own terms...
  389 |     await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });
  390 |     await expect(statusOf(page, 1)).toContainText('Privacy metadata found', { timeout: 30000 });
  391 |     await page.locator('#remove-1').click();
  392 |     await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
  393 |     await expect(statusOf(page, 1)).toContainText('Privacy metadata remaining: 0');
  394 |     await expect(page.locator('#download-1')).toBeEnabled();
  395 |     await expect(page.locator('#processing-status')).toHaveClass(/hidden/);
  396 | 
  397 |     // ...and is not marked by the discarded batch's verification state.
  398 |     await expect(statusOf(page, 1)).not.toContainText('Verification failed');
  399 |     await expect(statusOf(page, 1)).not.toContainText('Removing');
  400 |   });
  401 | 
  402 |   test('responsive: verification result and controls stay usable at all six viewports', async ({ page }) => {
  403 |     for (const viewport of VIEWPORTS) {
  404 |       await page.setViewportSize({ width: viewport.width, height: viewport.height });
  405 |       await page.goto('http://localhost:4321/en');
  406 |       await ensureReady(page);
  407 | 
  408 |       // Dirty output: the removal runs automatically and its output cannot be
  409 |       // verified as clean, so the failure line must render and stay readable.
  410 |       await uploadAndAwait(page, trailerJpegPath, 'Verification failed');
  411 |       const dirtyStatus = statusOf(page, 1);
  412 |       await expect(dirtyStatus).toBeVisible();
> 413 |       await expect(dirtyStatus).toBeInViewport();
      |                                 ^ Error: expect(locator).toBeInViewport() failed
  414 |       await expect(dirtyStatus).not.toContainText('Privacy metadata remaining: 0');
  415 |       await expect(page.locator('#download-1')).toBeDisabled();
  416 |       await page.locator('#remove-1').scrollIntoViewIfNeeded();
  417 |       await expect(page.locator('#remove-1')).toBeInViewport();
  418 | 
  419 |       let overflow = await page.evaluate(() => ({
  420 |         scrollWidth: document.documentElement.scrollWidth,
  421 |         clientWidth: document.documentElement.clientWidth,
  422 |       }));
  423 |       expect(
  424 |         overflow.scrollWidth,
  425 |         `${viewport.label} (${viewport.width}x${viewport.height}) overflows horizontally on failure`,
  426 |       ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  427 | 
  428 |       // Verified output: a metadata-free upload is auto-cleaned, verified, and
  429 |       // its count + download must stay usable.
  430 |       await uploadAndAwait(page, plainJpegPath, 'Metadata removed successfully');
  431 |       const verifiedStatus = statusOf(page, 1);
  432 |       await expect(verifiedStatus).toContainText('Privacy metadata remaining: 0');
  433 |       await expect(verifiedStatus).toBeVisible();
  434 |       await expect(page.locator('#remove-1')).toHaveText('✓ Success');
  435 |       const downloadBtn = page.locator('#download-1');
  436 |       await expect(downloadBtn).toBeEnabled();
  437 |       await expect(downloadBtn).toBeInViewport();
  438 | 
  439 |       overflow = await page.evaluate(() => ({
  440 |         scrollWidth: document.documentElement.scrollWidth,
  441 |         clientWidth: document.documentElement.clientWidth,
  442 |       }));
  443 |       expect(
  444 |         overflow.scrollWidth,
  445 |         `${viewport.label} (${viewport.width}x${viewport.height}) overflows horizontally when verified`,
  446 |       ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  447 |     }
  448 |   });
  449 | });
```