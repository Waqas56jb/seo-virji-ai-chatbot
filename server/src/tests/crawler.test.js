import { describe, expect, it } from 'vitest';
import { assertSafeUrl, checkUrlShape, isPrivateIp, normaliseUrl } from '../utils/url-validator.js';
import { isAllowedByRobots, parseRobots } from '../services/crawler/sitemap.service.js';
import { extractContent } from '../services/crawler/content-extractor.service.js';
import { chunkDocument } from '../services/crawler/content-chunker.service.js';
import { dropEmptySections, findBoilerplateLines, removeBoilerplate } from '../services/crawler/content-cleaner.service.js';
import { isExcludedUrl } from '../services/crawler/deduplication.service.js';

const ALLOWED = ['seovirji.com', 'www.seovirji.com'];

describe('SSRF protection', () => {
  it('flags private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp('104.21.32.1')).toBe(false);
  });

  it('rejects localhost, IPs, credentials, odd ports, other domains and non-http schemes', () => {
    expect(checkUrlShape('http://localhost/', ALLOWED)).toMatch(/Local/);
    expect(checkUrlShape('http://127.0.0.1/', ALLOWED)).toMatch(/Private/);
    expect(checkUrlShape('http://169.254.169.254/latest/meta-data', ALLOWED)).toMatch(/Private/);
    expect(checkUrlShape('https://user:pw@seovirji.com/', ALLOWED)).toMatch(/credentials/);
    expect(checkUrlShape('https://seovirji.com:8443/', ALLOWED)).toMatch(/port/);
    expect(checkUrlShape('file:///etc/passwd', ALLOWED)).toMatch(/http/);
    expect(checkUrlShape('https://evil.com/', ALLOWED)).toMatch(/Only these domains/);
    expect(checkUrlShape('https://seovirji.com.evil.com/', ALLOWED)).toMatch(/Only these domains/);
    expect(checkUrlShape('https://seovirji.com/services/', ALLOWED)).toBeNull();
  });

  it('rejects domains that resolve to private addresses (DNS check)', async () => {
    await expect(assertSafeUrl('http://localtest.me/', ['localtest.me'])).rejects.toThrow(/private|resolved/i);
  });
});

describe('URL normalisation', () => {
  it('removes fragments and tracking parameters, lowercases hosts, keeps meaningful params', () => {
    expect(normaliseUrl('https://SEOVirji.com/page/?utm_source=x&fbclid=y&b=2&a=1#top')).toBe('https://seovirji.com/page/?a=1&b=2');
    expect(normaliseUrl('https://seovirji.com:443/')).toBe('https://seovirji.com/');
    expect(normaliseUrl('javascript:alert(1)')).toBeNull();
  });

  it('excludes WordPress/WooCommerce utility pages', () => {
    for (const u of ['https://seovirji.com/cart/', 'https://seovirji.com/checkout/', 'https://seovirji.com/my-account/', 'https://seovirji.com/wp-admin/', 'https://seovirji.com/feed/', 'https://seovirji.com/logo.png']) {
      expect(isExcludedUrl(u), u).toBe(true);
    }
    expect(isExcludedUrl('https://seovirji.com/the-power-of-seo-for-long-term-growth/')).toBe(false);
  });
});

describe('robots.txt', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nSitemap: https://seovirji.com/sitemap.xml');
  it('parses rules and sitemaps', () => {
    expect(rules.sitemaps).toEqual(['https://seovirji.com/sitemap.xml']);
    expect(isAllowedByRobots('https://seovirji.com/wp-admin/options.php', rules)).toBe(false);
    expect(isAllowedByRobots('https://seovirji.com/wp-admin/admin-ajax.php', rules)).toBe(true);
    expect(isAllowedByRobots('https://seovirji.com/services/', rules)).toBe(true);
  });
});

describe('content extraction', () => {
  const html = `<!doctype html><html><head><title>SEO Services | SEO Virji</title><meta name="description" content="Exclusive SEO."></head>
    <body><header><nav><a href="/">Home</a><a href="/about/">About</a></nav></header>
    <div class="cookie-consent">We use cookies</div>
    <main><h1>Our services</h1><p>We work with one business per niche worldwide.</p>
    <ul><li>Technical SEO</li><li>On-page SEO</li></ul>
    <script>window.secret = 1</script><style>.x{}</style></main>
    <footer>© SEO Virji</footer>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"name":"Do you guarantee rankings?","acceptedAnswer":{"text":"<p>No ethical agency can.</p>"}}]}</script>
    </body></html>`;
  const out = extractContent(html, 'https://seovirji.com/services/');

  it('keeps headings, paragraphs and lists; drops nav, footer, scripts and cookie banners', () => {
    expect(out.title).toBe('SEO Services | SEO Virji');
    expect(out.description).toBe('Exclusive SEO.');
    expect(out.text).toContain('## Our services');
    expect(out.text).toContain('one business per niche');
    expect(out.text).toContain('- Technical SEO');
    expect(out.text).not.toMatch(/cookies|secret|© SEO Virji/);
  });

  it('collects internal links and JSON-LD FAQs', () => {
    expect(out.links).toContain('https://seovirji.com/about/');
    expect(out.faqs[0]).toEqual({ question: 'Do you guarantee rankings?', answer: 'No ethical agency can.' });
  });
});

describe('cleaning and chunking', () => {
  it('removes lines repeated across most pages', () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({ text: `Book a call\nUnique content ${i}` }));
    const bp = findBoilerplateLines(pages);
    expect(bp.has('Book a call')).toBe(true);
    expect(removeBoilerplate(pages[0].text, bp)).toBe('Unique content 0');
  });

  it('folds stacked headings into the next heading', () => {
    expect(dropEmptySections('## Our Story\n## Built by one founder\nText')).toBe('## Our Story — Built by one founder\nText');
  });

  it('creates section-aware chunks with context headers, overlap and metadata', () => {
    const para = (n) => `${'Search engine optimisation helps businesses grow. '.repeat(12)}(${n})`;
    const text = `## Services\n${Array.from({ length: 10 }, (_, i) => para(i)).join('\n')}\n## Contact\nEmail us any time for a chat about your goals and your website.`;
    const chunks = chunkDocument({ text, title: 'Home', sourceUrl: 'https://seovirji.com/' });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.token_count).toBeLessThanOrEqual(850);
      expect(c.content.startsWith('Page: Home')).toBe(true);
      expect(c.metadata.source_url).toBe('https://seovirji.com/');
      expect(c.content_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(chunks.some((c) => c.content.includes('Section: Contact'))).toBe(true);
    // Overlap: a paragraph that ends one chunk starts the next chunk of the same section.
    const first = chunks[0].content.split('\n').pop();
    expect(chunks[1].content).toContain(first);
  });
});
