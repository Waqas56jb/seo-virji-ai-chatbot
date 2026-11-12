-- =====================================================================
-- SEO Virji AI Chatbot — initial schema
-- All objects are prefixed `seo_virji_` because this Supabase project is
-- shared with other applications. {{EMBEDDING_DIMENSIONS}} is substituted
-- by scripts/migrate.js from OPENAI_EMBEDDING_DIMENSIONS.
-- =====================================================================

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Shared updated_at trigger ------------------------------------------------
create or replace function public.seo_virji_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 5.1 Admin users ----------------------------------------------------------
create table if not exists public.seo_virji_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  full_name text not null default '',
  role text not null default 'admin' check (role in ('owner', 'admin', 'viewer')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists seo_virji_admin_users_email_uq on public.seo_virji_admin_users (lower(email));

create table if not exists public.seo_virji_admin_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.seo_virji_admin_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists seo_virji_refresh_admin_idx on public.seo_virji_admin_refresh_tokens (admin_user_id);

-- 5.2 Chatbot settings (single active row) -----------------------------------
create table if not exists public.seo_virji_chatbot_settings (
  id uuid primary key default gen_random_uuid(),
  bot_name text not null default 'SEO Virji AI Consultant',
  business_name text not null default 'SEO Virji',
  website_url text not null default 'https://seovirji.com/',
  assistant_description text not null default 'Your Personal Business Growth Assistant',
  welcome_message text not null default '',
  personality_tone text not null default 'consultative' check (personality_tone in ('professional','friendly','empathetic','consultative')),
  response_style text not null default 'balanced' check (response_style in ('concise','balanced','detailed')),
  behaviours jsonb not null default '{"natural":true,"followUps":true,"understandProblems":true,"avoidRobotic":true}'::jsonb,
  system_instructions text not null default '',
  additional_instructions text not null default '',
  whatsapp_number text not null default '',
  whatsapp_enabled boolean not null default true,
  whatsapp_button_label text not null default 'Continue on WhatsApp',
  whatsapp_welcome_message text not null default '',
  primary_color text not null default '#0B1050',
  secondary_color text not null default '#C9A132',
  launcher_position text not null default 'right' check (launcher_position in ('left','right')),
  chatbot_title text not null default 'SEO Virji AI Consultant',
  logo_url text,
  is_online boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5.3 Conversations -------------------------------------------------------------
create table if not exists public.seo_virji_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_uuid uuid not null unique default gen_random_uuid(),
  visitor_id text not null,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  session_id text not null,               -- sha256 of the visitor's session token (never the token itself)
  session_expires_at timestamptz not null default now() + interval '30 days',
  status text not null default 'active' check (status in ('active','completed','transferred','archived')),
  lead_status text not null default 'new' check (lead_status in ('new','interested','qualified','contacted','converted','unqualified')),
  source text not null default 'widget',
  website_url text,
  topic text,
  summary text,
  message_count integer not null default 0,
  last_message_at timestamptz not null default now(),
  whatsapp_handoff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seo_virji_conv_visitor_idx on public.seo_virji_conversations (visitor_id);
create index if not exists seo_virji_conv_last_msg_idx on public.seo_virji_conversations (last_message_at desc);
create index if not exists seo_virji_conv_status_idx on public.seo_virji_conversations (status, lead_status);

-- 5.4 Messages ------------------------------------------------------------------
create table if not exists public.seo_virji_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.seo_virji_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  message_type text not null default 'text',
  metadata jsonb not null default '{}'::jsonb,
  client_message_id text,                 -- idempotency key from the client
  tokens_used integer,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists seo_virji_messages_conv_idx on public.seo_virji_messages (conversation_id, created_at);
create unique index if not exists seo_virji_messages_client_uq on public.seo_virji_messages (conversation_id, client_message_id) where client_message_id is not null;

-- 5.5 Conversation memories -------------------------------------------------------
create table if not exists public.seo_virji_conversation_memories (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.seo_virji_conversations(id) on delete cascade,
  visitor_id text,
  memory_summary text not null default '',
  summarized_message_count integer not null default 0,
  important_facts jsonb not null default '{}'::jsonb,
  customer_preferences jsonb not null default '{}'::jsonb,
  business_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5.8 FAQs ------------------------------------------------------------------------
create table if not exists public.seo_virji_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'general',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5.6 Knowledge sources -----------------------------------------------------------
create table if not exists public.seo_virji_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('website','manual','faq','document','business_information')),
  source_url text,
  section_key text,                        -- for business_information sections (about, services, ...)
  faq_id uuid references public.seo_virji_faqs(id) on delete cascade,
  content text not null default '',
  content_hash text,
  status text not null default 'active' check (status in ('active','pending','failed','inactive')),
  embedding_status text not null default 'pending' check (embedding_status in ('pending','complete','failed','not_configured')),
  priority integer not null default 0,     -- higher = preferred (manual > website)
  version integer not null default 1,
  last_crawled_at timestamptz,
  last_updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists seo_virji_sources_url_uq on public.seo_virji_knowledge_sources (source_url) where source_type = 'website';
create unique index if not exists seo_virji_sources_section_uq on public.seo_virji_knowledge_sources (section_key) where source_type = 'business_information';
create index if not exists seo_virji_sources_type_idx on public.seo_virji_knowledge_sources (source_type, status);

-- 5.7 Knowledge chunks ------------------------------------------------------------
create table if not exists public.seo_virji_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_source_id uuid not null references public.seo_virji_knowledge_sources(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector({{EMBEDDING_DIMENSIONS}}),
  token_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_source_id, chunk_index)
);
create index if not exists seo_virji_chunks_source_idx on public.seo_virji_knowledge_chunks (knowledge_source_id);
create index if not exists seo_virji_chunks_fts_idx on public.seo_virji_knowledge_chunks using gin (fts);
create index if not exists seo_virji_chunks_embedding_idx on public.seo_virji_knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- 5.9 Leads -----------------------------------------------------------------------
create table if not exists public.seo_virji_leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid unique references public.seo_virji_conversations(id) on delete set null,
  visitor_name text,
  email text,
  phone text,
  business_name text,
  website_url text,
  industry text,
  business_challenge text,
  seo_situation text,
  seo_goals text,
  budget_range text,
  contact_method text,
  summary text,
  requirements jsonb not null default '[]'::jsonb,
  qualification_score integer not null default 0 check (qualification_score between 0 and 100),
  lead_status text not null default 'new' check (lead_status in ('new','interested','qualified','contacted','converted','unqualified')),
  notes text,
  whatsapp_handoff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seo_virji_leads_status_idx on public.seo_virji_leads (lead_status, created_at desc);

-- 5.10 / 5.11 Crawl jobs and pages -----------------------------------------------
create table if not exists public.seo_virji_website_crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  website_url text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  trigger text not null default 'manual',
  total_pages_found integer not null default 0,
  pages_processed integer not null default 0,
  pages_failed integer not null default 0,
  pages_new integer not null default 0,
  pages_updated integer not null default 0,
  pages_removed integer not null default 0,
  embeddings_generated integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists seo_virji_crawl_jobs_created_idx on public.seo_virji_website_crawl_jobs (created_at desc);
-- Only one running crawl per website at a time.
create unique index if not exists seo_virji_crawl_jobs_running_uq on public.seo_virji_website_crawl_jobs (website_url)
  where status in ('queued','running');

create table if not exists public.seo_virji_website_crawl_pages (
  id uuid primary key default gen_random_uuid(),
  crawl_job_id uuid not null references public.seo_virji_website_crawl_jobs(id) on delete cascade,
  url text not null,
  title text,
  extracted_content text,
  content_hash text,
  status text not null check (status in ('new','updated','unchanged','failed','skipped')),
  http_status integer,
  error_message text,
  crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seo_virji_crawl_pages_job_idx on public.seo_virji_website_crawl_pages (crawl_job_id);

-- 5.12 WhatsApp handoffs ----------------------------------------------------------
create table if not exists public.seo_virji_whatsapp_handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.seo_virji_conversations(id) on delete cascade,
  lead_id uuid references public.seo_virji_leads(id) on delete set null,
  whatsapp_number text not null,
  generated_message text not null,
  handoff_status text not null default 'link_generated' check (handoff_status in ('link_generated','opened')),
  created_at timestamptz not null default now()
);
create index if not exists seo_virji_handoffs_created_idx on public.seo_virji_whatsapp_handoffs (created_at desc);

-- 5.13 Feedback -------------------------------------------------------------------
create table if not exists public.seo_virji_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.seo_virji_conversations(id) on delete cascade,
  message_id uuid references public.seo_virji_messages(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  feedback_text text,
  created_at timestamptz not null default now()
);

-- 5.14 Usage logs -----------------------------------------------------------------
create table if not exists public.seo_virji_usage_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.seo_virji_conversations(id) on delete set null,
  message_id uuid references public.seo_virji_messages(id) on delete set null,
  provider text not null default 'openai',
  operation text not null default 'chat',
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(12, 6),
  request_status text not null check (request_status in ('success','error')),
  created_at timestamptz not null default now()
);
create index if not exists seo_virji_usage_created_idx on public.seo_virji_usage_logs (created_at desc);

