/**
 * Housekeeping (hourly on a Node server; daily via Vercel Cron → GET /api/cron/cleanup):
 *  - abandon crawl jobs that stopped making progress
 *  - delete expired/revoked admin refresh tokens and expired rate-limit counters
 *  - delete empty conversations (greeting only) older than 7 days
 *  - optional retention: delete conversations older than DATA_RETENTION_DAYS (0 = keep forever)
 */
import cron from 'node-cron';
import { env } from '../config/env.js';
import { query } from '../config/supabase.js';
import { recoverInterruptedJobs } from '../services/crawler/crawler.service.js';
import { logger } from '../utils/logger.js';

export async function runCleanup() {
  const abandonedJobs = await recoverInterruptedJobs();
  const tokens = await query(`delete from public.seo_virji_admin_refresh_tokens where expires_at < now() or revoked_at < now() - interval '1 day'`);
  const limits = await query(`delete from public.seo_virji_rate_limits where reset_at < now() - interval '1 hour'`);
  const empty = await query(`delete from public.seo_virji_conversations where message_count <= 1 and created_at < now() - interval '7 days'`);
  let retained = { rowCount: 0 };
  if (env.DATA_RETENTION_DAYS > 0) {
    retained = await query(`delete from public.seo_virji_conversations where last_message_at < now() - make_interval(days => $1)`, [env.DATA_RETENTION_DAYS]);
  }
  const result = {
    abandonedJobs,
    refreshTokens: tokens.rowCount,
    rateLimitRows: limits.rowCount,
    emptyConversations: empty.rowCount,
    retentionDeleted: retained.rowCount,
  };
  logger.info('cleanup.done', result);
  return result;
}

export function scheduleCleanup() {
  if (env.isTest) return null;
  return cron.schedule('17 * * * *', () => runCleanup().catch((err) => logger.error('cleanup.failed', { error: err.message })));
}
