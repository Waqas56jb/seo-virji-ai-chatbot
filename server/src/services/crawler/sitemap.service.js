/** robots.txt parsing and sitemap discovery (including sitemap index files). */
import * as cheerio from 'cheerio';
import { fetchWithRetry } from './scraper.service.js';
import { normaliseUrl } from '../../utils/url-validator.js';
import { logger } from '../../utils/logger.js';

/** Parses rules for `User-agent: *` (and our own UA) plus Sitemap lines. */
export function parseRobots(text) {
  const rules = { disallow: [], allow: [], sitemaps: [] };
  let applies = false;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') applies = value === '*' || /seovirji/i.test(value);
    else if (key === 'sitemap') rules.sitemaps.push(value);
    else if (applies && key === 'disallow' && value) rules.disallow.push(value);
    else if (applies && key === 'allow' && value) rules.allow.push(value);
  }
  return rules;
}

const toRegex = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);

/** Longest-match wins, Allow beats Disallow on ties (Google semantics). */
export function isAllowedByRobots(url, rules) {
  const path = new URL(url).pathname + new URL(url).search;
  let best = { len: -1, allow: true };
  for (const p of rules.disallow) if (toRegex(p).test(path) && p.length > best.len) best = { len: p.length, allow: false };
  for (const p of rules.allow) if (toRegex(p).test(path) && p.length >= best.len) best = { len: p.length, allow: true };
  return best.allow;
}

export async function fetchRobots(origin) {
  try {
    const res = await fetchWithRetry(`${origin}/robots.txt`, { accept: 'text/plain', allowedTypes: ['text/plain'] }, 1);
    return res.status === 200 ? parseRobots(res.body) : parseRobots('');
  } catch (err) {
    logger.warn('crawler.robots_unavailable', { error: err.message });
    return parseRobots('');
  }
}

/**
 * WordPress sites publish their public pages/posts through the REST API. This catches
 * published pages that are missing from the sitemap. Failures (not WordPress, API
 * disabled) are ignored — sitemap + link discovery still run.
 */
export async function discoverFromWordPress(origin, { maxPagesPerType = 5 } = {}) {
  const urls = new Set();
  for (const type of ['pages', 'posts']) {
    for (let page = 1; page <= maxPagesPerType; page += 1) {
      try {
        const res = await fetchWithRetry(
          `${origin}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_fields=link,status`,
          { accept: 'application/json', allowedTypes: ['application/json'] },
          1,
        );
        if (res.status !== 200 || !res.body) break;
        const items = JSON.parse(res.body);
        if (!Array.isArray(items) || !items.length) break;
        for (const it of items) {
          if (it?.status && it.status !== 'publish') continue;
          const n = normaliseUrl(String(it?.link || ''));
          if (n) urls.add(n);
        }
        if (items.length < 100) break;
      } catch (err) {
        logger.info('crawler.wordpress_api_unavailable', { type, error: err.message });
        break;
      }
    }
  }
  return [...urls];
}

/** Collects page URLs from sitemaps, following sitemap indexes (bounded). */
export async function discoverFromSitemaps(sitemapUrls, { maxSitemaps = 20 } = {}) {
  const queue = [...new Set(sitemapUrls)];
  const seen = new Set();
  const pages = [];
  while (queue.length && seen.size < maxSitemaps) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const res = await fetchWithRetry(sm, { accept: 'application/xml,text/xml', allowedTypes: ['application/xml', 'text/xml'] }, 1);
      if (res.status !== 200 || !res.body) continue;
      const $ = cheerio.load(res.body, { xmlMode: true });
      $('sitemapindex > sitemap > loc').each((_, el) => queue.push($(el).text().trim()));
      $('urlset > url').each((_, el) => {
        const loc = normaliseUrl($(el).find('loc').first().text().trim());
        if (loc) pages.push({ url: loc, lastmod: $(el).find('lastmod').first().text().trim() || null });
      });
    } catch (err) {
      logger.warn('crawler.sitemap_failed', { sitemap: sm, error: err.message });
    }
  }
  return pages;
}
