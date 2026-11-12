-- SEO Virji AI Chatbot — 002: production features
--  * resumable, serverless-safe website sync (job leases, phases, persistent page frontier)
--  * lead statuses aligned with the admin (New, Contacted, Interested, Qualified, Converted, Not Interested)
--  * resolvable conversations + a database-backed per-conversation processing lock
--  * shared rate-limit counters (serverless instances do not share memory)
--  * richer chatbot settings (enabled flag, model, temperature, length, retrieval, memory)
--  * extra indexes for frequent admin queries
-- Only seo_virji_* objects are touched.

/* ------------------------------------------------------------ leads: statuses */
alter table public.seo_virji_leads drop constraint if exists seo_virji_leads_lead_status_check;
alter table public.seo_virji_conversations drop constraint if exists seo_virji_conversations_lead_status_check;
update public.seo_virji_leads set lead_status = 'not_interested' where lead_status = 'unqualified';
update public.seo_virji_conversations set lead_status = 'not_interested' where lead_status = 'unqualified';
alter table public.seo_virji_leads add constraint seo_virji_leads_lead_status_check
  check (lead_status in ('new','contacted','interested','qualified','converted','not_interested'));
alter table public.seo_virji_conversations add constraint seo_virji_conversations_lead_status_check
  check (lead_status in ('new','contacted','interested','qualified','converted','not_interested'));

/* ------------------------------------------------------------ conversations */
alter table public.seo_virji_conversations drop constraint if exists seo_virji_conversations_status_check;
alter table public.seo_virji_conversations add constraint seo_virji_conversations_status_check
  check (status in ('active','resolved','completed','transferred','archived'));
alter table public.seo_virji_conversations add column if not exists processing_until timestamptz;
alter table public.seo_virji_conversations add column if not exists resolved_at timestamptz;
create index if not exists seo_virji_conv_created_idx on public.seo_virji_conversations (created_at desc);
create index if not exists seo_virji_conv_uuid_visitor_idx on public.seo_virji_conversations (visitor_id, last_message_at desc);

-- Full-text search over messages (admin search + recall of older context beyond the 20-message window).
create index if not exists seo_virji_messages_fts_idx on public.seo_virji_messages using gin (to_tsvector('english', content));

/* ------------------------------------------------------------ leads */
create index if not exists seo_virji_leads_created_idx on public.seo_virji_leads (created_at desc);
create index if not exists seo_virji_leads_handoff_idx on public.seo_virji_leads (whatsapp_handoff_at) where whatsapp_handoff_at is not null;
create index if not exists seo_virji_handoffs_conv_idx on public.seo_virji_whatsapp_handoffs (conversation_id);

/* ------------------------------------------------------------ knowledge */
create index if not exists seo_virji_sources_hash_idx on public.seo_virji_knowledge_sources (content_hash);
create index if not exists seo_virji_sources_created_idx on public.seo_virji_knowledge_sources (created_at desc);
create index if not exists seo_virji_chunks_hash_idx on public.seo_virji_knowledge_chunks (content_hash);
create index if not exists seo_virji_sources_fts_idx on public.seo_virji_knowledge_sources using gin (to_tsvector('english', title || ' ' || content));

/* ------------------------------------------------------------ website sync: resumable jobs */
alter table public.seo_virji_website_crawl_jobs add column if not exists mode text not null default 'incremental';
alter table public.seo_virji_website_crawl_jobs drop constraint if exists seo_virji_website_crawl_jobs_mode_check;
alter table public.seo_virji_website_crawl_jobs add constraint seo_virji_website_crawl_jobs_mode_check
  check (mode in ('incremental','full','single','retry'));
alter table public.seo_virji_website_crawl_jobs add column if not exists phase text not null default 'discover';
alter table public.seo_virji_website_crawl_jobs drop constraint if exists seo_virji_website_crawl_jobs_phase_check;
alter table public.seo_virji_website_crawl_jobs add constraint seo_virji_website_crawl_jobs_phase_check
  check (phase in ('discover','fetch','index','finalize','done'));
