/**
 * Lists (and with --delete removes) records created by automated tests. Matches ONLY explicit
 * test markers, never real visitor data:
 *   admin e2e-test-admin@seovirji.test · visitor ids itest_/test_/v_e2edebug · "E2E" / "Crumbly E2E" / "Zephyrina" text
 *   · fixture.seovirji.test crawl data.
 * Usage: node scripts/check-test-residue.js [--delete]
 */
import { many, pool, query } from '../src/config/supabase.js';

const del = process.argv.includes('--delete');
const checks = [
  ['test admin', `select id from public.seo_virji_admin_users where email = 'e2e-test-admin@seovirji.test'`, `delete from public.seo_virji_admin_users where email = 'e2e-test-admin@seovirji.test'`],
  ['test conversations', `select id from public.seo_virji_conversations c where visitor_id ~ '^(itest_|test_|v_e2edebug)' or exists (select 1 from public.seo_virji_messages m where m.conversation_id = c.id and m.role = 'user' and (m.content like '%E2E-CHECK%' or m.content like '%Crumbly E2E%' or m.content like '%Zephyrina%'))`, null],
  ['test leads', `select id from public.seo_virji_leads where business_name ilike '%E2E%' or notes like '%E2E-CHECK%' or visitor_name ilike '%Crumbly%'`, null],
  ['test knowledge', `select id from public.seo_virji_knowledge_sources where content like '%E2E TEST RECORD%' or source_url like 'https://fixture.seovirji.test%'`, null],
  ['fixture crawl jobs', `select id from public.seo_virji_website_crawl_jobs where website_url = 'https://fixture.seovirji.test/'`, null],
];
const tables = { 'test conversations': 'seo_virji_conversations', 'test leads': 'seo_virji_leads', 'test knowledge': 'seo_virji_knowledge_sources', 'fixture crawl jobs': 'seo_virji_website_crawl_jobs' };

for (const [label, sql, delSql] of checks) {
  const rows = await many(sql);
  console.log(`${label}: ${rows.length}`);
  if (del && rows.length) {
    if (delSql) await query(delSql);
    else await query(`delete from public.${tables[label]} where id = any($1::uuid[])`, [rows.map((r) => r.id)]);
    console.log(`  deleted ${rows.length}`);
  }
}
await pool.end();
