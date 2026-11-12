/** Long-running Node server (local development, Railway/Render/VPS). Vercel uses api/index.js instead. */
import { env } from './config/env.js';
import { pool } from './config/supabase.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { recoverInterruptedJobs, resumeStalledJobs } from './services/crawler/crawler.service.js';
import { scheduleRecrawl } from './jobs/recrawl.job.js';
import { scheduleCleanup } from './jobs/cleanup.job.js';

const app = createApp();

const server = app.listen(env.PORT, async () => {
  logger.info('server.started', { port: env.PORT, env: env.NODE_ENV, openai: env.openaiConfigured ? 'configured' : 'not_configured' });
  if (!env.openaiConfigured) logger.warn('config.missing', { variable: 'OPENAI_API_KEY', effect: 'chat replies and embeddings are disabled' });
  try {
    await pool.query('select 1');
    await recoverInterruptedJobs();
    await resumeStalledJobs(); // continue a sync that was interrupted by a restart
  } catch (err) {
    logger.error('db.unavailable_on_boot', { error: err.message });
  }
  scheduleRecrawl();
  scheduleCleanup();
});

function shutdown(signal) {
  logger.info('server.shutdown', { signal });
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error('process.unhandled_rejection', { error: err?.message }));
