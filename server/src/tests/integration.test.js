/**
 * Integration tests against the REAL Supabase database and OpenAI API.
 * Run with: npm run test:integration   (uses server/.env; makes a small number of paid AI calls)
 * Everything created here is deleted afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { many, one, pool, query } from '../config/supabase.js';
import { createAdmin } from '../services/auth.service.js';

const app = createApp();
const visitorId = `itest_${Date.now().toString(36)}abcdef`;
const adminEmail = `itest-${Date.now()}@seovirji.test`;
const adminPassword = `Itest-${Math.random().toString(36).slice(2)}A1`;
let conversationId;
let sessionToken;
let accessToken;
let refreshCookie;

const send = (message, clientMessageId) =>
  request(app).post('/api/chat/message').set('X-Chat-Session', sessionToken).send({ conversationId, visitorId, message, clientMessageId });

beforeAll(async () => {
  await createAdmin({ email: adminEmail, password: adminPassword, fullName: 'Integration Test', role: 'owner' });
});

afterAll(async () => {
  const convs = await many('select id from public.seo_virji_conversations where visitor_id = $1', [visitorId]);
  for (const c of convs) {
    await query('delete from public.seo_virji_leads where conversation_id = $1', [c.id]);
    await query('delete from public.seo_virji_conversations where id = $1', [c.id]);
  }
  await query("delete from public.seo_virji_admin_users where email = lower($1)", [adminEmail]);
  await pool.end();
});

describe('database security', () => {
  it('the public anon key cannot read any SEO Virji table (RLS)', async () => {
    for (const table of ['seo_virji_conversations', 'seo_virji_messages', 'seo_virji_leads', 'seo_virji_admin_users', 'seo_virji_chatbot_settings']) {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` },
      });
      const body = await res.json().catch(() => null);
      const leaked = res.ok && Array.isArray(body) && body.length > 0;
      expect(leaked, `${table} readable with anon key`).toBe(false);
    }
  });
});

describe('visitor chat (real OpenAI + Supabase)', () => {
  it('starts a conversation with a stored greeting', async () => {
    const res = await request(app).post('/api/chat/start').send({ visitorId });
    expect(res.status).toBe(200);
    ({ conversationId, sessionToken } = res.body.data);
    expect(res.body.data.messages[0].role).toBe('assistant');
    expect(sessionToken.length).toBeGreaterThan(30);
    const stored = await one('select session_id from public.seo_virji_conversations where conversation_uuid = $1', [conversationId]);
    expect(stored.session_id).not.toBe(sessionToken); // only a hash is stored
  });

  it('answers from SEO Virji knowledge (RAG) and stores both messages', async () => {
    const res = await send('Do you work with more than one business in the same niche?', 'itest_q1');
    expect(res.status).toBe(200);
    expect(res.body.data.message.role).toBe('assistant');
    expect(res.body.data.message.content.length).toBeGreaterThan(20);
    expect(res.body.data.sources.length).toBeGreaterThan(0);
    const rows = await many(
      `select m.role from public.seo_virji_messages m join public.seo_virji_conversations c on c.id = m.conversation_id where c.conversation_uuid = $1 order by m.created_at`,
      [conversationId],
    );
    expect(rows.map((r) => r.role)).toEqual(['assistant', 'user', 'assistant']);
  }, 60_000);

  it('retrying the same clientMessageId does not duplicate messages or call the AI again', async () => {
    const usageBefore = (await one('select count(*)::int n from public.seo_virji_usage_logs')).n;
    const res = await send('Do you work with more than one business in the same niche?', 'itest_q1');
    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    const usageAfter = (await one('select count(*)::int n from public.seo_virji_usage_logs')).n;
    expect(usageAfter).toBe(usageBefore);
  }, 60_000);

  it('logs token usage for AI requests', async () => {
    const row = await one(
      `select u.model, u.input_tokens, u.output_tokens from public.seo_virji_usage_logs u
       join public.seo_virji_conversations c on c.id = u.conversation_id where c.conversation_uuid = $1 and u.operation = 'chat'`,
      [conversationId],
    );
    expect(row.input_tokens).toBeGreaterThan(100);
    expect(row.output_tokens).toBeGreaterThan(5);
  });

  it('remembers facts beyond the 20-message context window', async () => {
    let res = await send('My business is called Zephyr Kites and we sell handmade kites online.', 'itest_fact');
    expect(res.status).toBe(200);
    const fillers = [
      'What is technical SEO?', 'And on-page SEO?', 'What about backlinks?', 'How important are reviews?', 'What is a meta description?',
      'Does page speed matter?', 'What is schema markup?', 'Should I blog?', 'How often should I post?', 'What is a sitemap?',
    ];
    for (const [i, q] of fillers.entries()) {
      res = await send(q, `itest_f${i}`);
      expect(res.status).toBe(200);
    }
    const count = (await one('select message_count from public.seo_virji_conversations where conversation_uuid = $1', [conversationId])).message_count;
    expect(count).toBeGreaterThan(env.CHAT_MEMORY_LIMIT); // the fact is now outside the last-20 window
    res = await send('Quick check — what is the name of my business?', 'itest_recall');
    expect(res.status).toBe(200);
    expect(res.body.data.message.content).toMatch(/Zephyr Kites/i);
    // Full history stays in the database (nothing is trimmed to the 20-message window).
    const finalCount = (await one('select message_count from public.seo_virji_conversations where conversation_uuid = $1', [conversationId])).message_count;
    const all = (await one(
      `select count(*)::int n from public.seo_virji_messages m join public.seo_virji_conversations c on c.id = m.conversation_id where c.conversation_uuid = $1`,
      [conversationId],
    )).n;
    expect(all).toBe(finalCount);
    expect(all).toBe(count + 2);
  }, 360_000);

  it('records a WhatsApp handoff (link generated, conversation transferred, lead qualified)', async () => {
    const res = await request(app).post(`/api/chat/${conversationId}/handoff`).set('X-Chat-Session', sessionToken).send({ visitorId, name: 'Itest Visitor' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\/wa\.me\/\d{8,15}\?text=/);
    expect(decodeURIComponent(res.body.data.url)).toContain('Zephyr Kites');
    const row = await one(
      `select h.handoff_status, c.status, l.lead_status from public.seo_virji_whatsapp_handoffs h
       join public.seo_virji_conversations c on c.id = h.conversation_id join public.seo_virji_leads l on l.id = h.lead_id
       where c.conversation_uuid = $1`,
      [conversationId],
    );
    expect(row).toEqual({ handoff_status: 'link_generated', status: 'transferred', lead_status: 'qualified' });
  }, 60_000);

  it('another visitor cannot access this conversation', async () => {
    const res = await request(app).get(`/api/chat/${conversationId}?visitorId=itest_attacker_123456`).set('X-Chat-Session', sessionToken);
    expect(res.status).toBe(401);
  });
});

describe('admin (real auth + data)', () => {
  it('logs in, sets an HttpOnly refresh cookie and reads protected data', async () => {
    const res = await request(app).post('/api/admin/auth/login').send({ email: adminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    accessToken = res.body.data.accessToken;
    refreshCookie = res.headers['set-cookie'].find((c) => c.startsWith('sv_admin_rt='));
    expect(refreshCookie).toMatch(/HttpOnly/i);
    const overview = await request(app).get('/api/analytics/overview').set('Authorization', `Bearer ${accessToken}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.stats.totalConversations.value).toBeGreaterThan(0);
    const conv = await request(app).get(`/api/conversations/${conversationId}`).set('Authorization', `Bearer ${accessToken}`);
    expect(conv.body.data.conversation.messages.length).toBeGreaterThan(20);
  });

  it('rotates refresh tokens (an old refresh token cannot be reused)', async () => {
    const first = await request(app).post('/api/admin/auth/refresh').set('Cookie', refreshCookie);
    expect(first.status).toBe(200);
    const reuse = await request(app).post('/api/admin/auth/refresh').set('Cookie', refreshCookie);
    expect(reuse.status).toBe(401);
  });

  it('blocks crawling localhost, private IPs and other domains', async () => {
    for (const url of ['http://localhost:4100/', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'https://example.com/']) {
      const res = await request(app).post('/api/crawler/start').set('Authorization', `Bearer ${accessToken}`).send({ url, singlePage: true });
      expect(res.status, url).toBe(400);
    }
  });
});
