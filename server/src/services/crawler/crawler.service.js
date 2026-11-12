/**
 * Website knowledge sync for seovirji.com — a resumable, serverless-safe state machine.
 *
 * Every crawl job is stored in Supabase together with its page frontier, so any process
 * (local server, CLI, Vercel function, Vercel Cron, or the admin's status polling) can
 * advance it in short time-boxed steps. A lease prevents two workers from advancing the
 * same job at once; a crashed worker's lease simply expires and another one continues.
 *
 *   discover  robots.txt → sitemap(s)/sitemap index → WordPress REST listing → seed URLs
 *   fetch     one pending URL at a time (SSRF-safe, polite delay, retries) → extract →
 *             canonical / duplicate-content detection → enqueue internal links + pagination
 *   index     cross-page boilerplate removal → content-hash comparison → upsert source →
 *             chunk + embed only changed chunks
 *   finalize  (healthy full/incremental runs only) deactivate pages that no longer exist
 *
 * Modes: incremental (unchanged pages are skipped), full (every page re-indexed),
 * single (one URL), retry (the failed URLs of the previous sync).
 * A failed or cancelled crawl never deletes existing knowledge.
 */
import { env } from '../../config/env.js';
import { many, one, query } from '../../config/supabase.js';
import { conflict, notFound } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { normaliseUrl } from '../../utils/url-validator.js';
import { runInBackground } from '../../utils/background.js';
import { fetchWithRetry, renderWithBrowser } from './scraper.service.js';
import { discoverFromSitemaps, discoverFromWordPress, fetchRobots, isAllowedByRobots } from './sitemap.service.js';
import { extractContent } from './content-extractor.service.js';
import { dropEmptySections, findBoilerplateLines, removeBoilerplate } from './content-cleaner.service.js';
import { contentHash, exclusionReason, isListingUrl } from './deduplication.service.js';
import { indexSource } from '../knowledge/source-management.service.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_CONTENT_CHARS = 200;
const LEASE_SECONDS = 90;
const MAX_SKIPPED_RECORDS = 200;
const ACTIVE = `status in ('queued','running')`;

export const MODES = ['incremental', 'full', 'single', 'retry'];

/* ------------------------------------------------------------ persistence helpers */

async function updateJob(jobId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`update public.seo_virji_website_crawl_jobs set ${sets} where id = $1`, [jobId, ...keys.map((k) => fields[k])]);
}

/** Adds a URL to the job frontier (no-op if the job already has it). */
async function addPage(jobId, { url, depth = 0, via = 'link', status = 'pending', error = null, lastmod = null }) {
  const row = await one(
    `insert into public.seo_virji_website_crawl_pages (crawl_job_id, url, depth, discovered_via, status, error_message, lastmod)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict (crawl_job_id, url) do nothing returning id`,
    [jobId, url, depth, via, status, error, lastmod],
  );
  return Boolean(row);
}

async function setPage(pageId, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`update public.seo_virji_website_crawl_pages set ${sets} where id = $1`, [pageId, ...keys.map((k) => fields[k])]);
}

/** Recomputes the job counters from its page rows (always consistent, even across workers). */
async function refreshStats(jobId) {
  const s = await one(
    `select count(*)::int found,
       count(*) filter (where status in ('new','updated','unchanged'))::int processed,
       count(*) filter (where status = 'failed')::int failed,
       count(*) filter (where status = 'skipped')::int skipped,
       count(*) filter (where status = 'new')::int new_pages,
       count(*) filter (where status = 'updated')::int updated,
       count(*) filter (where status = 'unchanged')::int unchanged
     from public.seo_virji_website_crawl_pages where crawl_job_id = $1`,
    [jobId],
  );
  await updateJob(jobId, {
    total_pages_found: s.found,
    pages_processed: s.processed,
    pages_failed: s.failed,
    pages_skipped: s.skipped,
    pages_new: s.new_pages,
    pages_updated: s.updated,
    pages_unchanged: s.unchanged,
    heartbeat_at: new Date(),
  });
  return s;
}

/* ------------------------------------------------------------ scope */

function scopeCheck(url, robots) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'Invalid URL';
  }
  if (!env.crawlerAllowedHosts.includes(host)) return 'outside';
  const excluded = exclusionReason(url);
  if (excluded) return excluded;
  if (!isAllowedByRobots(url, robots)) return 'Blocked by robots.txt';
  return null;
}

