/**
 * Safe HTTP fetching for the crawler.
 *  - every URL (and every redirect hop) passes SSRF validation
 *  - timeouts, response-size cap, content-type checks, limited retries
 *  - optional Playwright rendering for pages that need JavaScript (only if installed)
 */
import { env } from '../../config/env.js';
import { assertSafeUrl, normaliseUrl } from '../../utils/url-validator.js';
import { logger } from '../../utils/logger.js';

export const USER_AGENT = 'SEOVirjiKnowledgeBot/1.0 (+https://seovirji.com/; website knowledge sync for the SEO Virji assistant)';
const MAX_REDIRECTS = 5;

async function readCapped(res, maxBytes) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error(`Response exceeds ${maxBytes} bytes`), { code: 'TOO_LARGE' });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/**
 * Fetches a URL following redirects manually (each hop re-validated).
 * Returns { url, status, contentType, body }.
 */
export async function safeFetch(rawUrl, { accept = 'text/html,application/xhtml+xml', allowedTypes = ['text/html', 'application/xhtml+xml'], maxBytes = env.CRAWLER_MAX_BYTES, allowedHosts = env.crawlerAllowedHosts } = {}) {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertSafeUrl(url, allowedHosts);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.CRAWLER_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en' },
      });
    } catch (err) {
      clearTimeout(timer);
      throw Object.assign(new Error(err.name === 'AbortError' ? 'Request timed out' : `Network error: ${err.message}`), { code: 'FETCH_FAILED' });
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      const next = normaliseUrl(res.headers.get('location'), url);
      if (!next) throw Object.assign(new Error('Invalid redirect target'), { code: 'UNSAFE_URL' });
      url = next; // validated at the top of the next loop iteration
      continue;
    }

    try {
      const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const declared = Number(res.headers.get('content-length') || 0);
      if (declared && declared > maxBytes) throw Object.assign(new Error('Response too large'), { code: 'TOO_LARGE' });
      if (res.ok && allowedTypes.length && !allowedTypes.includes(contentType)) {
        return { url, status: res.status, contentType, body: '' };
      }
      const body = res.ok ? await readCapped(res, maxBytes) : '';
      return { url, status: res.status, contentType, body };
    } finally {
      clearTimeout(timer);
    }
  }
  throw Object.assign(new Error('Too many redirects'), { code: 'TOO_MANY_REDIRECTS' });
}

/** Retries transient failures (network / 5xx / 429) a limited number of times. */
export async function fetchWithRetry(url, opts, retries = 2) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await safeFetch(url, opts);
      if (res.status >= 500 || res.status === 429) {
        last = Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      } else {
        return res;
      }
    } catch (err) {
      if (['UNSAFE_URL', 'TOO_LARGE', 'TOO_MANY_REDIRECTS'].includes(err.code)) throw err;
      last = err;
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw last;
}

let playwrightModule;
/** Renders a page with Playwright when available (optional dependency). Returns HTML or null. */
export async function renderWithBrowser(url) {
  if (playwrightModule === null) return null;
  try {
    playwrightModule ||= await import('playwright');
  } catch {
    playwrightModule = null;
    logger.info('crawler.playwright_unavailable');
    return null;
  }
  await assertSafeUrl(url, env.crawlerAllowedHosts);
  const browser = await playwrightModule.chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    // Block navigation/requests to anything outside the allowlist.
    await page.route('**/*', (route) => {
      try {
        const host = new URL(route.request().url()).hostname.toLowerCase();
        return env.crawlerAllowedHosts.includes(host) ? route.continue() : route.abort();
      } catch {
        return route.abort();
      }
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: env.CRAWLER_TIMEOUT_MS });
    return await page.content();
  } finally {
    await browser.close();
  }
}
