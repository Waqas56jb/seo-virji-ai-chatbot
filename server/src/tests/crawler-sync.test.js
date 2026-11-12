/**
 * Website sync state machine against the REAL database with a MOCKED website.
 * A fixture site (https://fixture.seovirji.test) is served by a stubbed fetch, and embeddings
 * are deterministic fakes — no network and no OpenAI cost. Only fixture rows are touched and
 * they are removed afterwards; the real seovirji.com knowledge is never affected.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/url-validator.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, assertSafeUrl: vi.fn(async (u) => new URL(u)) }; // fixture host does not resolve in DNS
});
const embedCalls = { texts: 0 };
vi.mock('../services/ai/embedding.service.js', () => {
  const vec = (t) => Array.from({ length: 1536 }, (_, i) => Math.sin((t.length + i) * 0.01));
  return {
    embeddingsAvailable: () => true,
    embedTexts: vi.fn(async (texts) => {
      embedCalls.texts += texts.length;
      return texts.map(vec);
    }),
    embedQuery: vi.fn(async (t) => vec(t)),
  };
});

const { env } = await import('../config/env.js');
const { many, one, pool, query } = await import('../config/supabase.js');
const crawler = await import('../services/crawler/crawler.service.js');
const knowledge = await import('../services/knowledge/knowledge.service.js');

const ORIGIN = 'https://fixture.seovirji.test';
const SITE = `${ORIGIN}/`;
const LONG = (topic) =>
  Array.from({ length: 6 }, (_, i) => `<p>${topic} paragraph ${i + 1}: SEO Virji explains ${topic.toLowerCase()} in practical detail for growing businesses, with clear steps and honest expectations.</p>`).join('');
const page = ({ title, body, links = [], head = '', footer = true }) => `<!doctype html><html><head><title>${title}</title>${head}</head><body>
  <header><nav><a href="/">Home</a><a href="/about/">About</a></nav></header>
  <main><h1>${title}</h1>${body}${links.map((l) => `<a href="${l}">${l}</a>`).join(' ')}</main>
  ${footer ? '<footer><p>© 2026 Fixture SEO. All rights reserved.</p><a href="mailto:hello@fixture.test">hello@fixture.test</a><a href="tel:+923001234567">Call</a><a href="https://wa.me/923001234567">WhatsApp</a></footer>' : ''}
</body></html>`;

/** Mutable fixture website. */
const site = {};
function resetSite() {
  Object.assign(site, {
    '/robots.txt': { type: 'text/plain', body: `User-agent: *\nDisallow: /private/\nSitemap: ${ORIGIN}/sitemap_index.xml` },
    '/sitemap_index.xml': { type: 'application/xml', body: `<?xml version="1.0"?><sitemapindex><sitemap><loc>${ORIGIN}/page-sitemap.xml</loc></sitemap><sitemap><loc>${ORIGIN}/post-sitemap.xml</loc></sitemap></sitemapindex>` },
    '/page-sitemap.xml': {
      type: 'application/xml',
      body: `<?xml version="1.0"?><urlset>${['/', '/services/seo-audit/', '/about/', '/old-url/', '/private/secret/', '/cart/', '/noindex/']
        .map((p) => `<url><loc>${ORIGIN}${p}</loc><lastmod>2026-11-01</lastmod></url>`).join('')}</urlset>`,
    },
    '/post-sitemap.xml': { type: 'application/xml', body: `<?xml version="1.0"?><urlset><url><loc>${ORIGIN}/blog/post-one/</loc></url></urlset>` },
    '/wp-json/wp/v2/pages?per_page=100&page=1&_fields=link,status': { type: 'application/json', body: JSON.stringify([{ link: `${ORIGIN}/contact/`, status: 'publish' }]) },
    '/wp-json/wp/v2/posts?per_page=100&page=1&_fields=link,status': { type: 'application/json', body: '[]' },
    '/': { body: page({ title: 'Fixture SEO — Home', body: LONG('Niche protection'), links: ['/services/seo-audit/', '/blog/', '/about/?utm_source=nav', '/pricing/', '/dup/', '/seo-audit-alt/', 'https://other-site.example/'] }) },
    '/services/seo-audit/': { body: page({ title: 'SEO Audit Service', body: LONG('Technical SEO audits') }) },
    '/seo-audit-alt/': { body: page({ title: 'SEO Audit (alt)', head: `<link rel="canonical" href="${ORIGIN}/services/seo-audit/">`, body: LONG('Technical SEO audits alt') }) },
    '/about/': { body: page({ title: 'About Fixture SEO', body: LONG('Our story') }) },
    '/dup/': { body: page({ title: 'About Fixture SEO', body: LONG('Our story') }) },
    '/old-url/': { status: 301, location: '/about/' },
    '/noindex/': { body: page({ title: 'Hidden', head: '<meta name="robots" content="noindex">', body: LONG('Hidden') }) },
    '/contact/': { body: page({ title: 'Contact', body: LONG('Contact and office hours') }) },
    '/blog/': { body: page({ title: 'Blog', body: LONG('Latest articles'), links: ['/blog/post-one/'], head: `<link rel="next" href="${ORIGIN}/blog/page/2/">` }) },
    '/blog/page/2/': { body: page({ title: 'Blog page 2', body: LONG('Older articles'), links: ['/blog/post-two/'] }) },
    '/blog/post-one/': { body: page({ title: 'Post One', head: '<meta property="og:type" content="article"><meta property="article:published_time" content="2026-10-01T00:00:00Z">', body: LONG('Local SEO') }) },
    '/blog/post-two/': { body: page({ title: 'Post Two', head: '<meta property="og:type" content="article">', body: LONG('Content strategy') }) },
    '/pricing/': { status: 500, body: 'Server error' },
  });
}

