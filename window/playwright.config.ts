import { defineConfig } from '@playwright/test';

// The hub runs inside the test; the cloud is the dev stack (pnpm dev, with
// DEV_LOGIN_CODE set on the API).
export default defineConfig({
  testDir: './e2e',
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    channel: process.env.E2E_CHANNEL || undefined,
    viewport: { width: 1366, height: 820 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
