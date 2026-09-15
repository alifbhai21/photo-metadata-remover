# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test-output-verification.spec.ts >> Post-removal verification of the generated output >> responsive: verification result and controls stay usable at all six viewports
- Location: test-output-verification.spec.ts:375:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('#remove-1')
    - locator resolved to <button id="remove-1" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] bg-accent-btn text-accent-btn-text rounded-full font-medium hover:bg-accent-btn-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Remove metadata</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div id="nav-fit" class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-20 flex flex-nowrap items-center justify-between gap-2 sm:gap-4">…</div> from <nav aria-label="Primary" class="sticky top-0 left-0 right-0 z-50 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/30 relative">…</nav> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
  - element was detached from the DOM, retrying

```

# Test source

```ts
  310 |     await expect(page.locator('#files-list > div[data-id]')).toHaveCount(4, { timeout: 30000 });
  311 |     await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
  312 |     // The auto-strip of the metadata-free trailer file must have settled first
  313 |     // (the remove-all button is only shown once busyCount is back to 0).
  314 |     await expect(page.locator('#remove-all-btn')).toBeVisible({ timeout: 30000 });
  315 | 
  316 |     await page.locator('#remove-all-btn').click();
  317 | 
  318 |     // The two verifiable files pass...
  319 |     await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
  320 |     await expect(page.locator('#remove-3')).toHaveText('✓ Success', { timeout: 30000 });
  321 |     await expect(statusOf(page, 1)).toContainText('Privacy metadata remaining: 0');
  322 |     await expect(statusOf(page, 3)).toContainText('Privacy metadata remaining: 0');
  323 |     await expect(page.locator('#download-1')).toBeEnabled();
  324 |     await expect(page.locator('#download-3')).toBeEnabled();
  325 | 
  326 |     // ...the unverifiable one is reported, never as a clean zero...
  327 |     await expect(statusOf(page, 2)).toContainText('Verification failed', { timeout: 30000 });
  328 |     await expect(statusOf(page, 2)).not.toContainText('Privacy metadata remaining: 0');
  329 |     await expect(page.locator('#download-2')).toBeDisabled();
  330 | 
  331 |     // ...and the broken file keeps the original failure/retry behaviour.
  332 |     await expect(page.locator('#remove-4')).toHaveText('Try again', { timeout: 30000 });
  333 |     await expect(statusOf(page, 4)).toContainText('Failed to remove metadata');
  334 |     await expect(page.locator('#download-4')).toBeDisabled();
  335 | 
  336 |     // Nothing is stuck processing and the batch-level state resolved.
  337 |     await expect(page.locator('#processing-status')).toHaveClass(/hidden/);
  338 | 
  339 |     // The verifiable downloads are really clean.
  340 |     const [download] = await Promise.all([
  341 |       page.waitForEvent('download'),
  342 |       page.locator('#download-1').click(),
  343 |     ]);
  344 |     const saved = join(workDir, 'batch-clean.jpg');
  345 |     await download.saveAs(saved);
  346 |     expect(await privacyKeysInBytes(readFileSync(saved), 'image/jpeg')).toEqual([]);
  347 |   });
  348 | 
  349 |   test('async: a re-upload during removal/verification never contaminates the new batch', async ({ page }) => {
  350 |     await page.goto('http://localhost:4321/en');
  351 |     await ensureReady(page);
  352 | 
  353 |     // Batch A: metadata-bearing files, so removal + verification are in flight.
  354 |     await page.locator('#file-input').setInputFiles([cleanJpegPath, trailerJpegPath, tiffPath]);
  355 | 
  356 |     // Re-upload immediately (before batch A settles).
  357 |     await ensureReady(page);
  358 |     await page.locator('#file-input').setInputFiles([]);
  359 |     await page.locator('#file-input').setInputFiles(cleanJpegPath);
  360 | 
  361 |     // Batch B resolves on its own terms...
  362 |     await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });
  363 |     await expect(statusOf(page, 1)).toContainText('Privacy metadata found', { timeout: 30000 });
  364 |     await page.locator('#remove-1').click();
  365 |     await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
  366 |     await expect(statusOf(page, 1)).toContainText('Privacy metadata remaining: 0');
  367 |     await expect(page.locator('#download-1')).toBeEnabled();
  368 |     await expect(page.locator('#processing-status')).toHaveClass(/hidden/);
  369 | 
  370 |     // ...and is not marked by the discarded batch's verification state.
  371 |     await expect(statusOf(page, 1)).not.toContainText('Verification failed');
  372 |     await expect(statusOf(page, 1)).not.toContainText('Removing');
  373 |   });
  374 | 
  375 |   test('responsive: verification result and controls stay usable at all six viewports', async ({ page }) => {
  376 |     for (const viewport of VIEWPORTS) {
  377 |       await page.setViewportSize({ width: viewport.width, height: viewport.height });
  378 |       await page.goto('http://localhost:4321/en');
  379 |       await ensureReady(page);
  380 | 
  381 |       // Dirty output: the verification failure must render and stay readable.
  382 |       await page.locator('#file-input').setInputFiles(trailerJpegPath);
  383 |       await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });
  384 |       const dirtyStatus = statusOf(page, 1);
  385 |       await expect(dirtyStatus).toContainText('Verification failed', { timeout: 30000 });
  386 |       await expect(dirtyStatus).toBeVisible();
  387 |       await expect(dirtyStatus).toBeInViewport();
  388 |       await expect(page.locator('#download-1')).toBeDisabled();
  389 |       await page.locator('#remove-1').scrollIntoViewIfNeeded();
  390 |       await expect(page.locator('#remove-1')).toBeInViewport();
  391 | 
  392 |       let overflow = await page.evaluate(() => ({
  393 |         scrollWidth: document.documentElement.scrollWidth,
  394 |         clientWidth: document.documentElement.clientWidth,
  395 |       }));
  396 |       expect(
  397 |         overflow.scrollWidth,
  398 |         `${viewport.label} (${viewport.width}x${viewport.height}) overflows horizontally on failure`,
  399 |       ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  400 | 
  401 |       // Clean output: the verified count and the download must stay usable.
  402 |       await page.locator('#reset-btn').click();
  403 |       await expect(page.locator('#results-panel')).toBeHidden({ timeout: 10000 });
  404 |       await page.locator('#file-input').setInputFiles(cleanJpegPath);
  405 |       await expect(page.locator('#files-list > div[data-id]')).toHaveCount(1, { timeout: 30000 });
  406 |       await expect(page.locator('#remove-1')).toHaveText('Remove metadata', { timeout: 30000 });
  407 |       // Let the dev server's HMR client settle so a dependency re-optimization
  408 |       // reload cannot detach the item mid-click.
  409 |       await page.waitForLoadState('networkidle');
> 410 |       await page.locator('#remove-1').click();
      |                                       ^ Error: locator.click: Test timeout of 60000ms exceeded.
  411 |       await expect(page.locator('#remove-1')).toHaveText('✓ Success', { timeout: 30000 });
  412 | 
  413 |       const verifiedStatus = statusOf(page, 1);
  414 |       await expect(verifiedStatus).toContainText('Privacy metadata remaining: 0');
  415 |       await expect(verifiedStatus).toBeVisible();
  416 |       const downloadBtn = page.locator('#download-1');
  417 |       await expect(downloadBtn).toBeEnabled();
  418 |       await expect(downloadBtn).toBeInViewport();
  419 | 
  420 |       overflow = await page.evaluate(() => ({
  421 |         scrollWidth: document.documentElement.scrollWidth,
  422 |         clientWidth: document.documentElement.clientWidth,
  423 |       }));
  424 |       expect(
  425 |         overflow.scrollWidth,
  426 |         `${viewport.label} (${viewport.width}x${viewport.height}) overflows horizontally when verified`,
  427 |       ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  428 |     }
  429 |   });
  430 | });
```