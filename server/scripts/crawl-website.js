/**
 * npm run crawl                         → incremental sync of the whole website
 * npm run crawl -- --full               → full re-crawl (re-index every page, remove pages that disappeared)
 * npm run crawl -- --retry              → retry the URLs that failed in the last sync
 * npm run crawl -- --url <url> --single → one page
 * Runs in the foreground and prints a crawl report.
 */
import { env } from '../src/config/env.js';
import { many, one, pool } from '../src/config/supabase.js';
import { startCrawl } from '../src/services/crawler/crawler.service.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const has = (name) => process.argv.includes(`--${name}`);

async function main() {
  const url = arg('url') || env.SEO_VIRJI_WEBSITE_URL;
  const mode = has('single') ? 'single' : has('full') ? 'full' : has('retry') ? 'retry' : 'incremental';
  console.log(`Website sync: ${url} (mode: ${mode}) …`);
  if (!env.openaiConfigured) console.log('Note: OPENAI_API_KEY is not set — content is stored and keyword-searchable; run `npm run embeddings:rebuild` after adding the key.\n');

  const job = await startCrawl({ url, trigger: 'cli', mode, wait: true });
  const report = await one('select * from public.seo_virji_website_crawl_jobs where id = $1', [job.id]);
  const pages = await many(
    'select url, status, http_status, error_message, discovered_via from public.seo_virji_website_crawl_pages where crawl_job_id = $1 order by status, url',
    [job.id],
  );
  const chunks = await one(
    `select count(*)::int total, count(embedding)::int embedded from public.seo_virji_knowledge_chunks c
     join public.seo_virji_knowledge_sources s on s.id = c.knowledge_source_id where s.source_type = 'website' and s.status = 'active'`,
  );

  console.log('\nCrawl report');
  console.log('────────────');
  console.log(`Status:               ${report.status}${report.error_message ? ` — ${report.error_message}` : ''}`);
  console.log(`URLs discovered:      ${report.total_pages_found}`);
  console.log(`Pages processed:      ${report.pages_processed}  (new ${report.pages_new}, updated ${report.pages_updated}, unchanged ${report.pages_unchanged})`);
  console.log(`Skipped (with reason):${String(report.pages_skipped).padStart(3)}`);
  console.log(`Failed:               ${report.pages_failed}`);
  console.log(`Removed from website: ${report.pages_removed}`);
  console.log(`Embeddings generated: ${report.embeddings_generated}`);
  console.log(`Website chunks:       ${chunks.total} (${chunks.embedded} with embeddings)`);
  console.log('\nURLs:');
  for (const p of pages) {
    console.log(`  [${p.status.padEnd(9)}] ${String(p.http_status || '').padEnd(3)} ${p.url}  (${p.discovered_via})${p.error_message ? `\n               ↳ ${p.error_message}` : ''}`);
  }
  process.exitCode = report.status === 'completed' ? 0 : 1;
}

main()
  .catch((err) => {
    console.error('Crawl failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
