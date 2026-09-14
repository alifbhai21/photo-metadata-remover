import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:4321',
    viewport: { width: 375, height: 667 },
    headless: true,
  },
  testMatch: '*.spec.ts',
  // Skip the .kilo git-worktree copies of the repo — they contain stale
  // project files (initial commit) and must never be run as project tests.
  testIgnore: ['**/.kilo/**', '**/node_modules/**'],
});
