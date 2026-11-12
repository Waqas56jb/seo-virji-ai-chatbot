import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { pool } from '../config/supabase.js';

const app = createApp();
afterAll(() => pool.end());

const ADMIN_ENDPOINTS = [
  ['get', '/api/conversations'],
  ['get', '/api/conversations/stats'],
  ['get', '/api/leads'],
  ['patch', '/api/leads/00000000-0000-4000-8000-000000000000'],
  ['get', '/api/knowledge'],
  ['post', '/api/knowledge/faq'],
  ['post', '/api/crawler/start'],
  ['get', '/api/settings'],
  ['patch', '/api/settings'],
  ['get', '/api/analytics/overview'],
  ['get', '/api/admin/auth/me'],
];

describe('admin endpoints require authentication', () => {
  it.each(ADMIN_ENDPOINTS)('%s %s → 401 without a token', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it('rejects forged, wrong-audience and expired tokens', async () => {
    const forged = jwt.sign({ sub: 'x', role: 'owner' }, 'not-the-real-secret-not-the-real-secret', { audience: 'seo-virji-admin' });
    const wrongAud = jwt.sign({ sub: 'x', role: 'owner' }, env.ADMIN_JWT_SECRET, { audience: 'someone-else' });
    const expired = jwt.sign({ sub: 'x', role: 'owner', exp: Math.floor(Date.now() / 1000) - 60 }, env.ADMIN_JWT_SECRET, { audience: 'seo-virji-admin' });
    for (const token of [forged, wrongAud]) {
      expect((await request(app).get('/api/leads').set('Authorization', `Bearer ${token}`)).status).toBe(401);
    }
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('does not trust a role claim for a user that does not exist', async () => {
    const token = jwt.sign({ sub: '00000000-0000-4000-8000-000000000000', role: 'owner' }, env.ADMIN_JWT_SECRET, { audience: 'seo-virji-admin', expiresIn: '5m' });
    expect((await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('refresh without a cookie is rejected', async () => {
    const res = await request(app).post('/api/admin/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('health', () => {
  it('reports status without secrets', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.database).toBe('ok');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
    if (env.OPENAI_API_KEY) expect(body).not.toContain(env.OPENAI_API_KEY);
  });
});