const fetchLog = [];
async function fakeFetch(input) {
  const u = new URL(String(input));
  if (u.origin !== ORIGIN) return new Response('not found', { status: 404 });
  const key = u.pathname + u.search;
  fetchLog.push({ path: key, at: Date.now() });
  const entry = site[key] || site[u.pathname];
  if (!entry) return new Response('<html><body>Not found</body></html>', { status: 404, headers: { 'content-type': 'text/html' } });
  if (entry.location) return new Response(null, { status: entry.status || 301, headers: { location: entry.location } });
  return new Response(entry.body, { status: entry.status || 200, headers: { 'content-type': entry.type || 'text/html; charset=utf-8' } });
}

async function cleanup() {
  await query(`delete from public.seo_virji_website_crawl_jobs where website_url = $1`, [SITE]);
  await query(`delete from public.seo_virji_knowledge_sources where source_type = 'website' and source_url like $1`, [`${ORIGIN}%`]);
}

const pagesOf = async (jobId) =>
  Object.fromEntries(
    (await many('select url, status, error_message, http_status, discovered_via from public.seo_virji_website_crawl_pages where crawl_job_id = $1', [jobId])).map((p) => [
      p.url.replace(ORIGIN, ''),
      p,
    ]),
  );
const sync = (mode = 'incremental', extra = {}) => crawler.startCrawl({ url: SITE, trigger: 'test', mode, wait: true, ...extra });

const realFetch = globalThis.fetch;
const originalDelay = env.CRAWLER_REQUEST_DELAY_MS;
beforeAll(async () => {
  env.crawlerAllowedHosts.push('fixture.seovirji.test');
  env.CRAWLER_REQUEST_DELAY_MS = 40;
  globalThis.fetch = fakeFetch;
  resetSite();
  await cleanup();
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  env.CRAWLER_REQUEST_DELAY_MS = originalDelay;
  await cleanup();
  await pool.end();
});

