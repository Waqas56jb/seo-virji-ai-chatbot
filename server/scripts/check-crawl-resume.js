/**
 * Manual check of the serverless-style stepping: starts an incremental sync and advances it
 * in tiny time budgets (as separate Vercel invocations would), printing progress per step.
 * Usage: node scripts/check-crawl-resume.js
 */
import { many, one, pool } from '../src/config/supabase.js';
import { advanceJob, startCrawl } from '../src/services/crawler/crawler.service.js';

async function main() {
  const home = await one(`select content from public.seo_virji_knowledge_sources where source_type='website' and source_url = 'https://seovirji.com/'`);
  console.log('Home page contact block present:', /Contact details published on the website/.test(home?.content || ''));
  console.log((home?.content || '').split('## Contact details')[1]?.trim() || '(none)');

  const job = await startCrawl({ trigger: 'cli', mode: 'incremental', budgetMs: 0 });
  let steps = 0;
  for (;;) {
    steps += 1;
    const r = await advanceJob(job.id, { budgetMs: 1500 });
    const j = await one('select phase, status, total_pages_found, pages_processed, pages_skipped from public.seo_virji_website_crawl_jobs where id = $1', [job.id]);
    console.log(`step ${steps}: phase=${j.phase} status=${j.status} found=${j.total_pages_found} processed=${j.pages_processed} skipped=${j.pages_skipped}`);
    if (r.done || steps > 60) break;
  }
  const pages = await many('select status, count(*)::int n from public.seo_virji_website_crawl_pages where crawl_job_id = $1 group by status', [job.id]);
  console.log('Final page statuses:', Object.fromEntries(pages.map((p) => [p.status, p.n])));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
