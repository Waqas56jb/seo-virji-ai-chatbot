/**
 * End-to-end tests (Playwright, system Chrome). By default they run against PRODUCTION:
 *   E2E_CLIENT_URL  https://seo-virji-chat.vercel.app
 *   E2E_ADMIN_URL   https://seo-virji-admin.vercel.app
 *   E2E_API_URL     https://seo-virji-api.vercel.app
 * Admin credentials come from E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (or a file named by E2E_ENV_FILE).
 * Every record the tests create is labelled "E2E" and deleted at the end.
 */
import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

if (process.env.E2E_ENV_FILE && fs.existsSync(process.env.E2E_ENV_FILE)) {
  for (const line of fs.readFileSync(process.env.E2E_ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  expect: { timeout: 45_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 860 },
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