describe('website sync (mocked site, real database)', () => {
  let firstJob;

  it('discovers via sitemap index, WordPress API, links and pagination; records every URL with a reason', async () => {
    firstJob = await sync('full');
    expect(firstJob.status).toBe('completed');
    const p = await pagesOf(firstJob.id);

    // Discovery channels
    expect(p['/blog/post-one/'].discovered_via).toBe('sitemap'); // from the nested post sitemap (sitemap index)
    expect(p['/contact/'].discovered_via).toBe('wordpress_api');
    expect(p['/blog/page/2/'].discovered_via).toBe('pagination');
    expect(p['/blog/post-two/']).toBeDefined(); // recursive: found only through page 2

    // Indexed pages
    for (const path of ['/', '/services/seo-audit/', '/about/', '/contact/', '/blog/', '/blog/post-one/', '/blog/post-two/']) {
      expect(p[path]?.status, path).toBe('new');
    }
    // Skips with reasons
    expect(p['/private/secret/']).toMatchObject({ status: 'skipped', error_message: 'Blocked by robots.txt' });
    expect(p['/cart/'].error_message).toMatch(/Private or transactional/);
    expect(p['/noindex/'].error_message).toMatch(/noindex/);
    expect(p['/old-url/'].error_message).toMatch(/Redirects to .*\/about\//);
    expect(p['/dup/'].error_message).toMatch(/Same content as/);
    expect(p['/seo-audit-alt/'].error_message).toMatch(/canonical/i);
    expect(p['/blog/page/2/'].error_message).toMatch(/Listing page/);
    // Duplicate URL forms are normalised (tracking params dropped) — /about/ only once.
    expect(Object.keys(p).filter((k) => k.startsWith('/about')).length).toBe(1);
    // Other domains are never queued.
    expect(Object.keys(p).some((k) => k.includes('other-site'))).toBe(false);
    // Failed page reporting (after retries)
    expect(p['/pricing/']).toMatchObject({ status: 'failed', error_message: 'HTTP 500' });
    expect(fetchLog.filter((f) => f.path === '/pricing/').length).toBe(3); // 1 try + 2 retries

    const job = await one('select * from public.seo_virji_website_crawl_jobs where id = $1', [firstJob.id]);
    expect(job).toMatchObject({ pages_new: 7, pages_failed: 1, phase: 'done' });
    expect(job.pages_skipped).toBeGreaterThanOrEqual(7);
  }, 300_000);

  it('stores searchable, embedded knowledge with metadata and the published contact details', async () => {
    const sources = await many(`select id, title, source_url, content, metadata, embedding_status from public.seo_virji_knowledge_sources where source_url like $1 and status = 'active'`, [`${ORIGIN}%`]);
    expect(sources.length).toBe(7);
    expect(sources.every((s) => s.embedding_status === 'complete')).toBe(true);
    const home = sources.find((s) => s.source_url === SITE);
    expect(home.content).toMatch(/Email: hello@fixture\.test/);
    expect(home.content).toMatch(/WhatsApp: \+923001234567/);
    expect(home.content).not.toMatch(/All rights reserved/); // footer boilerplate removed
    const post = sources.find((s) => s.source_url.endsWith('/blog/post-one/'));
    expect(post.metadata).toMatchObject({ category: 'blog', published_at: '2026-10-01T00:00:00Z' });
    const chunks = await one(
      `select count(*)::int n, count(embedding)::int e from public.seo_virji_knowledge_chunks c join public.seo_virji_knowledge_sources s on s.id = c.knowledge_source_id where s.source_url like $1`,
      [`${ORIGIN}%`],
    );
    expect(chunks.n).toBeGreaterThan(0);
    expect(chunks.e).toBe(chunks.n);
  }, 300_000);

  it('respects the crawl delay between page requests', () => {
    // One entry per crawled page (redirect hops and retries belong to the same page request).
    const htmlFetches = fetchLog.filter(
      (f, i) => !/.xml|robots|wp-json/.test(f.path) && f.path !== '/pricing/' && fetchLog[i - 1]?.path !== '/old-url/',
    );
    const gaps = htmlFetches.slice(1).map((f, i) => f.at - htmlFetches[i].at);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(35);
  });

  it('incremental sync: unchanged pages are not re-embedded', async () => {
    embedCalls.texts = 0;
    const job = await sync('incremental');
    const p = await pagesOf(job.id);
    expect(p['/about/'].status).toBe('unchanged');
    expect(embedCalls.texts).toBe(0);
  }, 300_000);

  it('incremental sync: a changed page is updated and only its new chunks are embedded', async () => {
    site['/about/'] = { body: page({ title: 'About Fixture SEO', body: `${LONG('Our story')}<p>New: we now also offer quarterly strategy reviews for every client.</p>` }) };
    embedCalls.texts = 0;
    const job = await sync('incremental');
    const p = await pagesOf(job.id);
    expect(p['/about/'].status).toBe('updated');
    expect(embedCalls.texts).toBeGreaterThan(0);
    expect(embedCalls.texts).toBeLessThan(5);
    const about = await one(`select content, version from public.seo_virji_knowledge_sources where source_url = $1`, [`${ORIGIN}/about/`]);
    expect(about.content).toMatch(/quarterly strategy reviews/);
    expect(about.version).toBeGreaterThan(1);
  }, 300_000);

  it('retry mode re-processes only the URLs that failed last time', async () => {
    site['/pricing/'] = { body: page({ title: 'Pricing', body: LONG('Packages and pricing') }) };
    const job = await sync('retry');
    const p = await pagesOf(job.id);
    expect(Object.keys(p)).toEqual(['/pricing/']);
    expect(p['/pricing/'].status).toBe('new');
  }, 300_000);

  it('keeps the admin-edited version of a page during later syncs', async () => {
    const src = await one(`select id from public.seo_virji_knowledge_sources where source_url = $1`, [`${ORIGIN}/services/seo-audit/`]);
    await knowledge.updateSource(src.id, { content: 'Owner-approved description of the SEO audit service, written in the admin panel.' });
    site['/services/seo-audit/'] = { body: page({ title: 'SEO Audit Service', body: LONG('Completely rewritten audits') }) };
    await sync('incremental');
    const after = await one(`select content, metadata from public.seo_virji_knowledge_sources where id = $1`, [src.id]);
    expect(after.content).toMatch(/Owner-approved/);
    expect(after.metadata.admin_edited).toBe(true);
    expect(after.metadata.website_changed).toBe(true); // flagged so the admin can review it
  }, 300_000);

  it('single-page sync only touches that page', async () => {
    const job = await sync('incremental', { singlePage: true, url: `${ORIGIN}/contact/` });
    const p = await pagesOf(job.id);
    expect(Object.keys(p)).toEqual(['/contact/']);
    expect(job.mode).toBe('single');
  }, 300_000);

  it('pages removed from the website are deactivated (not deleted) after a healthy full sync', async () => {
    delete site['/blog/post-two/'];
    site['/blog/page/2/'] = { body: page({ title: 'Blog page 2', body: LONG('Older articles'), links: [] }) };
    const job = await sync('full');
    expect(job.pages_removed).toBe(1);
    const removed = await one(`select status, metadata from public.seo_virji_knowledge_sources where source_url = $1`, [`${ORIGIN}/blog/post-two/`]);
    expect(removed.status).toBe('inactive');
    expect(removed.metadata.removed_from_website).toBe(true);
  }, 300_000);

  it('is resumable: small time slices (separate invocations) finish the same job', async () => {
    const job = await crawler.startCrawl({ url: SITE, trigger: 'test', mode: 'incremental', budgetMs: 0 });
    let steps = 0;
    let r;
    do {
      r = await crawler.advanceJob(job.id, { budgetMs: 300 });
      steps += 1;
    } while (!r.done && steps < 200);
    expect(r.done).toBe(true);
    expect(steps).toBeGreaterThan(3);
    const done = await one('select status, phase, pages_processed from public.seo_virji_website_crawl_jobs where id = $1', [job.id]);
    expect(done).toMatchObject({ status: 'completed', phase: 'done' });
    expect(done.pages_processed).toBeGreaterThanOrEqual(7);
  }, 300_000);

  it('allows only one active sync per website and supports cancellation', async () => {
    const job = await crawler.startCrawl({ url: SITE, trigger: 'test', budgetMs: 0 });
    await expect(crawler.startCrawl({ url: SITE, trigger: 'test', budgetMs: 0 })).rejects.toMatchObject({ status: 409 });
    expect(await crawler.cancelCrawl(job.id)).toBe(true);
    const r = await crawler.advanceJob(job.id, { budgetMs: 1000 });
    expect(r.done).toBe(true);
    expect((await one('select status from public.seo_virji_website_crawl_jobs where id = $1', [job.id])).status).toBe('cancelled');
  }, 300_000);

  it('a second worker cannot advance a job while another holds its lease', async () => {
    const job = await crawler.startCrawl({ url: SITE, trigger: 'test', budgetMs: 0 });
    await query(`update public.seo_virji_website_crawl_jobs set lease_until = now() + interval '60 seconds' where id = $1`, [job.id]);
    const r = await crawler.advanceJob(job.id, { budgetMs: 500 });
    expect(r.busy).toBe(true);
    await crawler.cancelCrawl(job.id);
  }, 300_000);

  it('computes the next scheduled run (UTC daily cron)', () => {
    expect(crawler.nextScheduledRun('0 3 * * *', new Date('2026-11-11T01:00:00Z'))).toBe('2026-11-11T03:00:00.000Z');
    expect(crawler.nextScheduledRun('0 3 * * *', new Date('2026-11-11T04:00:00Z'))).toBe('2026-11-12T03:00:00.000Z');
    expect(crawler.nextScheduledRun('*/5 * * * *')).toBeNull();
  });
});
