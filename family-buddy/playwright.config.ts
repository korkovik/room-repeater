import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.FB_E2E_PORT ?? 4173);
const iPhone = devices['iPhone 13'];

/**
 * Chromium with the iPhone 13 viewport always runs. WebKit (architecture §4) runs when its
 * browser is installed; set FB_E2E_WEBKIT=1 to add the project (e.g. on the Mac mini).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'en-GB',
    timezoneId: 'Europe/Prague',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...iPhone, browserName: 'chromium', defaultBrowserType: 'chromium' } },
    ...(process.env.FB_E2E_WEBKIT ? [{ name: 'webkit', use: { ...iPhone } }] : []),
  ],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: `http://127.0.0.1:${PORT}/__blank`,
    reuseExistingServer: !process.env.CI,
    env: { FB_E2E_PORT: String(PORT) },
  },
});
