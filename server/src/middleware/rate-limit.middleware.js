/**
 * Rate limiting. In production the counters live in Postgres (seo_virji_rate_limits) so
 * every serverless instance shares them; tests (and RATE_LIMIT_STORE=memory) use memory.
 * If the store is unreachable, requests are allowed (the database outage itself is reported).
 */
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { one, query } from '../config/supabase.js';

export class PostgresRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    this.localKeys = false; // counters are shared across processes
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  key(k) {
    return `${this.prefix}:${k}`;
  }

  async increment(key) {
    const row = await one(
      `insert into public.seo_virji_rate_limits (key, hits, reset_at)
       values ($1, 1, now() + make_interval(secs => $2::double precision / 1000))
       on conflict (key) do update set
         hits = case when seo_virji_rate_limits.reset_at <= now() then 1 else seo_virji_rate_limits.hits + 1 end,
         reset_at = case when seo_virji_rate_limits.reset_at <= now() then excluded.reset_at else seo_virji_rate_limits.reset_at end
       returning hits, reset_at`,
      [this.key(key), this.windowMs],
    );
    return { totalHits: row.hits, resetTime: new Date(row.reset_at) };
  }

  async decrement(key) {
    await query('update public.seo_virji_rate_limits set hits = greatest(hits - 1, 0) where key = $1', [this.key(key)]);
  }

  async resetKey(key) {
    await query('delete from public.seo_virji_rate_limits where key = $1', [this.key(key)]);
  }
}

const handler = (req, res, next, options) =>
  res.status(options.statusCode).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: options.message || "You're sending messages a little too quickly. Please wait a moment and try again." },
  });

const usePostgres = env.RATE_LIMIT_STORE === 'postgres' && !env.isTest;

function limiter(name, opts) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
    passOnStoreError: true,
    ...(usePostgres ? { store: new PostgresRateLimitStore(name) } : {}),
    ...opts,
  });
}

/** Public chatbot traffic. */
export const chatLimiter = limiter('chat', { windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX_REQUESTS });

/** Starting conversations is cheaper but should still be bounded per IP. */
export const startLimiter = limiter('start', { windowMs: 10 * 60_000, limit: 40 });

/**
 * Brute-force protection for admin login: 10 failed attempts per 15 minutes per account and IP.
 * (Keyed by email too, because admin traffic may arrive through the admin site's proxy.)
 */
export const loginLimiter = limiter('login', {
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email || '').trim().toLowerCase().slice(0, 200)}`,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

/** Session refresh is called on every admin page load; it has its own, more generous budget. */
export const refreshLimiter = limiter('refresh', { windowMs: 15 * 60_000, limit: 120 });

/** Authenticated admin API. */
export const adminLimiter = limiter('admin', { windowMs: 60_000, limit: 300 });
