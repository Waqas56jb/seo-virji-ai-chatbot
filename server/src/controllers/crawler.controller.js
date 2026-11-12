import { env } from '../config/env.js';
import { many, one } from '../config/supabase.js';
import { badRequest, notFound } from '../utils/errors.js';
import { created, ok } from '../utils/response.js';
import { checkUrlShape, normaliseUrl } from '../utils/url-validator.js';
import { audit } from '../services/admin.service.js';
import { cancelCrawl, nextScheduledRun, resumeStalledJobs, serializeJob, startCrawl } from '../services/crawler/crawler.service.js';
import { knowledgeStatus } from '../services/knowledge/knowledge.service.js';

const serializePage = (p) => ({
  id: p.id,
  url: p.url,
  title: p.title,
  status: p.status,
  httpStatus: p.http_status,
  error: p.error_message,
  depth: p.depth,
  discoveredVia: p.discovered_via,
  canonicalUrl: p.canonical_url,
  attempts: p.attempts,
  crawledAt: p.crawled_at,
});

async function begin(req, res, { trigger, mode }) {
  const singlePage = Boolean(req.body?.singlePage);
  const url = req.body?.url ? normaliseUrl(req.body.url) : env.SEO_VIRJI_WEBSITE_URL;
  const problem = url ? checkUrlShape(url, env.crawlerAllowedHosts) : 'Invalid URL';
  if (problem) throw badRequest(problem);
  const effectiveMode = singlePage ? 'single' : mode || req.body?.mode || 'incremental';
  if (effectiveMode === 'retry') {
    const failed = await one(
      `select count(*)::int n from public.seo_virji_website_crawl_pages where status = 'failed' and crawl_job_id = (
         select id from public.seo_virji_website_crawl_jobs where status in ('completed','failed') and mode <> 'single' order by created_at desc limit 1)`,
    );
    if (!failed.n) throw badRequest('The last website sync has no failed pages to retry.');
  }
  const job = await startCrawl({ url, trigger, mode: effectiveMode });
  await audit(req.admin.id, 'crawler.start', 'crawl_job', job.id, { url, mode: effectiveMode });
  created(res, serializeJob(job), 'Website sync started');
}

export const start = (req, res) => begin(req, res, { trigger: 'admin' });
export const recrawl = (req, res) => begin(req, res, { trigger: 'admin', mode: 'full' });
export const retryFailed = (req, res) => begin(req, res, { trigger: 'admin', mode: 'retry' });

/** Status (polled by the admin while a sync runs). Polling also resumes a sync whose worker stopped. */
export const status = async (req, res) => {
  const latest = await one('select * from public.seo_virji_website_crawl_jobs order by created_at desc limit 1');
  if (latest && ['queued', 'running'].includes(latest.status)) await resumeStalledJobs();
  const lastFull = await one(`select * from public.seo_virji_website_crawl_jobs where mode in ('incremental','full') order by created_at desc limit 1`);
  const lastSuccess = await one(`select * from public.seo_virji_website_crawl_jobs where status = 'completed' and mode in ('incremental','full') order by completed_at desc limit 1`);
  const failedUrls = lastFull
    ? await many(`select url, http_status, error_message, crawled_at from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and status = 'failed' order by url`, [lastFull.id])
    : [];
  ok(res, {
    latest: serializeJob(latest),
    lastFullSync: serializeJob(lastFull),
    lastSuccessfulSync: serializeJob(lastSuccess),
    failedUrls: failedUrls.map((f) => ({ url: f.url, httpStatus: f.http_status, error: f.error_message, crawledAt: f.crawled_at })),
    knowledge: await knowledgeStatus(),
    websiteUrl: env.SEO_VIRJI_WEBSITE_URL,
    allowedHosts: env.crawlerAllowedHosts,
    schedule: { enabled: env.CRAWLER_SCHEDULE_ENABLED, expression: env.CRAWLER_SCHEDULE, timezone: 'UTC', nextRunAt: env.CRAWLER_SCHEDULE_ENABLED ? nextScheduledRun() : null },
  });
};

export const jobs = async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 20);
  ok(res, (await many('select * from public.seo_virji_website_crawl_jobs order by created_at desc limit $1', [limit])).map(serializeJob));
};

/** Crawl log: the job plus every URL it discovered, fetched, skipped or failed (with reasons). */
export const job = async (req, res) => {
  const j = await one('select * from public.seo_virji_website_crawl_jobs where id = $1', [req.params.id]);
  if (!j) throw notFound('Crawl job not found');
  const pages = await many(
    `select id, url, title, status, http_status, error_message, depth, discovered_via, canonical_url, attempts, crawled_at
     from public.seo_virji_website_crawl_pages where crawl_job_id = $1
     order by case status when 'failed' then 0 when 'new' then 1 when 'updated' then 2 when 'unchanged' then 3 when 'pending' then 4 when 'fetched' then 5 else 6 end, depth, url`,
    [j.id],
  );
  ok(res, { ...serializeJob(j), pages: pages.map(serializePage) });
};

export const cancel = async (req, res) => {
  const cancelled = await cancelCrawl(req.params.id);
  await audit(req.admin.id, 'crawler.cancel', 'crawl_job', req.params.id);
  ok(res, { cancelled }, cancelled ? 'Sync cancelled' : 'This sync had already finished');
};
