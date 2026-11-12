/**
 * Scheduled website re-sync (CRAWLER_SCHEDULE, default daily 03:00).
 *  - Long-running Node server: node-cron triggers `runScheduledSync`.
 *  - Vercel: Vercel Cron calls GET /api/cron/sync (see vercel.json), which runs the same function.
 */
import cron from 'node-cron';
import { env } from '../config/env.js';
import { recoverInterruptedJobs, resumeStalledJobs, runToCompletion, startCrawl } from '../services/crawler/crawler.service.js';
import { logger } from '../utils/logger.js';

/** Starts an incremental sync (or resumes an unfinished one) and advances it within `budgetMs`. */
export async function runScheduledSync({ budgetMs = Infinity } = {}) {
  await recoverInterruptedJobs();
  try {
    const job = await startCrawl({ trigger: 'schedule', mode: 'incremental', wait: false, budgetMs: 0 });
    const result = await runToCompletion(job.id, { totalBudgetMs: budgetMs });
    logger.info('recrawl.ran', { jobId: job.id, ...result });
    return { started: true, jobId: job.id, ...result };
  } catch (err) {
    if (err.status !== 409) throw err;
    // A sync is already active — make sure it keeps moving instead of starting another.
    const resumed = await resumeStalledJobs({ budgetMs });
    logger.info('recrawl.skipped_active', { resumed });
    return { started: false, reason: 'A sync is already running', resumed };
  }
}

export function scheduleRecrawl() {
  if (!env.CRAWLER_SCHEDULE_ENABLED || env.isTest) return null;
  if (!cron.validate(env.CRAWLER_SCHEDULE)) {
    logger.warn('recrawl.invalid_schedule', { schedule: env.CRAWLER_SCHEDULE });
    return null;
  }
  return cron.schedule(env.CRAWLER_SCHEDULE, () => runScheduledSync().catch((err) => logger.error('recrawl.failed', { error: err.message })), { timezone: 'UTC' });
}
