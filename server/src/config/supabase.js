/**
 * Data access. The app talks to Supabase Postgres through a pooled `pg` connection
 * (transactions, pgvector, SQL functions). A service-role supabase-js client is also
 * exported for trusted server-side use only — it must never reach a browser.
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { attachDatabasePool } from '@vercel/functions';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: { rejectUnauthorized: false },
  // Serverless instances are short-lived: release idle connections quickly so the Supabase pooler is not exhausted.
  idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => logger.error('db.pool_error', { error: err.message }));
// On Vercel Fluid compute, lets the platform close idle pool clients before an instance is suspended.
if (process.env.VERCEL) attachDatabasePool(pool);

export const query = (text, params) => pool.query(text, params);

export async function one(text, params, client = pool) {
  const { rows } = await client.query(text, params);
  return rows[0] || null;
}

export async function many(text, params, client = pool) {
  const { rows } = await client.query(text, params);
  return rows;
}

/** Runs `fn(client)` inside a transaction; rolls back on any error. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** pgvector literal from a JS number array. */
export const toVector = (arr) => `[${arr.map((n) => Number(n).toFixed(7)).join(',')}]`;
