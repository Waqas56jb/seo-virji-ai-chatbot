/**
 * Coverage check: renders each live website page in Chrome, collects its visible text lines,
 * and reports which meaningful lines are missing from the stored knowledge.
 * Usage: node scripts/check-coverage.js   (needs the e2e Playwright install)
 */
import { many, pool } from '../src/config/supabase.js';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9$%]+/g, ' ').trim();

const sources = await many(`select source_url, content from public.seo_virji_knowledge_sources where source_type = 'website' and status = 'active' order by source_url`);
const browser = await chromium.launch({ channel: 'chrome' });
for (const s of sources) {
  const page = await browser.newPage();
  await page.goto(s.source_url, { waitUntil: 'networkidle', timeout: 60000 });
  const lines = await page.evaluate(() => {
    document.querySelectorAll('header, footer, nav, script, style, noscript').forEach((e) => e.remove());
    return [...new Set(document.body.innerText.split('\n').map((l) => l.trim()).filter((l) => l.length >= 15))];
  });
  const stored = norm(s.content);
  const missing = lines.filter((l) => !stored.includes(norm(l)));
  console.log(`\n${s.source_url}\n  visible lines: ${lines.length}, found in knowledge: ${lines.length - missing.length}, missing: ${missing.length}`);
  for (const m of missing.slice(0, 15)) console.log(`   - ${m.slice(0, 140)}`);
  await page.close();
}
await browser.close();
await pool.end();
