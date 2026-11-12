/**
 * npm run health — verifies every external dependency with a REAL operation:
 * Supabase connectivity, tables, pgvector, vector search, OpenAI auth, embeddings,
 * chat completion, and website crawl accessibility. Secret values are never printed.
 */
import { env } from '../src/config/env.js';
import { pool, one, toVector } from '../src/config/supabase.js';
import { embedTexts } from '../src/services/ai/embedding.service.js';
import { pingChat } from '../src/services/ai/openai.service.js';
import { safeFetch } from '../src/services/crawler/scraper.service.js';

let failed = 0;
async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✘ ${name} — ${err.message}`);
  }
}

console.log('Connection checks\n');
await check('Supabase Postgres connectivity', async () => (await one('select version() v')).v.split(' ').slice(0, 2).join(' '));
await check('Supabase REST (service role) reachable', async () => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
});
await check('Required tables', async () => {
  const n = (await one(`select count(*)::int n from information_schema.tables where table_schema='public' and table_name like 'seo_virji_%'`)).n;
  if (n < 17) throw new Error(`only ${n} seo_virji_ tables found — run npm run db:migrate`);
  return `${n} tables`;
});
await check('pgvector extension', async () => `v${(await one(`select extversion from pg_extension where extname='vector'`)).extversion}`);
await check('Vector search function', async () => {
  const v = toVector(new Array(env.OPENAI_EMBEDDING_DIMENSIONS).fill(0.01));
  await pool.query('select * from public.seo_virji_match_chunks($1::extensions.vector, 1, 0)', [v]);
  return 'executes';
});
await check('OpenAI authentication + embeddings', async () => {
  if (!env.openaiConfigured) throw new Error('OPENAI_API_KEY is not set');
  const [vec] = await embedTexts(['SEO Virji connection test']);
  if (vec.length !== env.OPENAI_EMBEDDING_DIMENSIONS) throw new Error(`got ${vec.length} dimensions, expected ${env.OPENAI_EMBEDDING_DIMENSIONS}`);
  return `${env.OPENAI_EMBEDDING_MODEL} → ${vec.length} dims`;
});
await check('OpenAI chat completion', async () => `${env.OPENAI_CHAT_MODEL} replied "${await pingChat()}"`);
await check('Website crawl accessibility', async () => {
  const res = await safeFetch(env.SEO_VIRJI_WEBSITE_URL);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return `${env.SEO_VIRJI_WEBSITE_URL} HTTP 200, ${Math.round(res.body.length / 1024)} KB`;
});

console.log(failed ? `\n${failed} check(s) failed` : '\nAll connections verified');
process.exitCode = failed ? 1 : 0;
await pool.end();
