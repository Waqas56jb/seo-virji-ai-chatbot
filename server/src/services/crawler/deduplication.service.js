import { normaliseUrl } from '../../utils/url-validator.js';
import { sha256 } from '../../utils/text-utils.js';

/**
 * URLs that are never crawled, each with the reason shown in the crawl log.
 * Private/transactional areas (account, cart, checkout, affiliate dashboards) are excluded
 * on purpose: they are not public business information and must not be accessed.
 */
const EXCLUDE = [
  [/\/wp-(admin|login|json|content|includes)\b|\/xmlrpc\.php/i, 'WordPress system URL'],
  [/\/(cart|checkout|my-account|affiliate-dashboard|account|login|register|lost-password|wishlist)(\/|$)/i, 'Private or transactional page (account / cart / checkout) — never crawled'],
  [/\/(feed|comments\/feed)\/?$/i, 'RSS feed'],
  [/[?&](add-to-cart|replytocom|s|preview|share|orderby|filter_[a-z_]+)=/i, 'Action or search URL'],
  [/\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|mp4|webm|mp3|wav|docx?|xlsx?|pptx?|css|js|json|xml|txt)(\?|$)/i, 'File, not a web page'],
];

export function exclusionReason(url) {
  for (const [re, reason] of EXCLUDE) if (re.test(url)) return reason;
  return null;
}

export function isExcludedUrl(url) {
  return Boolean(exclusionReason(url));
}

/**
 * Listing pages (category/tag/author archives, paginated indexes) are fetched only to
 * discover the articles they link to — their excerpts are not stored as knowledge, because
 * the full articles are crawled themselves.
 */
const LISTING = /\/(category|tag|author)\/|\/page\/\d+\/?$|[?&](paged|page)=\d+/i;
export function isListingUrl(url) {
  return LISTING.test(url);
}

export function canonical(url) {
  return normaliseUrl(url);
}

/** Content fingerprint that ignores whitespace-only and case differences. */
export function contentHash(text) {
  return sha256(String(text || '').replace(/\s+/g, ' ').trim().toLowerCase());
}
