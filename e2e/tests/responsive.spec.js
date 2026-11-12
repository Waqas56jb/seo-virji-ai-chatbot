/**
 * Responsive checks for the deployed chatbot and every admin page at the required widths:
 * no horizontal overflow, no console errors, no failed network requests.
 */
import { expect, test } from '@playwright/test';
import { ADMIN_URL, CLIENT_URL, adminPage, noHorizontalOverflow, watchPage } from './helpers.js';

const WIDTHS = [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const ADMIN_PAGES = ['/', '/conversations', '/leads', '/knowledge', '/settings'];

test.describe.configure({ mode: 'serial' });


for (const width of WIDTHS) {
  test(`chatbot @ ${width}px`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height: width < 768 ? 800 : 900 } });
    const problems = watchPage(page);
    await page.goto(CLIENT_URL);
    await expect(page.getByRole('button', { name: /Start Conversation/i })).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
    expect(problems, problems.join('\n')).toEqual([]);
    await page.close();
  });

  test(`admin pages @ ${width}px`, async ({ browser }) => {
    const { context, page } = await adminPage(browser, { viewport: { width, height: 900 } });
    const problems = watchPage(page);
    for (const path of ADMIN_PAGES) {
      await page.goto(`${ADMIN_URL}${path}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
      expect(await noHorizontalOverflow(page), `${path} overflows at ${width}px`).toBe(true);
    }
    expect(problems.filter((p) => !/401/.test(p)), problems.join('\n')).toEqual([]);
    await context.close();
  });
}
