/**
 * Applies supabase/migrations/*.sql (in order, once each) and then supabase/seed/*.sql
 * (idempotent). Each file runs in its own transaction and is recorded in
 * seo_virji_schema_migrations. Usage: npm run db:migrate
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dims = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);

if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const files = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(dir, f)) : [];

async function run() {
  await client.connect();
  await client.query(`create table if not exists public.seo_virji_schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  await client.query('alter table public.seo_virji_schema_migrations enable row level security');
  await client.query('revoke all on public.seo_virji_schema_migrations from anon, authenticated');

  const applied = new Set((await client.query('select name from public.seo_virji_schema_migrations')).rows.map((r) => r.name));

  for (const file of files(path.join(root, 'supabase', 'migrations'))) {
    const name = path.basename(file);
    if (applied.has(name)) {
      console.log(`[migrate] skip    ${name} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(file, 'utf8').replaceAll('{{EMBEDDING_DIMENSIONS}}', String(dims));
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.seo_virji_schema_migrations (name) values ($1)', [name]);
      await client.query('commit');
      console.log(`[migrate] applied ${name}`);
    } catch (err) {
      await client.query('rollback');
      throw new Error(`${name}: ${err.message}`);
    }
  }

  for (const file of files(path.join(root, 'supabase', 'seed'))) {
    await client.query(fs.readFileSync(file, 'utf8'));
    console.log(`[migrate] seeded  ${path.basename(file)}`);
  }
}

run()
  .then(() => console.log('[migrate] done'))
  .catch((err) => {
    console.error('[migrate] FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
