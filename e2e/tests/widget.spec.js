/**
 * The one-line embed on an EXTERNAL website. The browser loads a page at https://seovirji.com/…
 * (served by the test so the real site is untouched) that contains hostile CSS/JS and the exact
 * production script tag. Requests from the widget to the API are real and cross-origin (CORS).
 */
import { expect, test } from '@playwright/test';
import { API_URL, CLIENT_URL, adminApi, sendChat, watchPage } from './helpers.js';

const HOST_PAGE = 'https://seovirji.com/__e2e-widget-test__';
const SCRIPT_TAG = `<script src="${CLIENT_URL}/widget.js" data-api-url="${API_URL}" async></script>`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>External site</title>
<style>
  * { font-family: "Comic Sans MS", cursive !important; color: #c00 !important; box-sizing: content-box !important; }
  button { background: lime !important; border: 6px dashed red !important; padding: 30px !important; }
  div { margin: 13px !important; }
  body { margin: 0; padding: 30px; background: #f2f2f2; }
</style></head>
<body><h1 id="host-title">Host website</h1><button id="host-btn" onclick="window.hostClicks=(window.hostClicks||0)+1">Host button</button>
<script>window.hostValue = 42; window.hostClicks = 0;</script>
${SCRIPT_TAG}
</body></html>`;

test('widget embeds with one script tag, is style-isolated and chats through the production API', async ({ page }) => {
  const problems = watchPage(page);
  // The launcher floats gently; reduced motion (which the widget honours) keeps it still for automated clicks.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(HOST_PAGE, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(HOST_PAGE);

  // Launcher appears; host page is untouched.
  const launcher = page.getByRole('button', { name: /Chat with SEO Virji AI Consultant/i });
  await expect(launcher).toBeVisible();
  expect(await page.evaluate(() => window.hostValue)).toBe(42);
  await page.locator('#host-btn').click();
  expect(await page.evaluate(() => window.hostClicks)).toBe(1);
  expect(await page.locator('#host-title').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(204, 0, 0)');

  await launcher.click();
  await page.getByRole('button', { name: /Start Conversation/i }).click();
  // Hostile CSS does not reach inside the Shadow DOM.
  const font = await page.locator('.sv-composer textarea').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).not.toMatch(/Comic Sans/i);
  const sendBg = await page.getByRole('button', { name: 'Send message' }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(sendBg).not.toBe('rgb(0, 255, 0)');

  const reply = await sendChat(page, 'E2E-CHECK: in one sentence, what does SEO Virji offer?');
  expect(reply.length).toBeGreaterThan(20);
  expect(problems, problems.join('\n')).toEqual([]);

  // Clean up the conversation this test created.
  const api = await adminApi();
  const convs = await api.get('/api/conversations?search=E2E-CHECK&pageSize=50');
  for (const c of convs.body.data.items) await api.del(`/api/conversations/${c.id}`);
  await api.dispose();
});

test('API rejects browser origins that are not allowed (CORS)', async ({ request }) => {
  const res = await request.fetch(`${API_URL}/api/chat/config`, { headers: { Origin: 'https://evil.example' } });
  expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  const ok = await request.fetch(`${API_URL}/api/chat/config`, { headers: { Origin: 'https://seovirji.com' } });
  expect(ok.headers()['access-control-allow-origin']).toBe('https://seovirji.com');
});
