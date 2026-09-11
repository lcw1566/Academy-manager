import { defineConfig, devices } from '@playwright/test';
import { E2E_AUTH_FILES } from './tests/e2e/support/accounts.js';

const baseURL = process.env.E2E_APP_URL;
if (!baseURL) throw new Error('E2E_APP_URL 환경변수가 필요해요.');

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  outputDir: 'test-artifacts/playwright-staging-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'test-artifacts/playwright-staging-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'test-artifacts/playwright-staging-report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'staging-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: E2E_AUTH_FILES.owner,
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.js/,
    },
  ],
});
