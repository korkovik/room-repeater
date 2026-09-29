import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.ts';

/**
 * QA phase-2 suite (qa-tester). Reuses the project config and its static server, but runs the
 * specs in tests/qa/. Run from family-buddy/: npx playwright test -c tests/qa/playwright.qa.config.ts
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

export default defineConfig({
  ...base,
  testDir: '.',
  ...(server ? { webServer: { ...server, cwd: root } } : {}),
});