-- 5.15 Audit logs -----------------------------------------------------------------
create table if not exists public.seo_virji_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.seo_virji_admin_users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists seo_virji_audit_created_idx on public.seo_virji_audit_logs (created_at desc);

-- updated_at triggers -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'seo_virji_admin_users','seo_virji_chatbot_settings','seo_virji_conversations',
    'seo_virji_conversation_memories','seo_virji_faqs','seo_virji_knowledge_sources',
    'seo_virji_knowledge_chunks','seo_virji_leads','seo_virji_website_crawl_pages'
  ] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.seo_virji_touch_updated_at()', t, t);
  end loop;
end $$;

-- 8.1 Semantic search ------------------------------------------------------------
create or replace function public.seo_virji_match_chunks(
  query_embedding extensions.vector({{EMBEDDING_DIMENSIONS}}),
  match_count integer default 6,
  min_similarity double precision default 0.3
)
returns table (
  chunk_id uuid, source_id uuid, content text, similarity double precision,
  title text, source_url text, source_type text, priority integer, metadata jsonb
)
language sql stable
set search_path = public, extensions
as $$
  select c.id, s.id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         s.title, s.source_url, s.source_type, s.priority, c.metadata
  from public.seo_virji_knowledge_chunks c
  join public.seo_virji_knowledge_sources s on s.id = c.knowledge_source_id
  where c.embedding is not null
    and s.status = 'active'
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 20);
$$;

