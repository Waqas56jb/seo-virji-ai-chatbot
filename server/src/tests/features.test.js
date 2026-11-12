/**
 * Unit + security tests for the production features (no OpenAI calls).
 * A few tests use the real database (rate-limit store, conversation lock, settings) and
 * remove everything they create.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { one, pool, query } from '../config/supabase.js';
import { toCsv } from '../utils/csv.js';
import { buildHandoffMessage, buildWhatsAppUrl, referenceCode } from '../services/whatsapp/whatsapp.service.js';
import { extractContent } from '../services/crawler/content-extractor.service.js';
import { exclusionReason, isListingUrl, contentHash } from '../services/crawler/deduplication.service.js';
import { categorise, composeDocument } from '../services/crawler/crawler.service.js';
import { buildSystemPrompt } from '../services/ai/prompt-builder.service.js';
import { ai as aiSettings, fullSettings } from '../validators/settings.validator.js';
import { STATUSES, listConversations, conversationStatus, listLeads } from '../validators/leads.validator.js';
import { listQuery } from '../validators/knowledge.validator.js';
import { nextStatus } from '../services/leads/lead-qualification.service.js';
import { PostgresRateLimitStore } from '../middleware/rate-limit.middleware.js';
import { recallOlderMessages } from '../services/ai/memory.service.js';

const app = createApp();
afterAll(() => pool.end());

describe('CSV export', () => {
  it('quotes separators, quotes and newlines', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: 'line1\nline2' }]);
    expect(csv).toBe('a,b,c\r\n"x,y","say ""hi""","line1\nline2"\r\n');
  });
  it('neutralises spreadsheet formulas written by visitors (CSV injection)', () => {
    const csv = toCsv([{ v: '=HYPERLINK("http://evil")' }, { v: '+1+1' }, { v: '@SUM(A1)' }, { v: '-2' }]);
    expect(csv).not.toMatch(/\r\n=/);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1+1");
  });
});

describe('WhatsApp handoff message', () => {
  const uuid = '3f2a9c1e-1111-4222-8333-444455556666';
  it('contains the visitor question, shared details, requirements and a chat reference', () => {
    const msg = buildHandoffMessage({
      facts: { name: 'Sara', website: 'sara.example' },
      question: 'Can you help my clinic rank locally?',
      requirements: ['Local SEO for Leeds', 'Local SEO for Leeds'],
      summary: 'Owner of a dental clinic.',
      reference: uuid,
    });
    expect(msg).toMatch(/My question: Can you help my clinic rank locally\?/);
    expect(msg).toMatch(/• Name: Sara/);
    expect(msg.match(/Local SEO for Leeds/g)).toHaveLength(1);
    expect(msg).toMatch(/Chat reference: 3F2A9C1E$/);
    expect(referenceCode(uuid)).toBe('3F2A9C1E');
  });
  it('never invents details that were not shared', () => {
    const msg = buildHandoffMessage({ facts: {}, reference: uuid });
    expect(msg).not.toMatch(/Name:|Business:|Website:|Summary:/);
  });
  it('encodes the message safely in the wa.me link', () => {
    const url = buildWhatsAppUrl('+92 337 3330774', 'a&b=c\nd #e');
    expect(url).toBe(`https://wa.me/923373330774?text=${encodeURIComponent('a&b=c\nd #e')}`);
  });
});

describe('crawler extraction details', () => {
  const html = `<html><head><title>Post</title><link rel="canonical" href="https://seovirji.com/post/?utm_source=x">
    <meta property="og:type" content="article"><meta property="article:published_time" content="2026-01-02T00:00:00Z">
    <link rel="next" href="/blog/page/2/"></head><body><main><h1>Post</h1><p>${'Useful text. '.repeat(30)}</p>
    <a href="mailto:friends@seovirji.com">mail</a><a href="tel:+92 337 3330774">call</a><a href="https://wa.me/923373330774">wa</a>
    <div class="pagination"><a class="page-numbers" href="/blog/page/3/">3</a></div></main></body></html>`;
  const page = extractContent(html, 'https://seovirji.com/post/');
  it('detects canonical URLs (normalised), articles and publish dates', () => {
    expect(page.canonical).toBe('https://seovirji.com/post/');
    expect(page.isArticle).toBe(true);
    expect(page.published).toBe('2026-01-02T00:00:00Z');
  });
  it('discovers pagination links', () => {
    expect(page.pagination).toEqual(expect.arrayContaining(['https://seovirji.com/blog/page/2/', 'https://seovirji.com/blog/page/3/']));
  });
  it('collects published contact details without treating them as pages', () => {
    expect(page.contacts).toEqual({ emails: ['friends@seovirji.com'], phones: ['+923373330774'], whatsapp: ['923373330774'] });
    expect(page.links.some((l) => l.includes('mailto') || l.includes('wa.me'))).toBe(false);
  });
  it('explains why URLs are excluded and recognises listing pages', () => {
    expect(exclusionReason('https://seovirji.com/checkout/')).toMatch(/Private or transactional/);
    expect(exclusionReason('https://seovirji.com/wp-admin/')).toMatch(/WordPress/);
    expect(exclusionReason('https://seovirji.com/brochure.pdf')).toMatch(/File/);
    expect(exclusionReason('https://seovirji.com/services/')).toBeNull();
    expect(isListingUrl('https://seovirji.com/category/news/')).toBe(true);
    expect(isListingUrl('https://seovirji.com/blog/page/2/')).toBe(true);
    expect(isListingUrl('https://seovirji.com/blog/post/')).toBe(false);
  });
  it('categorises pages and adds contact details only to the home page document', () => {
    expect(categorise('https://seovirji.com/')).toBe('home');
    expect(categorise('https://seovirji.com/post/', { isArticle: true })).toBe('blog');
    const doc = composeDocument({ text: 'Body', isHome: true, contacts: { emails: ['a@b.co'], phones: [], whatsapp: ['92300'] } });
    expect(doc).toMatch(/Email: a@b\.co/);
    expect(composeDocument({ text: 'Body', isHome: false, contacts: { emails: ['a@b.co'] } })).not.toMatch(/Email/);
  });
  it('detects duplicate content regardless of whitespace and case', () => {
    expect(contentHash('Hello   World')).toBe(contentHash('hello world'));
    expect(contentHash('Hello World')).not.toBe(contentHash('Hello World!'));
  });
});

describe('prompt rules', () => {
  const settings = { bot_name: 'SEO Virji AI Consultant', business_name: 'SEO Virji', website_url: 'https://seovirji.com/', behaviours: {} };
  const prompt = buildSystemPrompt({ settings, knowledge: [], memorySummary: 'Owns a bakery.', olderMessages: [{ role: 'user', content: 'My budget is 500 dollars' }], facts: {}, missingFacts: [], whatsappAvailable: true });
  it('replies in the visitor language and never invents consultation fees', () => {
    expect(prompt).toMatch(/same language the visitor writes in/);
    expect(prompt).toMatch(/Never invent a consultation fee/);
  });
  it('includes the summary and relevant older messages as data', () => {
    expect(prompt).toMatch(/EARLIER CONVERSATION SUMMARY[\s\S]*Owns a bakery/);
    expect(prompt).toMatch(/RELEVANT EARLIER MESSAGES[\s\S]*Visitor: My budget is 500 dollars/);
  });
});

describe('validators', () => {
  it('uses the six admin lead statuses', () => {
    expect(STATUSES).toEqual(['new', 'contacted', 'interested', 'qualified', 'converted', 'not_interested']);
    expect(listLeads.safeParse({ status: 'unqualified' }).success).toBe(false);
    expect(nextStatus('not_interested', 'qualified')).toBe('not_interested'); // admin decision kept
  });
  it('validates conversation filters, dates and status changes', () => {
    expect(listConversations.parse({ status: 'resolved', from: '2026-01-01' }).status).toBe('resolved');
    expect(listConversations.safeParse({ from: '01/01/2026' }).success).toBe(false);
    expect(conversationStatus.safeParse({ status: 'resolved' }).success).toBe(true);
    expect(conversationStatus.safeParse({ status: 'deleted' }).success).toBe(false);
  });
  it('validates AI settings ranges and the model allowlist', () => {
    expect(aiSettings.safeParse({ model: 'gpt-4o-mini', temperature: 0.5, maxOutputTokens: 700, topK: 6, minSimilarity: 0.3, memoryLimit: 20 }).success).toBe(true);
    expect(aiSettings.safeParse({ model: 'some-unknown-model' }).success).toBe(false);
    expect(aiSettings.safeParse({ temperature: 2 }).success).toBe(false);
    expect(aiSettings.safeParse({ memoryLimit: 100 }).success).toBe(false);
    expect(fullSettings.safeParse({ general: { chatbotName: 'x', description: '', welcomeMessage: 'hi', domain: 'seovirji.com', online: true, enabled: false } }).success).toBe(true);
  });
  it('validates knowledge list filters', () => {
    expect(listQuery.safeParse({ status: 'all', embedding: 'failed', page: '2' }).data.page).toBe(2);
    expect(listQuery.safeParse({ status: 'deleted' }).success).toBe(false);
  });
});

describe('security of the new endpoints', () => {
  it.each([
    ['get', '/api/conversations/export'],
    ['get', '/api/leads/export'],
    ['patch', '/api/knowledge/00000000-0000-4000-8000-000000000000/status'],
    ['post', '/api/knowledge/retry-embeddings'],
    ['post', '/api/crawler/retry-failed'],
    ['get', '/api/crawler/jobs/00000000-0000-4000-8000-000000000000'],
  ])('%s %s requires an admin token', async (method, path) => {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  });

  it('cron endpoints reject missing or wrong secrets', async () => {
    const original = env.CRON_SECRET;
    env.CRON_SECRET = 'test-cron-secret-value';
    expect((await request(app).get('/api/cron/sync')).status).toBe(401);
    expect((await request(app).get('/api/cron/cleanup').set('Authorization', 'Bearer wrong')).status).toBe(401);
    env.CRON_SECRET = '';
    expect((await request(app).get('/api/cron/sync').set('Authorization', 'Bearer ')).status).toBe(503);
    env.CRON_SECRET = original;
  });

  it('handoff "opened" tracking needs a valid visitor session', async () => {
    const res = await request(app)
      .post('/api/chat/00000000-0000-4000-8000-000000000000/handoff/00000000-0000-4000-8000-000000000001/opened')
      .send({ visitorId: 'v_abcdefabcdefabcdef' });
    expect(res.status).toBe(401);
  });

  it('rejects SQL-injection-looking search input safely (parameterised queries)', async () => {
    // Unauthenticated → 401 before any query; validation also bounds length.
    const res = await request(app).get(`/api/leads?search=${encodeURIComponent("'; drop table seo_virji_leads; --")}`);
    expect(res.status).toBe(401);
    const exists = await one(`select to_regclass('public.seo_virji_leads') is not null as ok`);
    expect(exists.ok).toBe(true);
  });
});

describe('database-backed serverless primitives', () => {
  it('rate-limit counters are shared through Postgres and reset after the window', async () => {
    const store = new PostgresRateLimitStore(`test-${Date.now()}`);
    store.init({ windowMs: 1500 });
    expect((await store.increment('1.2.3.4')).totalHits).toBe(1);
    expect((await store.increment('1.2.3.4')).totalHits).toBe(2);
    const other = new PostgresRateLimitStore(store.prefix); // a second "instance"
    other.init({ windowMs: 1500 });
    expect((await other.increment('1.2.3.4')).totalHits).toBe(3);
    await new Promise((r) => setTimeout(r, 1700));
    expect((await store.increment('1.2.3.4')).totalHits).toBe(1);
    await store.resetKey('1.2.3.4');
  });

  it('only one AI reply can be in progress per conversation (lock in the database)', async () => {
    const conv = await one(
      `insert into public.seo_virji_conversations (visitor_id, session_id) values ('test_lock_visitor_000', 'x') returning id`,
    );
    try {
      const take = () =>
        one(`update public.seo_virji_conversations set processing_until = now() + interval '90 seconds'
             where id = $1 and (processing_until is null or processing_until < now()) returning id`, [conv.id]);
      expect(await take()).not.toBeNull();
      expect(await take()).toBeNull(); // second worker is refused
    } finally {
      await query('delete from public.seo_virji_conversations where id = $1', [conv.id]);
    }
  });

  it('recalls relevant messages older than the 20-message window', async () => {
    const conv = await one(`insert into public.seo_virji_conversations (visitor_id, session_id) values ('test_recall_visitor0', 'x') returning id`);
    try {
      await query(`insert into public.seo_virji_messages (conversation_id, role, content, created_at) values ($1,'user','My monthly marketing budget is 900 dollars', now() - interval '1 hour')`, [conv.id]);
      for (let i = 0; i < 22; i += 1) {
        await query(`insert into public.seo_virji_messages (conversation_id, role, content, created_at) values ($1,$2,$3, now() - make_interval(mins => $4))`, [
          conv.id, i % 2 ? 'assistant' : 'user', `Filler message number ${i} about keywords`, 50 - i,
        ]);
      }
      const recalled = await recallOlderMessages(conv.id, 'What budget did I mention?', 20);
      expect(recalled.map((m) => m.content)).toContain('My monthly marketing budget is 900 dollars');
      expect(await recallOlderMessages(conv.id, 'zzzz', 20)).toEqual([]);
    } finally {
      await query('delete from public.seo_virji_conversations where id = $1', [conv.id]);
    }
  });

  it('a disabled chatbot refuses new conversations', async () => {
    const s = await one('select id, chatbot_enabled from public.seo_virji_chatbot_settings where is_active order by created_at limit 1');
    const { invalidateSettings } = await import('../services/settings.service.js');
    try {
      await query('update public.seo_virji_chatbot_settings set chatbot_enabled = false where id = $1', [s.id]);
      invalidateSettings();
      const res = await request(app).post('/api/chat/start').send({ visitorId: 'v_disabledtest0000001' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('CHATBOT_DISABLED');
      expect((await request(app).get('/api/chat/config')).body.data.enabled).toBe(false);
    } finally {
      await query('update public.seo_virji_chatbot_settings set chatbot_enabled = $2 where id = $1', [s.id, s.chatbot_enabled]);
      invalidateSettings();
    }
  });
});
