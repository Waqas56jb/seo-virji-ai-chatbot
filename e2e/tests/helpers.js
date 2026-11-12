import { expect, request } from '@playwright/test';

export const CLIENT_URL = (process.env.E2E_CLIENT_URL || 'https://seo-virji-chat.vercel.app').replace(/\/$/, '');
export const ADMIN_URL = (process.env.E2E_ADMIN_URL || 'https://seo-virji-admin.vercel.app').replace(/\/$/, '');
export const API_URL = (process.env.E2E_API_URL || 'https://seo-virji-api.vercel.app').replace(/\/$/, '');
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

/** Authenticated API client (for verification and cleanup only — the journeys use the UI). */
export async function adminApi() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (or E2E_ENV_FILE).');
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post('/api/admin/auth/login', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(res.status(), 'admin login').toBe(200);
  const token = (await res.json()).data.accessToken;
  const call = async (method, path, data) => {
    const r = await ctx.fetch(path, { method, data, headers: { Authorization: `Bearer ${token}` } });
    const body = r.headers()['content-type']?.includes('json') ? await r.json() : await r.text();
    return { status: r.status(), body, headers: r.headers() };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, d) => call('POST', p, d ?? {}),
    patch: (p, d) => call('PATCH', p, d),
    del: (p) => call('DELETE', p),
    dispose: () => ctx.dispose(),
  };
}

/** Collects console errors and failed requests for a page. */
export function watchPage(page) {
  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText || '';
    // Navigations aborted by the test itself / font prefetch cancellations are not app failures.
    if (/ERR_ABORTED/.test(failure)) return;
    problems.push(`requestfailed: ${req.method()} ${req.url()} ${failure}`);
  });
  page.on('response', (res) => {
    const url = res.url();
    if (res.status() >= 500 && (url.includes('/api/') || url.endsWith('.js'))) problems.push(`HTTP ${res.status()} ${url}`);
  });
  return problems;
}

/** Sends a chat message in the (shadow DOM) chatbot and waits for the assistant reply. */
export async function sendChat(page, text) {
  // The conversation (greeting) must be loaded before counting replies.
  await expect(page.locator('.sv-msg--assistant:not(.sv-typing)').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.sv-composer textarea')).toBeEnabled();
  const before = await page.locator('.sv-msg--assistant:not(.sv-typing)').count();
  const box = page.locator('.sv-composer textarea');
  await box.fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.sv-msg--assistant:not(.sv-typing)')).toHaveCount(before + 1, { timeout: 90_000 });
  return (await page.locator('.sv-msg--assistant:not(.sv-typing)').last().innerText()).trim();
}

export async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Fresh browser context signed in through the real login form (refresh tokens rotate, so sessions are not shared between tests). */
export async function adminPage(browser, options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return { context, page };
}
