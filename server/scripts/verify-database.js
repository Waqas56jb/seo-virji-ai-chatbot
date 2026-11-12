/**
 * Verifies the real database: every table and required column, pgvector, the vector
 * dimension, search functions, indexes, RLS, and a live vector-search round trip.
 * Usage: npm run db:verify   (exit code 1 on any failure)
 */
import 'dotenv/config';
import pg from 'pg';

const REQUIRED = {
  seo_virji_admin_users: ['id', 'email', 'password_hash', 'full_name', 'role', 'is_active', 'last_login_at', 'created_at', 'updated_at'],
  seo_virji_admin_refresh_tokens: ['id', 'admin_user_id', 'token_hash', 'expires_at', 'revoked_at'],
  seo_virji_chatbot_settings: ['id', 'bot_name', 'business_name', 'website_url', 'assistant_description', 'welcome_message', 'personality_tone', 'response_style', 'system_instructions', 'additional_instructions', 'whatsapp_number', 'whatsapp_enabled', 'whatsapp_button_label', 'primary_color', 'secondary_color', 'launcher_position', 'is_active', 'chatbot_enabled', 'ai_model', 'temperature', 'max_output_tokens', 'rag_top_k', 'rag_min_similarity', 'memory_message_limit', 'created_at', 'updated_at'],
  seo_virji_conversations: ['id', 'conversation_uuid', 'visitor_id', 'visitor_name', 'visitor_email', 'visitor_phone', 'session_id', 'status', 'lead_status', 'source', 'website_url', 'summary', 'last_message_at', 'whatsapp_handoff_at', 'processing_until', 'resolved_at', 'created_at', 'updated_at'],
  seo_virji_messages: ['id', 'conversation_id', 'role', 'content', 'message_type', 'metadata', 'tokens_used', 'model', 'created_at'],
  seo_virji_conversation_memories: ['id', 'conversation_id', 'visitor_id', 'memory_summary', 'important_facts', 'customer_preferences', 'business_context', 'updated_at', 'created_at'],
  seo_virji_knowledge_sources: ['id', 'title', 'source_type', 'source_url', 'content', 'content_hash', 'status', 'last_crawled_at', 'last_updated_at', 'metadata', 'created_at', 'updated_at'],
  seo_virji_knowledge_chunks: ['id', 'knowledge_source_id', 'chunk_index', 'content', 'embedding', 'token_count', 'metadata', 'content_hash', 'created_at', 'updated_at'],
  seo_virji_faqs: ['id', 'question', 'answer', 'category', 'is_active', 'created_at', 'updated_at'],
  seo_virji_leads: ['id', 'conversation_id', 'visitor_name', 'email', 'phone', 'business_name', 'website_url', 'industry', 'business_challenge', 'seo_goals', 'budget_range', 'qualification_score', 'lead_status', 'notes', 'whatsapp_handoff_at', 'created_at', 'updated_at'],
  seo_virji_website_crawl_jobs: ['id', 'website_url', 'status', 'total_pages_found', 'pages_processed', 'pages_failed', 'started_at', 'completed_at', 'error_message', 'metadata', 'mode', 'phase', 'lease_until', 'heartbeat_at', 'pages_skipped', 'created_at'],
  seo_virji_website_crawl_pages: ['id', 'crawl_job_id', 'url', 'title', 'extracted_content', 'content_hash', 'status', 'http_status', 'error_message', 'crawled_at', 'created_at', 'updated_at'],
  seo_virji_whatsapp_handoffs: ['id', 'conversation_id', 'lead_id', 'whatsapp_number', 'generated_message', 'handoff_status', 'created_at'],
  seo_virji_feedback: ['id', 'conversation_id', 'message_id', 'rating', 'feedback_text', 'created_at'],
  seo_virji_usage_logs: ['id', 'conversation_id', 'message_id', 'provider', 'model', 'input_tokens', 'output_tokens', 'estimated_cost', 'request_status', 'created_at'],
  seo_virji_audit_logs: ['id', 'admin_user_id', 'action', 'resource_type', 'resource_id', 'metadata', 'created_at'],
  seo_virji_rate_limits: ['key', 'hits', 'reset_at'],
  seo_virji_schema_migrations: ['name', 'applied_at'],
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
let failures = 0;
const pass = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => {
  failures += 1;
  console.log(`  ✘ ${msg}`);
};

async function run() {
  await client.connect();
  console.log('Database verification\n');

  const cols = (
    await client.query(
      `select table_name, column_name from information_schema.columns where table_schema='public' and table_name like 'seo_virji_%'`,
    )
  ).rows;
  const byTable = cols.reduce((m, r) => ((m[r.table_name] ||= new Set()).add(r.column_name), m), {});

  console.log('Tables & columns');
  for (const [table, required] of Object.entries(REQUIRED)) {
    const have = byTable[table];
    if (!have) {
      fail(`${table} — missing`);
      continue;
    }
    const missing = required.filter((c) => !have.has(c));
    missing.length ? fail(`${table} — missing columns: ${missing.join(', ')}`) : pass(`${table} (${have.size} columns)`);
  }

  console.log('\nExtensions & vectors');
  const ext = (await client.query(`select extversion from pg_extension where extname='vector'`)).rows[0];
  ext ? pass(`pgvector ${ext.extversion}`) : fail('pgvector not installed');
  const dim = (
    await client.query(`select atttypmod from pg_attribute where attrelid='public.seo_virji_knowledge_chunks'::regclass and attname='embedding'`)
  ).rows[0]?.atttypmod;
  const expected = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);
  dim === expected ? pass(`embedding vector(${dim}) matches OPENAI_EMBEDDING_DIMENSIONS`) : fail(`embedding dimension ${dim} ≠ ${expected}`);

  console.log('\nFunctions & indexes');
  for (const fn of ['seo_virji_match_chunks', 'seo_virji_keyword_chunks']) {
    const r = (await client.query(`select 1 from pg_proc where proname=$1`, [fn])).rowCount;
    r ? pass(`function ${fn}`) : fail(`function ${fn} missing`);
  }
  for (const idx of [
    'seo_virji_chunks_embedding_idx', 'seo_virji_chunks_fts_idx', 'seo_virji_crawl_jobs_running_uq', 'seo_virji_messages_conv_idx',
    'seo_virji_crawl_pages_job_url_uq', 'seo_virji_messages_fts_idx', 'seo_virji_sources_hash_idx', 'seo_virji_conv_created_idx', 'seo_virji_leads_created_idx',
  ]) {
    const r = (await client.query(`select 1 from pg_indexes where indexname=$1`, [idx])).rowCount;
    r ? pass(`index ${idx}`) : fail(`index ${idx} missing`);
  }

  // Live round-trip: the vector search function executes with a real vector argument.
  const zero = `[${new Array(expected).fill(0.001).join(',')}]`;
  try {
    await client.query('select * from public.seo_virji_match_chunks($1::extensions.vector, 3, 0)', [zero]);
    pass('vector search function executes');
  } catch (err) {
    fail(`vector search failed: ${err.message}`);
  }
  try {
    await client.query(`select * from public.seo_virji_keyword_chunks('seo services', 3)`);
    pass('keyword search function executes');
  } catch (err) {
    fail(`keyword search failed: ${err.message}`);
  }

  console.log('\nSecurity');
  const noRls = (
    await client.query(`select tablename from pg_tables where schemaname='public' and tablename like 'seo_virji_%' and not rowsecurity`)
  ).rows;
  noRls.length ? fail(`RLS disabled on: ${noRls.map((r) => r.tablename).join(', ')}`) : pass('RLS enabled on every seo_virji_ table');
  const anonGrants = (
    await client.query(
      `select distinct table_name from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name like 'seo_virji_%'`,
    )
  ).rows;
  anonGrants.length ? fail(`anon/authenticated still have grants on: ${anonGrants.map((r) => r.table_name).join(', ')}`) : pass('no anon/authenticated table grants');

  console.log('\nData');
  const settings = (await client.query('select count(*)::int n from public.seo_virji_chatbot_settings')).rows[0].n;
  settings >= 1 ? pass('chatbot settings row exists') : fail('no chatbot settings row');
  const counts = (
    await client.query(`select
      (select count(*) from public.seo_virji_knowledge_sources)::int sources,
      (select count(*) from public.seo_virji_knowledge_chunks)::int chunks,
      (select count(*) from public.seo_virji_knowledge_chunks where embedding is not null)::int embedded,
      (select count(*) from public.seo_virji_conversations)::int conversations,
      (select count(*) from public.seo_virji_messages)::int messages,
      (select count(*) from public.seo_virji_leads)::int leads,
      (select count(*) from public.seo_virji_admin_users)::int admins`)
  ).rows[0];
  console.log('  ', counts);

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exitCode = failures ? 1 : 0;
}

run()
  .catch((err) => {
    console.error('Verification error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