/* ------------------------------------------------------------ fetch + extract */

/** Fetch + extract one page. Never throws. */
export async function fetchPage(url) {
  try {
    const res = await fetchWithRetry(url);
    const finalUrl = normaliseUrl(res.url) || url;
    if (res.status !== 200) return { url: finalUrl, status: 'failed', httpStatus: res.status, error: `HTTP ${res.status}` };
    if (!res.body) return { url: finalUrl, status: 'skipped', httpStatus: res.status, error: `Not an HTML page (${res.contentType || 'unknown type'})` };
    let extracted = extractContent(res.body, finalUrl);
    if (extracted.text.length < MIN_CONTENT_CHARS) {
      const rendered = await renderWithBrowser(finalUrl).catch(() => null);
      if (rendered) extracted = extractContent(rendered, finalUrl);
    }
    if (extracted.noindex) return { url: finalUrl, status: 'skipped', httpStatus: 200, error: 'Page is marked noindex', links: extracted.links };
    return { url: finalUrl, httpStatus: 200, redirected: finalUrl !== url, ...extracted };
  } catch (err) {
    return { url, status: 'failed', error: String(err.message || err).slice(0, 300) };
  }
}

export function composeDocument(page) {
  const parts = [];
  if (page.description) parts.push(page.description);
  parts.push(page.text);
  if (page.faqs?.length) {
    parts.push('## Frequently asked questions');
    for (const f of page.faqs) parts.push(`Q: ${f.question}\nA: ${f.answer}`);
  }
  // Contact details are usually in the (removed) site footer — keep them once, on the home page.
  const c = page.contacts || {};
  if (page.isHome && (c.emails?.length || c.phones?.length || c.whatsapp?.length)) {
    const lines = ['## Contact details published on the website'];
    if (c.emails?.length) lines.push(`Email: ${c.emails.join(', ')}`);
    if (c.phones?.length) lines.push(`Phone: ${c.phones.join(', ')}`);
    if (c.whatsapp?.length) lines.push(`WhatsApp: ${c.whatsapp.map((n) => `+${n}`).join(', ')}`);
    parts.push(lines.join('\n'));
  }
  return parts.filter(Boolean).join('\n\n');
}

