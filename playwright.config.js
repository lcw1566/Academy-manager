import { defineConfig, devices } from '@playwright/test';
import { E2E_AUTH_FILES } from './tests/e2e/support/accounts.js';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  outputDir: 'test-artifacts/playwright-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // 현재 테스트 랩은 개발자 한 명당 하나이므로 역할 전환 충돌을 막는다.
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'test-artifacts/playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'test-artifacts/playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: E2E_AUTH_FILES.owner,
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.js/,
    },
  ],
});
