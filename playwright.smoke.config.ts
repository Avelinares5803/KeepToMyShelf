import { defineConfig } from '@playwright/test';

// Smoke tests drive the packaged app (the installed one or the portable one), not the build in
// out/. scripts/smoke-test.ps1 installs or unzips it and runs them; see docs/RELEASING.md.
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 120_000,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { trace: 'retain-on-failure' },
});
