/**
 * Admin knowledge management: website sources, business-information sections, manual
 * documents and FAQs. Every content change re-chunks and re-embeds the affected source.
 */
import { many, one, query } from '../../config/supabase.js';
import { notFound } from '../../utils/errors.js';
import { contentHash } from '../crawler/deduplication.service.js';
import { indexSource } from './source-management.service.js';

const SOURCE_FIELDS = `s.id, s.title, s.source_type, s.source_url, s.section_key, s.status, s.embedding_status, s.priority, s.version,
  s.last_crawled_at, s.last_updated_at, s.metadata, s.created_at, s.updated_at,
  (select count(*)::int from public.seo_virji_knowledge_chunks c where c.knowledge_source_id = s.id) as chunk_count,
  (select count(*)::int from public.seo_virji_knowledge_chunks c where c.knowledge_source_id = s.id and c.embedding is not null) as embedded_count`;

export function serializeSource(s, { withContent = false, preview = false } = {}) {
  const pageStatus =
    s.status !== 'active' ? s.status : s.embedding_status === 'complete' ? 'indexed' : s.embedding_status === 'pending' ? 'indexing' : s.embedding_status;
  return {
    id: s.id,
    title: s.title,
    type: s.source_type,
    url: s.source_url,
    sectionKey: s.section_key,
    description: s.metadata?.description || '',
    status: pageStatus,
    sourceStatus: s.status,
    embeddingStatus: s.embedding_status,
    chunkCount: s.chunk_count ?? undefined,
    embeddedCount: s.embedded_count ?? undefined,
    version: s.version,
    lastCrawledAt: s.last_crawled_at,
    updatedAt: s.last_updated_at || s.updated_at,
    category: s.metadata?.category || null,
    adminEdited: Boolean(s.metadata?.admin_edited),
    websiteChangedSinceEdit: Boolean(s.metadata?.website_changed),
    removedFromWebsite: Boolean(s.metadata?.removed_from_website),
    ...(withContent ? { content: s.content } : {}),
    ...(preview && !withContent && s.content ? { preview: s.content.slice(0, 280) } : {}),
  };
}

/* ------------------------------------------------------------ sources */

