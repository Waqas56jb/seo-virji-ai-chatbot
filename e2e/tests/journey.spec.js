/**
 * Complete user journey against the deployed apps (real OpenAI + Supabase, no mocks):
 * visitor chat → memory → refresh → WhatsApp handoff → admin login → dashboard →
 * conversations → leads → knowledge edit → chatbot uses it → delete → no longer used.
 */
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_URL, CLIENT_URL, adminApi, adminPage, sendChat, watchPage } from './helpers.js';

test.describe.configure({ mode: 'serial' });

const BAKERY = 'Crumbly E2E Test Bakery';
const MASCOT = 'Zephyrina';
let api;
let waUrl = '';

test.beforeAll(async () => {
  api = await adminApi();
});

test.afterAll(async () => {
  // Clean up every E2E record (by unique markers only).
  for (const term of [BAKERY, MASCOT, 'E2E-CHECK']) {
    const leads = await api.get(`/api/leads?search=${encodeURIComponent(term)}&pageSize=50`);
    for (const l of leads.body?.data?.items || []) await api.del(`/api/leads/${l.id}`);
    const convs = await api.get(`/api/conversations?search=${encodeURIComponent(term)}&pageSize=50`);
    for (const c of convs.body?.data?.items || []) await api.del(`/api/conversations/${c.id}`);
  }
  const k = await api.get(`/api/knowledge?search=${encodeURIComponent(MASCOT)}&status=all&page=1&pageSize=20`);
  for (const s of k.body?.data?.items || []) await api.del(`/api/knowledge/${s.id}`);
  await api.dispose();
});

test('visitor: real answers, memory, refresh persistence and WhatsApp handoff', async ({ page, context }) => {
  const problems = watchPage(page);
  await context.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\/.*/, (route) => {
    waUrl ||= route.request().url();
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>WhatsApp (intercepted by test)</body></html>' });
  });

  await page.goto(CLIENT_URL);
  await page.getByRole('button', { name: /Start Conversation/i }).click();
  await expect(page.locator('.sv-msg--assistant').first()).toBeVisible();
  await expect(page.locator('.sv-composer textarea')).toBeVisible();

  const intro = await sendChat(page, `Hi! I run a small bakery called ${BAKERY} in Lahore. What does SEO Virji actually do?`);
  expect(intro.length).toBeGreaterThan(40);

  const pricing = await sendChat(page, 'How much does it cost? Do you have monthly or yearly pricing?');
  expect(pricing).toMatch(/699|7,?550/); // the prices published on seovirji.com
  await expect(page.locator('.sv-sources').last()).toBeVisible(); // "Based on SEO Virji's website"

  const memory = await sendChat(page, 'Quick check — what is the name of my business?');
  expect(memory).toMatch(/Crumbly/i);

  // Refresh: the conversation is restored from Supabase.
  await page.reload();
  await expect(page.locator('.sv-msg--user')).toHaveCount(3, { timeout: 60_000 });
  await expect(page.locator('.sv-msg--user').first()).toContainText('Crumbly');

  // WhatsApp handoff
  await sendChat(page, 'Great, I would like to talk to the owner directly on WhatsApp about getting started.');
  const cta = page.getByRole('button', { name: /Continue on WhatsApp/i }).last();
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page.getByText('Continue Your Conversation on WhatsApp')).toBeVisible();
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: /Continue to WhatsApp/i }).click();
  const popup = await popupPromise;
  await expect.poll(() => waUrl, { timeout: 30_000 }).toMatch(/wa\.me\/923373330774\?text=/);
  const text = new URL(waUrl).searchParams.get('text') || '';
  expect(text).toMatch(/Crumbly/);
  expect(text).toMatch(/Chat reference: [0-9A-F]{8}/);
  await popup.close();

  // Lead + handoff recorded in Supabase (checked through the admin API).
  await expect
    .poll(async () => (await api.get(`/api/leads?search=${encodeURIComponent('Crumbly')}`)).body.data.items[0]?.handoffStatus, { timeout: 30_000 })
    .toBe('opened');
  const lead = (await api.get(`/api/leads?search=Crumbly`)).body.data.items[0];
  expect(['qualified', 'interested']).toContain(lead.status);
  const conv = (await api.get(`/api/conversations?search=Crumbly`)).body.data.items[0];
  expect(conv.handoff).toBe(true);
  expect(text).toContain(conv.reference);

  expect(problems, problems.join('\n')).toEqual([]);
});

test('admin: invalid login, protected routes, login, dashboard', async ({ page, browser }) => {
  const problems = watchPage(page);
  // Protected route without a session → login.
  const anon = await browser.newPage();
  await anon.goto(`${ADMIN_URL}/leads`);
  await expect(anon).toHaveURL(/\/login/);
  await anon.close();

  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill('definitely-wrong-password');
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText(/Total visitors/i).first()).toBeVisible();
  await expect(page.getByText(/WhatsApp handoffs?/i).first()).toBeVisible();
  await expect(page.getByText(/Resolved/i).first()).toBeVisible();
  expect(problems.filter((p) => !/401/.test(p)), problems.join('\n')).toEqual([]);
});

