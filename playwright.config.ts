import { defineConfig } from '@playwright/test';

// End-to-end tests drive the built Electron app (run `npm run build` first, or `npm run test:e2e`).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