const like = (q) => `%${String(q).replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

/**
 * Lists knowledge records with optional search / filters / pagination.
 * Without paging params it returns every active record (used by the Knowledge Base sections).
 */
export async function listSources({ type, status = 'active', search, embedding, page, pageSize } = {}) {
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replaceAll('$?', `$${params.length}`));
  };
  if (type) add('s.source_type = $?', type);
  if (status && status !== 'all') add('s.status = $?', status);
  if (embedding === 'failed') {
    where.push(`(s.content <> '' and (s.embedding_status in ('failed','not_configured') or exists (select 1 from public.seo_virji_knowledge_chunks c where c.knowledge_source_id = s.id and c.embedding is null)))`);
  } else if (embedding) add('s.embedding_status = $?', embedding);
  if (search) add('(s.title ilike $? or s.source_url ilike $? or s.content ilike $?)', like(search));
  const clause = where.length ? `where ${where.join(' and ')}` : '';
  const order = `order by case s.source_type when 'business_information' then 0 when 'manual' then 1 when 'website' then 2 else 3 end,
              s.source_url nulls last, s.created_at`;
  const paged = Boolean(page || pageSize);
  const size = Math.min(100, pageSize || 25);
  const current = Math.max(1, page || 1);
  const limit = paged ? ` limit ${size} offset ${(current - 1) * size}` : '';
  const rows = await many(`select ${SOURCE_FIELDS}, s.content from public.seo_virji_knowledge_sources s ${clause} ${order}${limit}`, params);
  const items = rows.map((s) => serializeSource(s, { withContent: s.source_type !== 'website', preview: true }));
  if (!paged) return items;
  const total = (await one(`select count(*)::int n from public.seo_virji_knowledge_sources s ${clause}`, params)).n;
  return { items, total, page: current, pageSize: size };
}

export async function getSource(id) {
  const s = await one(`select ${SOURCE_FIELDS}, s.content from public.seo_virji_knowledge_sources s where s.id = $1`, [id]);
  if (!s) throw notFound('Knowledge source not found');
  const chunks = await many(
    `select id, chunk_index, left(content, 400) as preview, token_count, (embedding is not null) as embedded
     from public.seo_virji_knowledge_chunks where knowledge_source_id = $1 order by chunk_index`,
    [id],
  );
  return {
    ...serializeSource(s, { withContent: true }),
    chunks: chunks.map((c) => ({ id: c.id, index: c.chunk_index, preview: c.preview, tokens: c.token_count, embedded: c.embedded })),
  };
}

export async function createManualSource({ title, content, type = 'manual' }) {
  const row = await one(
    `insert into public.seo_virji_knowledge_sources (title, source_type, content, content_hash, status, priority)
     values ($1,$2,$3,$4,'active',100) returning id`,
    [title, type, content, contentHash(content)],
  );
  await indexSource(row.id);
  return getSource(row.id);
}

/**
 * Updates title/content; re-indexes only when content actually changed.
 * Editing a crawled website page marks it "admin edited", so later syncs keep the owner's version.
 */
export async function updateSource(id, { title, content }) {
  const current = await one('select id, content, content_hash, source_type from public.seo_virji_knowledge_sources where id = $1', [id]);
  if (!current) throw notFound('Knowledge source not found');
  const nextContent = content ?? current.content;
  const hash = contentHash(nextContent);
  const changed = hash !== current.content_hash;
  const editedWebsite = current.source_type === 'website' && changed;
  await query(
    `update public.seo_virji_knowledge_sources set title = coalesce($2, title), content = $3, content_hash = $4,
       last_updated_at = now(), version = case when content_hash is distinct from $4 then version + 1 else version end,
       metadata = case when $5 then metadata || jsonb_build_object('admin_edited', true, 'website_hash_at_edit', content_hash, 'edited_at', now()) else metadata end
     where id = $1`,
    [id, title ?? null, nextContent, hash, editedWebsite],
  );
  if (changed) await indexSource(id);
  return getSource(id);
}

/** Activate / deactivate. Inactive records stay stored but are never retrieved by the AI. */
export async function setSourceStatus(id, status) {
  const s = await one('select id, faq_id from public.seo_virji_knowledge_sources where id = $1', [id]);
  if (!s) throw notFound('Knowledge source not found');
  await query('update public.seo_virji_knowledge_sources set status = $2, last_updated_at = now() where id = $1', [id, status]);
  if (s.faq_id) await query('update public.seo_virji_faqs set is_active = $2 where id = $1', [s.faq_id, status === 'active']);
  if (status === 'active') {
    const c = await one(
      `select (select count(*) from public.seo_virji_knowledge_chunks where knowledge_source_id = $1)::int chunks,
              (select count(*) from public.seo_virji_knowledge_chunks where knowledge_source_id = $1 and embedding is null)::int unembedded`,
      [id],
    );
    if (!c.chunks || c.unembedded) await indexSource(id);
  }
  return getSource(id);
}

/** Drops the owner's edit of a website page so the next sync of that page restores the website text. */
export async function revertWebsiteEdit(id) {
  const s = await one('select id, source_type, source_url from public.seo_virji_knowledge_sources where id = $1', [id]);
  if (!s) throw notFound('Knowledge source not found');
  await query(
    `update public.seo_virji_knowledge_sources set content_hash = null,
       metadata = metadata - 'admin_edited' - 'website_hash_at_edit' - 'edited_at' - 'website_hash' - 'website_changed' where id = $1`,
    [id],
  );
  return s;
}

/** Re-chunks and re-embeds one record (retry after an embedding failure). */
export async function reprocessSource(id) {
  const s = await one('select id from public.seo_virji_knowledge_sources where id = $1', [id]);
  if (!s) throw notFound('Knowledge source not found');
  const result = await indexSource(id);
  return { ...result, source: await getSource(id) };
}

/** Retries every active record whose embeddings failed or are missing. */
export async function retryFailedEmbeddings() {
  const rows = await many(
    `select s.id from public.seo_virji_knowledge_sources s where s.status = 'active' and s.content <> '' and (
       s.embedding_status in ('failed','not_configured','pending')
       or exists (select 1 from public.seo_virji_knowledge_chunks c where c.knowledge_source_id = s.id and c.embedding is null))`,
  );
  let embedded = 0;
  let stillFailing = 0;
  for (const r of rows) {
    const out = await indexSource(r.id);
    embedded += out.embedded;
    if (out.embeddingStatus && out.embeddingStatus !== 'complete') stillFailing += 1;
  }
  return { sources: rows.length, embedded, stillFailing };
}

export async function deleteSource(id) {
  const s = await one('select source_type, faq_id from public.seo_virji_knowledge_sources where id = $1', [id]);
  if (!s) throw notFound('Knowledge source not found');
  if (s.source_type === 'business_information') {
    // Sections are permanent slots — "deleting" clears their content.
    await query(`update public.seo_virji_knowledge_sources set content = '', content_hash = null where id = $1`, [id]);
    await query('delete from public.seo_virji_knowledge_chunks where knowledge_source_id = $1', [id]);
    return;
  }
  if (s.faq_id) {
    await query('delete from public.seo_virji_faqs where id = $1', [s.faq_id]); // source + chunks cascade
    return;
  }
  // Chunks are removed by ON DELETE CASCADE.
  await query('delete from public.seo_virji_knowledge_sources where id = $1', [id]);
}

/* ------------------------------------------------------------ FAQs (each FAQ is also an embedded source) */

export function serializeFaq(f) {
  return { id: f.id, question: f.question, answer: f.answer, category: f.category, isActive: f.is_active, updatedAt: f.updated_at, createdAt: f.created_at };
}

async function syncFaqSource(faq) {
  const content = `Question: ${faq.question}\nAnswer: ${faq.answer}`;
  const existing = await one('select id from public.seo_virji_knowledge_sources where faq_id = $1', [faq.id]);
  let id = existing?.id;
  if (id) {
    await query(`update public.seo_virji_knowledge_sources set title = $2, content = $3, content_hash = $4, status = $5, last_updated_at = now() where id = $1`, [
      id, faq.question, content, contentHash(content), faq.is_active ? 'active' : 'inactive',
    ]);
  } else {
    id = (
      await one(
        `insert into public.seo_virji_knowledge_sources (title, source_type, faq_id, content, content_hash, status, priority) values ($1,'faq',$2,$3,$4,$5,90) returning id`,
        [faq.question, faq.id, content, contentHash(content), faq.is_active ? 'active' : 'inactive'],
      )
    ).id;
  }
  await indexSource(id);
}

export async function listFaqs() {
  return (await many('select * from public.seo_virji_faqs order by created_at desc')).map(serializeFaq);
}

export async function createFaq({ question, answer, category = 'general' }) {
  const faq = await one('insert into public.seo_virji_faqs (question, answer, category) values ($1,$2,$3) returning *', [question, answer, category]);
  await syncFaqSource(faq);
  return serializeFaq(faq);
}

export async function updateFaq(id, patch) {
  const faq = await one(
    `update public.seo_virji_faqs set question = coalesce($2, question), answer = coalesce($3, answer),
       category = coalesce($4, category), is_active = coalesce($5, is_active) where id = $1 returning *`,
    [id, patch.question ?? null, patch.answer ?? null, patch.category ?? null, patch.isActive ?? null],
  );
  if (!faq) throw notFound('FAQ not found');
  await syncFaqSource(faq);
  return serializeFaq(faq);
}

export async function deleteFaq(id) {
  const { rowCount } = await query('delete from public.seo_virji_faqs where id = $1', [id]); // source cascades
  if (!rowCount) throw notFound('FAQ not found');
}

/* ------------------------------------------------------------ overview */

export async function knowledgeStatus() {
  const counts = await one(`select
      (select count(*)::int from public.seo_virji_knowledge_sources where source_type = 'website' and status = 'active') website_pages,
      (select count(*)::int from public.seo_virji_knowledge_sources where source_type in ('business_information','manual') and status = 'active' and content <> '') manual_sources,
      (select count(*)::int from public.seo_virji_faqs where is_active) faqs,
      (select count(*)::int from public.seo_virji_knowledge_chunks) chunks,
      (select count(*)::int from public.seo_virji_knowledge_chunks where embedding is not null) embedded,
      (select count(*)::int from public.seo_virji_knowledge_sources where status = 'inactive') inactive_sources,
      (select count(*)::int from public.seo_virji_knowledge_sources s where s.status = 'active' and s.content <> '' and (s.embedding_status in ('failed','not_configured')
          or exists (select 1 from public.seo_virji_knowledge_chunks c where c.knowledge_source_id = s.id and c.embedding is null))) failed_embeddings`);
  const lastSuccess = await one(`select completed_at from public.seo_virji_website_crawl_jobs where status = 'completed' order by completed_at desc limit 1`);
  return { ...counts, lastSuccessfulSyncAt: lastSuccess?.completed_at || null };
}