/** Rough page category used for metadata and the admin list. */
export function categorise(url, page = {}) {
  const path = new URL(url).pathname.toLowerCase();
  if (path === '/' || path === '') return 'home';
  if (/\/(category|tag)\//.test(path)) return 'archive';
  if (/(service|what-we-do|seo-)/.test(path) && !page.isArticle) return 'service';
  if (/(about|why-us|team)/.test(path)) return 'about';
  if (/(contact)/.test(path)) return 'contact';
  if (/(faq)/.test(path) || page.faqs?.length > 2) return 'faq';
  if (/(pricing|price|package|plan)/.test(path)) return 'pricing';
  if (/(case-stud|portfolio|result|testimonial)/.test(path)) return 'case_study';
  if (page.isArticle) return 'blog';
  return 'page';
}

/* ------------------------------------------------------------ phases */

async function phaseDiscover(job) {
  const startUrl = job.metadata.start_url;
  const origin = new URL(startUrl).origin;
  const robots = await fetchRobots(origin);
  const robotsState = { disallow: robots.disallow, allow: robots.allow, sitemaps: robots.sitemaps };
  let skippedRecorded = 0;

  const consider = async (url, depth, via, lastmod = null) => {
    const n = normaliseUrl(url);
    if (!n) return;
    const reason = scopeCheck(n, robots);
    if (reason === 'outside') return;
    if (reason) {
      if (skippedRecorded < MAX_SKIPPED_RECORDS && (await addPage(job.id, { url: n, depth, via, status: 'skipped', error: reason }))) skippedRecorded += 1;
      return;
    }
    await addPage(job.id, { url: n, depth, via, lastmod });
  };

  if (job.mode === 'retry') {
    const failed = await many(
      `select distinct p.url from public.seo_virji_website_crawl_pages p
       where p.status = 'failed' and p.crawl_job_id = (
         select id from public.seo_virji_website_crawl_jobs where id <> $1 and website_url = $2 and status in ('completed','failed') and mode <> 'single'
         order by created_at desc limit 1)`,
      [job.id, job.website_url],
    );
    for (const f of failed) await consider(f.url, 0, 'retry');
  } else {
    await consider(startUrl, 0, job.mode === 'single' ? 'manual' : 'start');
    if (job.mode !== 'single') {
      const sitemaps = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
      for (const p of await discoverFromSitemaps(sitemaps)) await consider(p.url, 1, 'sitemap', p.lastmod);
      for (const u of await discoverFromWordPress(origin)) await consider(u, 1, 'wordpress_api');
    }
  }
  await updateJob(job.id, { phase: 'fetch', metadata: { ...job.metadata, robots: robotsState } });
  return true;
}

async function phaseFetch(job) {
  const page = await one(
    `select * from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and status = 'pending' order by depth, created_at limit 1`,
    [job.id],
  );
  if (!page) {
    await updateJob(job.id, { phase: 'index' });
    return true;
  }
  const robots = job.metadata.robots || { disallow: [], allow: [], sitemaps: [] };
  const result = await fetchPage(page.url);
  const attempts = page.attempts + 1;

  // Redirect to another URL already in this job → it is a duplicate address.
  if (result.redirected && result.url !== page.url) {
    const reason = scopeCheck(result.url, robots);
    if (reason) {
      await setPage(page.id, { status: 'skipped', attempts, http_status: result.httpStatus || null, error_message: reason === 'outside' ? `Redirects outside the website (${result.url})` : `Redirects to ${result.url}: ${reason}`, crawled_at: new Date() });
      return true;
    }
    const existing = await one('select id from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and url = $2', [job.id, result.url]);
    if (existing) {
      await setPage(page.id, { status: 'skipped', attempts, http_status: result.httpStatus || null, error_message: `Redirects to ${result.url} (already crawled)`, crawled_at: new Date() });
      return true;
    }
  }

  if (result.status) {
    await setPage(page.id, { status: result.status, attempts, http_status: result.httpStatus || null, error_message: result.error || null, crawled_at: new Date() });
  } else {
    // Only an in-scope canonical that differs from this URL changes anything.
    const canonical = result.canonical && result.canonical !== page.url && !scopeCheck(result.canonical, robots) ? result.canonical : null;
    const listing = isListingUrl(page.url);
    const canonicalDup = canonical
      ? await one(`select id from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and url = $2 and status <> 'skipped'`, [job.id, canonical])
      : null;
    const hash = contentHash(result.text);
    const contentDup = await one(
      `select url from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and content_hash = $2 and status in ('fetched','new','updated','unchanged') and id <> $3 limit 1`,
      [job.id, hash, page.id],
    );
    if (listing) {
      await setPage(page.id, { status: 'skipped', attempts, http_status: 200, title: result.title || null, error_message: 'Listing page — used only to discover articles (they are crawled individually)', crawled_at: new Date() });
    } else if (canonicalDup) {
      await setPage(page.id, { status: 'skipped', attempts, http_status: 200, canonical_url: canonical, error_message: `Duplicate of canonical page ${canonical}`, crawled_at: new Date() });
    } else if (contentDup) {
      await setPage(page.id, { status: 'skipped', attempts, http_status: 200, content_hash: hash, error_message: `Same content as ${contentDup.url}`, crawled_at: new Date() });
    } else {
      // A canonical that points elsewhere (and is in scope) becomes the URL we crawl next.
      if (canonical && !scopeCheck(canonical, robots)) await addPage(job.id, { url: canonical, depth: page.depth, via: 'canonical' });
      const payload = {
        text: result.text.slice(0, 200_000),
        title: result.title,
        description: result.description,
        headings: result.headings.slice(0, 60),
        faqs: result.faqs,
        isArticle: result.isArticle,
        published: result.published || null,
        modified: result.modified || null,
        contacts: result.contacts,
        isHome: new URL(page.url).pathname === '/',
        linkCount: result.links.length,
      };
      await setPage(page.id, {
        status: canonical ? 'skipped' : 'fetched',
        ...(canonical ? { error_message: `Canonical URL is ${canonical}` } : {}),
        attempts,
        http_status: 200,
        title: result.title || null,
        canonical_url: result.canonical || null,
        content_hash: hash,
        payload: canonical ? null : payload,
        extracted_content: canonical ? null : result.text.slice(0, 200_000),
        crawled_at: new Date(),
      });
    }
  }

  // Discovery: internal links + pagination (never for single-page or retry runs).
  if (!['single', 'retry'].includes(job.mode) && result.links?.length && page.depth < env.CRAWLER_MAX_DEPTH) {
    const count = (await one(`select count(*)::int n from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and status <> 'skipped'`, [job.id])).n;
    let room = env.CRAWLER_MAX_PAGES - count;
    let skippedRoom = MAX_SKIPPED_RECORDS - (await one(`select count(*)::int n from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and status = 'skipped'`, [job.id])).n;
    const ordered = [...(result.pagination || []), ...result.links];
    for (const link of ordered) {
      const reason = scopeCheck(link, robots);
      if (reason === 'outside') continue;
      if (reason) {
        if (skippedRoom > 0 && (await addPage(job.id, { url: link, depth: page.depth + 1, via: 'link', status: 'skipped', error: reason }))) skippedRoom -= 1;
        continue;
      }
      if (room <= 0) {
        await updateJob(job.id, { metadata: { ...job.metadata, truncated: true } });
        job.metadata.truncated = true;
        break;
      }
      const via = result.pagination?.includes(link) ? 'pagination' : 'link';
      if (await addPage(job.id, { url: link, depth: page.depth + 1, via })) room -= 1;
    }
  }
  await sleep(env.CRAWLER_REQUEST_DELAY_MS);
  return true;
}

/** Saves one processed page as a website knowledge source. Returns 'new' | 'updated' | 'unchanged'. */
async function upsertPageSource(page, payload, job) {
  const content = composeDocument(payload);
  const hash = contentHash(content);
  const existing = await one(
    `select id, content_hash, status, metadata from public.seo_virji_knowledge_sources where source_type = 'website' and source_url = $1`,
    [page.url],
  );
  const metadata = {
    description: payload.description || null,
    headings: payload.headings?.slice(0, 40) || [],
    faq_count: payload.faqs?.length || 0,
    category: categorise(page.url, payload),
    published_at: payload.published,
    modified_at: payload.modified,
    contacts: payload.contacts || {},
    crawl_job_id: job.id,
  };
  let embedded = 0;

  // The owner edited this page's knowledge in the admin — never overwrite it automatically.
  if (existing?.metadata?.admin_edited) {
    await query(
      `update public.seo_virji_knowledge_sources set last_crawled_at = now(),
         metadata = metadata || jsonb_build_object('website_hash', $2::text, 'website_changed', $2::text is distinct from metadata->>'website_hash_at_edit')
       where id = $1`,
      [existing.id, hash],
    );
    return { status: 'unchanged', sourceId: existing.id, embedded, note: 'Kept the admin-edited version' };
  }

  if (existing && existing.content_hash === hash && existing.status === 'active') {
    await query(`update public.seo_virji_knowledge_sources set last_crawled_at = now(), metadata = metadata || $2::jsonb where id = $1`, [existing.id, metadata]);
    const missing = await one('select count(*)::int n from public.seo_virji_knowledge_chunks where knowledge_source_id = $1 and embedding is null', [existing.id]);
    if (missing.n || job.mode === 'full') embedded = (await indexSource(existing.id)).embedded;
    return { status: 'unchanged', sourceId: existing.id, embedded };
  }

  let sourceId;
  if (existing) {
    await query(
      `update public.seo_virji_knowledge_sources set title=$2, content=$3, content_hash=$4, status='active', metadata=$5,
         last_crawled_at=now(), last_updated_at=now(), version = version + 1 where id=$1`,
      [existing.id, payload.title || page.url, content, hash, metadata],
    );
    sourceId = existing.id;
  } else {
    sourceId = (
      await one(
        `insert into public.seo_virji_knowledge_sources (title, source_type, source_url, content, content_hash, status, priority, last_crawled_at, metadata)
         values ($1,'website',$2,$3,$4,'active',10,now(),$5) returning id`,
        [payload.title || page.url, page.url, content, hash, metadata],
      )
    ).id;
  }
  embedded = (await indexSource(sourceId)).embedded;
  return { status: existing ? 'updated' : 'new', sourceId, embedded };
}

async function phaseIndex(job) {
  const page = await one(
    `select * from public.seo_virji_website_crawl_pages where crawl_job_id = $1 and status = 'fetched' order by depth, created_at limit 1`,
    [job.id],
  );
  if (!page) {
    await updateJob(job.id, { phase: 'finalize' });
    return true;
  }
  // Boilerplate (menus/footers repeated across pages) is computed once per job from every
  // fetched page and stored on the job, so every worker removes exactly the same lines.
  if (!Array.isArray(job.metadata.boilerplate)) {
    const all = await many(
      `select payload->>'text' as text from public.seo_virji_website_crawl_pages
       where crawl_job_id = $1 and payload is not null and length(payload->>'text') >= 80`,
      [job.id],
    );
    // Single-page and retry runs reuse the boilerplate learned by the last full/incremental sync.
    let lines = all.length >= 3 ? [...findBoilerplateLines(all)] : null;
    if (!lines) {
      const prev = await one(
        `select metadata->'boilerplate' as b from public.seo_virji_website_crawl_jobs
         where website_url = $1 and mode in ('incremental','full') and metadata ? 'boilerplate' order by created_at desc limit 1`,
        [job.website_url],
      );
      lines = Array.isArray(prev?.b) ? prev.b : [];
    }
    job.metadata = { ...job.metadata, boilerplate: lines.slice(0, 500) };
    await updateJob(job.id, { metadata: job.metadata });
  }
  const boilerplate = new Set(job.metadata.boilerplate);
  const payload = { ...page.payload, text: dropEmptySections(removeBoilerplate(page.payload?.text || '', boilerplate)) };

  if (payload.text.length < 80 && !payload.faqs?.length) {
    await setPage(page.id, { status: 'skipped', error_message: 'No meaningful content after removing menus and repeated sections' });
    return true;
  }
  try {
    const r = await upsertPageSource(page, payload, job);
    await setPage(page.id, { status: r.status, source_id: r.sourceId, error_message: r.note || null, extracted_content: payload.text.slice(0, 200_000) });
    if (r.embedded) await query('update public.seo_virji_website_crawl_jobs set embeddings_generated = embeddings_generated + $2 where id = $1', [job.id, r.embedded]);
  } catch (err) {
    logger.error('crawler.page_store_failed', { url: page.url, error: err.message });
    await setPage(page.id, { status: 'failed', error_message: `Could not store or embed this page: ${err.message.slice(0, 200)}` });
  }
  return true;
}

async function phaseFinalize(job) {
  const stats = await refreshStats(job.id);
  let removed = 0;
  const attempted = stats.processed + stats.failed;
  const healthy = stats.processed > 0 && stats.failed <= Math.max(3, attempted * 0.25);
  if (['incremental', 'full'].includes(job.mode) && healthy && !job.metadata.truncated) {
    const origin = new URL(job.metadata.start_url).origin;
    const stale = await many(
      `select s.id from public.seo_virji_knowledge_sources s
       where s.source_type = 'website' and s.status = 'active' and s.source_url like $1
         and not exists (select 1 from public.seo_virji_website_crawl_pages p
                         where p.crawl_job_id = $2 and p.url = s.source_url and p.status in ('new','updated','unchanged','failed'))`,
      [`${origin}%`, job.id],
    );
    for (const s of stale) {
      // Deactivated (not deleted) so the admin can see and restore it; it is no longer retrieved.
      await query(`update public.seo_virji_knowledge_sources set status = 'inactive', metadata = metadata || '{"removed_from_website":true}'::jsonb where id = $1`, [s.id]);
      removed += 1;
    }
  }
  const chunks = await one(
    `select count(*)::int n from public.seo_virji_knowledge_chunks c join public.seo_virji_knowledge_sources s on s.id = c.knowledge_source_id
     where s.source_type = 'website' and s.status = 'active'`,
  );
  const status = stats.processed === 0 && stats.failed > 0 ? 'failed' : 'completed';
  await updateJob(job.id, {
    status,
    phase: 'done',
    pages_removed: removed,
    chunks_total: chunks.n,
    completed_at: new Date(),
    lease_until: null,
    error_message:
      status === 'failed'
        ? 'No pages could be processed. Existing knowledge was kept.'
        : job.metadata.truncated
          ? `Stopped at the page limit (CRAWLER_MAX_PAGES=${env.CRAWLER_MAX_PAGES}); old pages were not removed.`
          : null,
    metadata: { ...job.metadata, embeddings_configured: env.openaiConfigured },
  });
  logger.info('crawler.finished', { jobId: job.id, status, ...stats, removed });
  return false;
}

const PHASES = { discover: phaseDiscover, fetch: phaseFetch, index: phaseIndex, finalize: phaseFinalize };

/* ------------------------------------------------------------ the stepper */

/**
 * Advances a job until it finishes or `budgetMs` elapses. Safe to call from anywhere and
 * concurrently: only the lease holder does work. Returns { done, status, phase }.
 */
export async function advanceJob(jobId, { budgetMs = 45_000 } = {}) {
  const deadline = Date.now() + budgetMs;
  let job = await one(
    `update public.seo_virji_website_crawl_jobs
       set lease_until = now() + make_interval(secs => $2), status = 'running', started_at = coalesce(started_at, now()), heartbeat_at = now()
     where id = $1 and ${ACTIVE} and (lease_until is null or lease_until < now())
     returning *`,
    [jobId, LEASE_SECONDS],
  );
  if (!job) {
    const current = await one('select status, phase from public.seo_virji_website_crawl_jobs where id = $1', [jobId]);
    return { done: !current || !['queued', 'running'].includes(current.status), busy: true, ...current };
  }

  try {
    let more = true;
    let steps = 0;
    let renewedAt = Date.now();
    while (more && Date.now() < deadline) {
      // Re-read state each step: phases change it, and an admin may cancel at any time.
      const fresh = await one('select status, phase, metadata from public.seo_virji_website_crawl_jobs where id = $1', [jobId]);
      if (fresh.status === 'cancelled') return { done: true, status: 'cancelled' };
      job = { ...job, ...fresh };
      more = await PHASES[job.phase](job);
      steps += 1;
      if (steps % 4 === 0 || !more) await refreshStats(jobId);
      // Renew the lease well before it expires.
      if (more && Date.now() - renewedAt > (LEASE_SECONDS * 1000) / 3) {
        await query(`update public.seo_virji_website_crawl_jobs set lease_until = now() + make_interval(secs => $2) where id = $1 and status = 'running'`, [jobId, LEASE_SECONDS]);
        renewedAt = Date.now();
      }
    }
    if (more) {
      await refreshStats(jobId);
      await query('update public.seo_virji_website_crawl_jobs set lease_until = null where id = $1', [jobId]);
      return { done: false, status: 'running', phase: job.phase };
    }
    return { done: true, status: (await one('select status from public.seo_virji_website_crawl_jobs where id = $1', [jobId])).status };
  } catch (err) {
    logger.error('crawler.step_failed', { jobId, error: err.message });
    await refreshStats(jobId).catch(() => {});
    await updateJob(jobId, {
      status: 'failed',
      phase: 'done',
      lease_until: null,
      completed_at: new Date(),
      error_message: `${String(err.message).slice(0, 300)} — existing knowledge was kept.`,
    });
    return { done: true, status: 'failed' };
  }
}

/** Runs a job to completion in this process (CLI, local server, cron with a long budget). */
export async function runToCompletion(jobId, { totalBudgetMs = Infinity, stepBudgetMs = 45_000 } = {}) {
  const stop = Date.now() + totalBudgetMs;
  for (;;) {
    const r = await advanceJob(jobId, { budgetMs: Math.min(stepBudgetMs, stop - Date.now()) });
    if (r.done || Date.now() >= stop) return r;
    if (r.busy) await sleep(2000); // another worker holds the lease
  }
}

/* ------------------------------------------------------------ public API */

export function serializeJob(j) {
  return (
    j && {
      id: j.id,
      websiteUrl: j.website_url,
      status: j.status,
      phase: j.phase,
      mode: j.mode,
      trigger: j.trigger,
      pagesFound: j.total_pages_found,
      pagesProcessed: j.pages_processed,
      pagesFailed: j.pages_failed,
      pagesSkipped: j.pages_skipped,
      pagesNew: j.pages_new,
      pagesUpdated: j.pages_updated,
      pagesUnchanged: j.pages_unchanged,
      pagesRemoved: j.pages_removed,
      embeddingsGenerated: j.embeddings_generated,
      chunksTotal: j.chunks_total,
      truncated: Boolean(j.metadata?.truncated),
      startedAt: j.started_at,
      completedAt: j.completed_at,
      heartbeatAt: j.heartbeat_at,
      error: j.error_message,
      singlePage: j.mode === 'single',
      url: j.metadata?.start_url || j.website_url,
      createdAt: j.created_at,
    }
  );
}

/**
 * Creates a sync job. By default it starts advancing in the background (waitUntil on Vercel).
 * `wait: true` runs it to completion before returning. Throws 409 if a sync is already active.
 */
export async function startCrawl({ url = env.SEO_VIRJI_WEBSITE_URL, trigger = 'manual', mode = 'incremental', singlePage = false, wait = false, budgetMs } = {}) {
  const effectiveMode = singlePage ? 'single' : mode;
  if (!MODES.includes(effectiveMode)) throw new Error(`Unknown sync mode: ${effectiveMode}`);
  const startUrl = normaliseUrl(url);
  const websiteUrl = new URL(startUrl).origin + '/';
  let job;
  try {
    job = await one(
      `insert into public.seo_virji_website_crawl_jobs (website_url, status, trigger, mode, phase, metadata) values ($1,'queued',$2,$3,'discover',$4) returning *`,
      [websiteUrl, trigger, effectiveMode, { start_url: startUrl, single_page: effectiveMode === 'single' }],
    );
  } catch (err) {
    if (err.code === '23505') throw conflict('A website sync is already running. Please wait for it to finish.');
    throw err;
  }
  if (wait) await runToCompletion(job.id, { totalBudgetMs: budgetMs ?? Infinity });
  else kick(job.id, { budgetMs });
  return one('select * from public.seo_virji_website_crawl_jobs where id = $1', [job.id]);
}

/** Continues a job in the background (no-op if another worker holds its lease). */
export function kick(jobId, { budgetMs } = {}) {
  const total = budgetMs ?? (process.env.VERCEL ? env.CRAWLER_STEP_BUDGET_MS : Infinity);
  return runInBackground('crawler.advance', () => runToCompletion(jobId, { totalBudgetMs: total }));
}

/** The active job (if any) is resumed when its lease has expired — used by status polling and cron. */
export async function resumeStalledJobs({ budgetMs } = {}) {
  const stalled = await many(
    `select id from public.seo_virji_website_crawl_jobs where ${ACTIVE} and (lease_until is null or lease_until < now()) order by created_at limit 3`,
  );
  for (const j of stalled) kick(j.id, { budgetMs });
  return stalled.length;
}

export async function cancelCrawl(jobId) {
  const row = await one(
    `update public.seo_virji_website_crawl_jobs set status='cancelled', phase='done', lease_until=null, completed_at=now(), error_message='Cancelled by an admin. Existing knowledge was kept.'
     where id=$1 and ${ACTIVE} returning id`,
    [jobId],
  );
  if (!row) {
    const exists = await one('select id from public.seo_virji_website_crawl_jobs where id = $1', [jobId]);
    if (!exists) throw notFound('Crawl job not found');
  }
  return Boolean(row);
}

/** Jobs with no progress for 2 hours are abandoned (they would otherwise block new syncs). */
export async function recoverInterruptedJobs() {
  const { rowCount } = await query(
    `update public.seo_virji_website_crawl_jobs set status='failed', phase='done', lease_until=null, completed_at=now(),
       error_message='Stopped making progress (no worker for 2 hours) — existing knowledge was kept.'
     where ${ACTIVE} and coalesce(heartbeat_at, started_at, created_at) < now() - interval '2 hours'`,
  );
  if (rowCount) logger.warn('crawler.recovered_interrupted_jobs', { count: rowCount });
  return rowCount;
}

/** Next scheduled run for simple daily cron expressions ("M H * * *", UTC on Vercel). */
export function nextScheduledRun(expr = env.CRAWLER_SCHEDULE, now = new Date()) {
  const m = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(String(expr).trim());
  if (!m) return null;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[2]), Number(m[1])));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
