// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://photometadataremover.com',
  vite: {
    plugins: [tailwindcss()],
    // Tests (and the audit-fixtures script) write to audit-fixtures-out/ at runtime.
    // Without an ignore rule, Vite treats those writes as a project source change and
    // forces a full page reload, which races against the upload tests and makes a
    // passing single-shot setInputFileTools look like nothing is happening. The directory
    // is never imported by app sources, so ignoring it cannot regress production.
    server: {
      watch: {
        ignored: ['**/audit-fixtures-out/**', '**/test-results/**'],
      },
    },
  },
});
