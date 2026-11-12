/**
 * Turns a knowledge source into chunks + embeddings.
 * Unchanged chunks (same content hash) keep their existing embedding — no duplicate
 * OpenAI calls. Obsolete chunks are deleted. If OpenAI is not configured, chunks are
 * stored without vectors (keyword search still works) and marked `not_configured`.
 */
import { many, one, query, toVector, transaction } from '../../config/supabase.js';
import { embedTexts, embeddingsAvailable } from '../ai/embedding.service.js';
import { chunkDocument } from '../crawler/content-chunker.service.js';
import { logger } from '../../utils/logger.js';

export async function indexSource(sourceId) {
  const source = await one('select * from public.seo_virji_knowledge_sources where id = $1', [sourceId]);
  if (!source) return { chunks: 0, embedded: 0, reused: 0 };

  const chunks = source.content.trim()
    ? chunkDocument({
        text: source.content,
        title: source.title,
        sourceUrl: source.source_url,
        sourceId: source.id,
        crawledAt: source.last_crawled_at,
      })
    : [];

  // Reuse embeddings for chunks whose content is unchanged.
  const existing = await many(
    `select content_hash, embedding::text as embedding from public.seo_virji_knowledge_chunks
     where knowledge_source_id = $1 and embedding is not null`,
    [sourceId],
  );
  const reuse = new Map(existing.map((r) => [r.content_hash, r.embedding]));
  const toEmbed = chunks.filter((c) => !reuse.has(c.content_hash));

  let vectors = null;
  let embeddingStatus = 'complete';
  if (toEmbed.length) {
    if (!embeddingsAvailable()) embeddingStatus = 'not_configured';
    else {
      try {
        vectors = await embedTexts(toEmbed.map((c) => c.content));
      } catch (err) {
        logger.error('knowledge.embedding_failed', { sourceId, error: err.message });
        embeddingStatus = 'failed';
      }
    }
  }
  const fresh = new Map();
  toEmbed.forEach((c, i) => vectors?.[i] && fresh.set(c.content_hash, toVector(vectors[i])));

  await transaction(async (client) => {
    await client.query('delete from public.seo_virji_knowledge_chunks where knowledge_source_id = $1', [sourceId]);
    // One multi-row insert per batch (far fewer database round trips than row-by-row).
    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50);
      const params = [sourceId];
      const rows = batch.map((c) => {
        params.push(c.chunk_index, c.content, reuse.get(c.content_hash) || fresh.get(c.content_hash) || null, c.token_count, c.metadata, c.content_hash);
        const n = params.length;
        return `($1,$${n - 5},$${n - 4},$${n - 3}::extensions.vector,$${n - 2},$${n - 1},$${n})`;
      });
      await client.query(
        `insert into public.seo_virji_knowledge_chunks (knowledge_source_id, chunk_index, content, embedding, token_count, metadata, content_hash)
         values ${rows.join(',')}`,
        params,
      );
    }
    await client.query('update public.seo_virji_knowledge_sources set embedding_status = $2 where id = $1', [sourceId, embeddingStatus]);
  });

  return { chunks: chunks.length, embedded: fresh.size, reused: chunks.length - toEmbed.length, embeddingStatus };
}

/** Embeds every chunk that has no vector yet (after OPENAI_API_KEY is added, or after failures). */
export async function embedMissingChunks({ batchSize = 64, onProgress } = {}) {
  if (!embeddingsAvailable()) return { embedded: 0, skipped: 'OPENAI_API_KEY is not configured' };
  let embedded = 0;
  for (;;) {
    const rows = await many(
      `select id, content from public.seo_virji_knowledge_chunks where embedding is null order by created_at limit $1`,
      [batchSize],
    );
    if (!rows.length) break;
    const vectors = await embedTexts(rows.map((r) => r.content));
    for (let i = 0; i < rows.length; i += 1) {
      await query('update public.seo_virji_knowledge_chunks set embedding = $2::extensions.vector where id = $1', [rows[i].id, toVector(vectors[i])]);
    }
    embedded += rows.length;
    onProgress?.(embedded);
  }
  await query(`update public.seo_virji_knowledge_sources s set embedding_status = 'complete'
               where not exists (select 1 from public.seo_virji_knowledge_chunks c where c.knowledge_source_id = s.id and c.embedding is null)`);
  return { embedded };
}

/** Re-chunks and re-embeds every active source (used by `npm run embeddings:rebuild -- --full`). */
export async function reindexAll() {
  const sources = await many(`select id from public.seo_virji_knowledge_sources where status = 'active'`);
  let chunks = 0;
  for (const s of sources) chunks += (await indexSource(s.id)).chunks;
  return { sources: sources.length, chunks };
}
