import { Router } from 'express';
import { env } from '../config/env.js';
import { pool } from '../config/supabase.js';
import { adminLimiter } from '../middleware/rate-limit.middleware.js';
import chat from './chat.routes.js';
import conversations from './conversation.routes.js';
import knowledge from './knowledge.routes.js';
import crawler from './crawler.routes.js';
import leads from './leads.routes.js';
import settings from './settings.routes.js';
import analytics from './analytics.routes.js';
import admin from './admin.routes.js';
import cron from './cron.routes.js';

const started = Date.now();
const r = Router();

/** Health: API, database, OpenAI configuration, version, uptime. Never returns secret values. */
r.get('/health', async (req, res) => {
  let database = 'ok';
  try {
    await pool.query('select 1');
  } catch {
    database = 'unavailable';
  }
  const healthy = database === 'ok';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'ok' : 'degraded',
      database,
      openai: env.openaiConfigured ? 'configured' : 'not_configured',
      models: { chat: env.OPENAI_CHAT_MODEL, embedding: env.OPENAI_EMBEDDING_MODEL },
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round((Date.now() - started) / 1000),
    },
  });
});

r.use('/cron', cron);
r.use('/chat', chat);
r.use('/admin', admin);
r.use('/conversations', adminLimiter, conversations);
r.use('/knowledge', adminLimiter, knowledge);
r.use('/crawler', adminLimiter, crawler);
r.use('/leads', adminLimiter, leads);
r.use('/settings', adminLimiter, settings);
r.use('/analytics', adminLimiter, analytics);
export default r;