-- 8.2 Keyword search (hybrid retrieval / works before embeddings exist) ----------
create or replace function public.seo_virji_keyword_chunks(query_text text, match_count integer default 6)
returns table (
  chunk_id uuid, source_id uuid, content text, rank real,
  title text, source_url text, source_type text, priority integer, metadata jsonb
)
language sql stable
set search_path = public, extensions
as $$
  select c.id, s.id, c.content, ts_rank(c.fts, q) as rank,
         s.title, s.source_url, s.source_type, s.priority, c.metadata
  from public.seo_virji_knowledge_chunks c
  join public.seo_virji_knowledge_sources s on s.id = c.knowledge_source_id,
       websearch_to_tsquery('english', query_text) q
  where s.status = 'active' and c.fts @@ q
  order by rank desc
  limit least(greatest(match_count, 1), 20);
$$;

-- Row Level Security: the database is never publicly readable. ------------------
-- The Node.js backend connects as a privileged role; anon/authenticated get nothing.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'seo_virji_%' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke execute on function public.seo_virji_match_chunks(extensions.vector, integer, double precision) from public, anon, authenticated;
revoke execute on function public.seo_virji_keyword_chunks(text, integer) from public, anon, authenticated;
revoke execute on function public.seo_virji_touch_updated_at() from public, anon, authenticated;

-- Default settings row --------------------------------------------------------------
insert into public.seo_virji_chatbot_settings (welcome_message, whatsapp_welcome_message)
select
  'Hi there! Welcome to SEO Virji. I''m your AI business growth consultant. I''d love to understand a little about your business and what you''re trying to achieve. Are you looking to improve your Google rankings, generate more qualified leads, increase website traffic, or solve another business challenge?',
  'Hi SEO Virji team! I''ve just been chatting with your AI consultant and would like to continue the conversation.'
where not exists (select 1 from public.seo_virji_chatbot_settings);