test('admin: conversations — search, open, sources, resolve and reopen', async ({ browser }) => {
  const { context, page } = await adminPage(browser);
  const problems = watchPage(page);
  await page.goto(`${ADMIN_URL}/conversations`);
  await page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first().fill('Crumbly');
  await page.getByText(/Crumbly/).first().click();
  await expect(page.getByText(/What does SEO Virji actually do/).first()).toBeVisible();
  await page.getByRole('button', { name: /Mark (as )?resolved/i }).click();
  await expect(page.getByRole('button', { name: /Reopen/i })).toBeVisible();
  const resolved = (await (await adminApi()).get('/api/conversations?search=Crumbly&status=resolved')).body.data.total;
  expect(resolved).toBe(1);
  await page.getByRole('button', { name: /Reopen/i }).click();
  await expect(page.getByRole('button', { name: /Mark (as )?resolved/i })).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
  await context.close();
});

test('admin: leads — status update, notes, export', async ({ browser }) => {
  const { context, page } = await adminPage(browser, { acceptDownloads: true });
  const problems = watchPage(page);
  await page.goto(`${ADMIN_URL}/leads`);
  await page.getByPlaceholder(/search/i).first().fill('Crumbly');
  await expect(page.getByText(/Crumbly/).first()).toBeVisible();

  // Export (respects the search filter)
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export/i }).first().click();
  const download = await downloadPromise;
  const csv = fs.readFileSync(await download.path(), 'utf8');
  expect(csv).toMatch(/status,score,name/);
  expect(csv).toMatch(/Crumbly/);

  await page.getByText(/Crumbly/).first().click();
  const notes = page.getByRole('textbox', { name: /notes/i }).or(page.locator('textarea')).first();
  await notes.fill('E2E-CHECK internal note');
  await page.getByRole('button', { name: /Save notes/i }).click();
  const select = page.getByRole('combobox', { name: 'Lead status' }).last();
  await select.selectOption('contacted');
  const api2 = await adminApi();
  await expect
    .poll(async () => {
      const l = (await api2.get('/api/leads?search=Crumbly')).body.data.items[0];
      return `${l.status}|${l.notes}`;
    })
    .toBe('contacted|E2E-CHECK internal note');
  expect(problems, problems.join('\n')).toEqual([]);
  await context.close();
});

test('knowledge: add → chatbot retrieves it → delete → no longer retrieved', async ({ browser }) => {
  const { context, page } = await adminPage(browser);
  const problems = watchPage(page);
  await page.goto(`${ADMIN_URL}/knowledge`);
  await page.getByRole('button', { name: /Add (knowledge|document)/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').first().fill('E2E test record — office mascot');
  await dialog.locator('textarea').fill(`E2E TEST RECORD (temporary). The SEO Virji office mascot is a green parrot named ${MASCOT}.`);
  await dialog.getByRole('button', { name: /Add|Save/i }).last().click();
  await expect(page.getByText('E2E test record — office mascot').first()).toBeVisible();

  const ask = async () => {
    const chat = await context.newPage();
    await chat.goto(CLIENT_URL);
    await chat.evaluate(() => localStorage.clear());
    await chat.reload();
    await chat.getByRole('button', { name: /Start Conversation/i }).click();
    const reply = await sendChat(chat, 'E2E-CHECK: what is the name of the SEO Virji office mascot?');
    await chat.close();
    return reply;
  };
  expect(await ask()).toContain(MASCOT);

  const api3 = await adminApi();
  const rec = (await api3.get(`/api/knowledge?search=${MASCOT}&status=all&page=1&pageSize=5`)).body.data.items[0];
  expect(rec.embeddingStatus).toBe('complete');
  const del = await api3.del(`/api/knowledge/${rec.id}`);
  expect(del.status).toBe(200);
  expect(await ask()).not.toContain(MASCOT);
  expect(problems, problems.join('\n')).toEqual([]);
  await context.close();
});

test('website sync from the admin: incremental sync completes and logs every URL', async ({ browser }) => {
  const { context, page } = await adminPage(browser);
  const problems = watchPage(page);
  await page.goto(`${ADMIN_URL}/knowledge`);
  await page.getByRole('button', { name: /Sync Website Now/i }).click();
  const api4 = await adminApi();
  await expect
    .poll(async () => (await api4.get('/api/crawler/status')).body.data.latest?.status, { timeout: 200_000, intervals: [3000] })
    .toBe('completed');
  const latest = (await api4.get('/api/crawler/status')).body.data.latest;
  expect(latest.pagesFound).toBeGreaterThanOrEqual(10);
  expect(latest.pagesProcessed).toBeGreaterThanOrEqual(4);
  expect(latest.pagesFailed).toBe(0);
  await page.getByRole('button', { name: /View Crawl Logs/i }).click();
  await page.getByRole('dialog').getByText('Website sync', { exact: true }).first().click();
  await expect(page.getByRole('dialog').getByText('seovirji.com/checkout').first()).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/Private or transactional/).first()).toBeVisible();
  expect(problems, problems.join('\n')).toEqual([]);
  await context.close();
});

test('admin: settings page shows AI & knowledge controls; logout', async ({ browser }) => {
  const { context, page } = await adminPage(browser);
  const problems = watchPage(page);
  await page.goto(`${ADMIN_URL}/settings`);
  await expect(page.getByText(/AI & Knowledge/i).first()).toBeVisible();
  await expect(page.getByText(/Chatbot enabled/i).first()).toBeVisible();
  await expect(page.getByText(/WhatsApp handoff message/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Log out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(problems, problems.join('\n')).toEqual([]);
  await context.close();
});
