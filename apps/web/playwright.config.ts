import { defineConfig } from '@playwright/test';

// Runs against the dev servers (pnpm dev). The API must have DEV_LOGIN_CODE set.
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  // dev server compiles each page on first visit
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    channel: process.env.E2E_CHANNEL || undefined,
    viewport: { width: 1366, height: 820 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
