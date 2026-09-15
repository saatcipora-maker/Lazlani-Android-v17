import { defineConfig, devices } from '@playwright/test';

const previewDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
const baseURL =
  process.env.SMOKE_BASE_URL ??
  (previewDomain
    ? `https://${previewDomain}`
    : `http://127.0.0.1:${process.env.PORT ?? '23406'}`);

export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    ...devices['Pixel 5'],
    baseURL,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    testIdAttribute: 'data-testid',
    trace: 'on-first-retry',
  },
});