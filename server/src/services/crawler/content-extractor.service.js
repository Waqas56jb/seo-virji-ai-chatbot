/**
 * Extracts meaningful, structured text from HTML with Cheerio.
 * Keeps headings (as "## Heading" lines) so the chunker can preserve section context.
 * Removes navigation, header/footer templates, scripts, styles, forms, cookie banners, etc.
 */
import * as cheerio from 'cheerio';
import { normaliseUrl } from '../../utils/url-validator.js';
import { normaliseWhitespace } from '../../utils/text-utils.js';

const REMOVE = [
  'script', 'style', 'noscript', 'svg', 'iframe', 'canvas', 'template', 'form', 'button', 'select', 'input', 'textarea',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[aria-hidden="true"]',
  '[data-elementor-type="header"]', '[data-elementor-type="footer"]', '[data-elementor-type="popup"]',
  '.screen-reader-text', '.skip-link', '.elementor-menu-toggle', '.elementor-nav-menu', '.menu', '.breadcrumb', '.breadcrumbs',
  '.woocommerce-store-notice', '.sharedaddy', '.share', '.social', '.comments-area', '#comments', '.widget_search',
];
const NOISE = /(cookie|consent|gdpr|newsletter-popup|popup|modal|advert|banner-ad|ads?-)/i;
const BLOCK = new Set(['p', 'li', 'dt', 'dd', 'blockquote', 'td', 'th', 'figcaption', 'div', 'section', 'article', 'span', 'pre', 'address']);
const HEADING = /^h[1-6]$/;
const BLOCK_CHILD = 'p,li,div,section,article,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,dl';

function collectStructuredFaqs($) {
  const faqs = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data['@graph'] || [])];
      for (const n of nodes) {
        if (n && n['@type'] === 'FAQPage' && Array.isArray(n.mainEntity)) {
          for (const q of n.mainEntity) {
            const answer = q?.acceptedAnswer?.text;
            if (q?.name && answer) faqs.push({ question: String(q.name).trim(), answer: cheerio.load(String(answer)).text().trim() });
          }
        }
      }
    } catch {
      /* malformed JSON-LD is ignored */
    }
  });
  return faqs;
}

export function extractContent(html, pageUrl) {
  const $ = cheerio.load(html);

  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').replace(/\s+/g, ' ').trim();
  const description = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();
  const faqs = collectStructuredFaqs($);
  const robotsMeta = ($('meta[name="robots"]').attr('content') || '').toLowerCase();

  const canonicalHref = $('link[rel="canonical"]').attr('href');
  const canonical = canonicalHref ? normaliseUrl(canonicalHref, pageUrl) : null;
  const ogType = ($('meta[property="og:type"]').attr('content') || '').toLowerCase();
  const published = $('meta[property="article:published_time"]').attr('content') || null;
  const modified = $('meta[property="article:modified_time"]').attr('content') || null;
  const isArticle = ogType === 'article' || Boolean(published);

  // Contact details the website itself publishes (mailto:, tel:, WhatsApp links).
  const contacts = { emails: new Set(), phones: new Set(), whatsapp: new Set() };
  // Internal links for discovery (collected before navigation is removed).
  const links = new Set();
  $('a[href]').each((_, a) => {
    const href = ($(a).attr('href') || '').trim();
    if (!href || href.startsWith('javascript:')) return;
    if (href.startsWith('mailto:')) {
      const email = decodeURIComponent(href.slice(7).split('?')[0]).trim();
      if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) contacts.emails.add(email.toLowerCase());
      return;
    }
    if (href.startsWith('tel:')) {
      const phone = href.slice(4).replace(/[^\d+]/g, '');
      if (phone.replace(/\D/g, '').length >= 7) contacts.phones.add(phone);
      return;
    }
    const wa = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{7,15})/i.exec(href);
    if (wa) {
      contacts.whatsapp.add(wa[1].replace(/\D/g, ''));
      return;
    }
    const n = normaliseUrl(href, pageUrl);
    if (n) links.add(n);
  });

  // Pagination (rel=next/prev, WordPress/Elementor page-number links).
  const pagination = new Set();
  $('link[rel="next"], link[rel="prev"], a[rel="next"], a[rel="prev"], .pagination a[href], .page-numbers[href], .nav-links a[href]').each((_, el) => {
    const n = normaliseUrl($(el).attr('href') || '', pageUrl);
    if (n) pagination.add(n);
  });

  $(REMOVE.join(',')).remove();
  $('[class],[id]').each((_, el) => {
    const marker = `${$(el).attr('class') || ''} ${$(el).attr('id') || ''}`;
    if (NOISE.test(marker) && !/elementor-widget-text|entry-content/.test(marker)) $(el).remove();
  });

  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');

  const lines = [];
  const headings = [];
  const walk = (node) => {
    $(node)
      .children()
      .each((_, el) => {
        const tag = el.tagName?.toLowerCase();
        if (!tag) return;
        if (HEADING.test(tag)) {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text) {
            lines.push(`## ${text}`);
            headings.push(text);
          }
          return;
        }
        if (tag === 'br') return;
        const hasBlockChildren = $(el).children(BLOCK_CHILD).length > 0;
        if (BLOCK.has(tag) && !hasBlockChildren) {
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text) lines.push(tag === 'li' ? `- ${text}` : text);
          return;
        }
        walk(el);
      });
  };
  walk(root);

  // Remove immediate duplicates and decorative fragments (single words, symbols).
  const cleaned = [];
  for (const line of lines) {
    if (line === cleaned[cleaned.length - 1]) continue;
    if (!line.startsWith('## ') && line.replace(/[^a-z0-9]/gi, '').length < 3) continue;
    cleaned.push(line);
  }

  return {
    title,
    description,
    headings,
    faqs,
    noindex: robotsMeta.includes('noindex'),
    text: normaliseWhitespace(cleaned.join('\n')),
    links: [...links],
    pagination: [...pagination],
    canonical,
    isArticle,
    published,
    modified,
    contacts: { emails: [...contacts.emails], phones: [...contacts.phones], whatsapp: [...contacts.whatsapp] },
  };
}