alter table public.seo_virji_website_crawl_jobs add column if not exists lease_until timestamptz;
alter table public.seo_virji_website_crawl_jobs add column if not exists heartbeat_at timestamptz;
alter table public.seo_virji_website_crawl_jobs add column if not exists pages_skipped integer not null default 0;
alter table public.seo_virji_website_crawl_jobs add column if not exists pages_unchanged integer not null default 0;
alter table public.seo_virji_website_crawl_jobs add column if not exists chunks_total integer not null default 0;
update public.seo_virji_website_crawl_jobs set phase = 'done' where status in ('completed','failed','cancelled');
update public.seo_virji_website_crawl_jobs set mode = 'single' where coalesce((metadata->>'single_page')::boolean, false);

-- Each crawl page row is part of the job's persistent frontier:
--   pending → fetched → new | updated | unchanged      (or failed / skipped at any point)
alter table public.seo_virji_website_crawl_pages drop constraint if exists seo_virji_website_crawl_pages_status_check;
alter table public.seo_virji_website_crawl_pages add constraint seo_virji_website_crawl_pages_status_check
  check (status in ('pending','fetched','new','updated','unchanged','failed','skipped'));
alter table public.seo_virji_website_crawl_pages add column if not exists depth integer not null default 0;
alter table public.seo_virji_website_crawl_pages add column if not exists discovered_via text not null default 'link';
alter table public.seo_virji_website_crawl_pages add column if not exists payload jsonb;
alter table public.seo_virji_website_crawl_pages add column if not exists attempts integer not null default 0;
alter table public.seo_virji_website_crawl_pages add column if not exists canonical_url text;
alter table public.seo_virji_website_crawl_pages add column if not exists lastmod text;
alter table public.seo_virji_website_crawl_pages add column if not exists source_id uuid references public.seo_virji_knowledge_sources(id) on delete set null;
-- Old jobs could contain the same URL twice; keep the newest row before adding the unique index.
delete from public.seo_virji_website_crawl_pages a using public.seo_virji_website_crawl_pages b
  where a.crawl_job_id = b.crawl_job_id and a.url = b.url and a.created_at < b.created_at;
create unique index if not exists seo_virji_crawl_pages_job_url_uq on public.seo_virji_website_crawl_pages (crawl_job_id, url);
create index if not exists seo_virji_crawl_pages_status_idx on public.seo_virji_website_crawl_pages (crawl_job_id, status, depth);
create index if not exists seo_virji_crawl_pages_url_idx on public.seo_virji_website_crawl_pages (url, created_at desc);

/* ------------------------------------------------------------ rate limits (shared across serverless instances) */
create table if not exists public.seo_virji_rate_limits (
  key text primary key,
  hits integer not null default 0,
  reset_at timestamptz not null
);
create index if not exists seo_virji_rate_limits_reset_idx on public.seo_virji_rate_limits (reset_at);

/* ------------------------------------------------------------ chatbot settings */
alter table public.seo_virji_chatbot_settings add column if not exists chatbot_enabled boolean not null default true;
alter table public.seo_virji_chatbot_settings add column if not exists ai_model text not null default 'gpt-4o-mini';
alter table public.seo_virji_chatbot_settings add column if not exists temperature numeric(3,2) not null default 0.6
  check (temperature between 0 and 1.2);
alter table public.seo_virji_chatbot_settings add column if not exists max_output_tokens integer not null default 700
  check (max_output_tokens between 200 and 1500);
alter table public.seo_virji_chatbot_settings add column if not exists rag_top_k integer not null default 6
  check (rag_top_k between 2 and 12);
alter table public.seo_virji_chatbot_settings add column if not exists rag_min_similarity numeric(3,2) not null default 0.30
  check (rag_min_similarity between 0.1 and 0.8);
alter table public.seo_virji_chatbot_settings add column if not exists memory_message_limit integer not null default 20
  check (memory_message_limit between 6 and 40);

/* ------------------------------------------------------------ RLS for the new table */
alter table public.seo_virji_rate_limits enable row level security;
revoke all on public.seo_virji_rate_limits from anon, authenticated;
