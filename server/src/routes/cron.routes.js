/**
 * Endpoints for Vercel Cron (configured in server/vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`; anything else is rejected. Disabled when CRON_SECRET is unset.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler as h, ok } from '../utils/response.js';
import { AppError, unauthorized } from '../utils/errors.js';
import { runScheduledSync } from '../jobs/recrawl.job.js';
import { runCleanup } from '../jobs/cleanup.job.js';

function requireCron(req, res, next) {
  if (!env.CRON_SECRET) return next(new AppError(503, 'CRON_NOT_CONFIGURED', 'CRON_SECRET is not set on the server.'));
  const given = Buffer.from(String(req.get('authorization') || ''));
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return next(unauthorized('Invalid cron credentials'));
  return next();
}

const r = Router();
r.use(requireCron);
r.get('/sync', h(async (req, res) => {
  if (!env.CRAWLER_SCHEDULE_ENABLED) return ok(res, { started: false, reason: 'CRAWLER_SCHEDULE_ENABLED=false' });
  ok(res, await runScheduledSync({ budgetMs: env.CRAWLER_STEP_BUDGET_MS }));
}));
r.get('/cleanup', h(async (req, res) => ok(res, await runCleanup())));
export default r;
