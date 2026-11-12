// Quick production smoke test: chatbot answers a real question; admin loads and its API proxy works.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => r.url().includes('/api/') && r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

await page.goto('https://seo-virji-chat.vercel.app/');
await page.getByRole('button', { name: /Start Conversation/i }).click();
await page.locator('.sv-msg--assistant').first().waitFor({ timeout: 60000 });
await page.locator('.sv-composer textarea').fill('SMOKE-CHECK: what does SEO Virji offer and how much does it cost?');
await page.getByRole('button', { name: 'Send message' }).click();
await page.locator('.sv-msg--assistant:not(.sv-typing)').nth(1).waitFor({ timeout: 90000 });
const reply = await page.locator('.sv-msg--assistant:not(.sv-typing)').nth(1).innerText();
console.log('CLIENT reply:', reply.replace(/\s+/g, ' ').slice(0, 220));
await page.screenshot({ path: 'test-results/smoke-client.png' });

const admin = await browser.newPage();
admin.on('pageerror', (e) => errors.push(e.message));
await admin.goto('https://seo-virji-admin.vercel.app/');
await admin.waitForURL(/\/login/, { timeout: 30000 });
await admin.locator('input[type="email"]').waitFor();
const health = await admin.evaluate(async () => (await fetch('/api/health')).json());
console.log('ADMIN login page loaded; proxied API health:', health.data.status, '| db:', health.data.database, '| openai:', health.data.openai);
await admin.screenshot({ path: 'test-results/smoke-admin.png' });
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
