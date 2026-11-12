/**
 * Hybrid retrieval: semantic (pgvector) + keyword (Postgres full-text) + FAQ matching.
 * Results are merged per chunk, admin-approved sources are boosted, and nothing below the
 * relevance thresholds is returned just to fill top-K.
 */
import { env } from '../../config/env.js';
import { many, toVector } from '../../config/supabase.js';
import { embedQuery, embeddingsAvailable } from '../ai/embedding.service.js';
import { logger } from '../../utils/logger.js';

const KEYWORD_MIN_RANK = 0.02;

function priorityBoost(row) {
  if (row.source_type === 'business_information' || row.source_type === 'manual') return 0.08;
  if (row.source_type === 'faq') return 0.06;
  return 0;
}

export async function retrieve(question, { topK = env.RAG_TOP_K, minSimilarity = env.RAG_SIMILARITY_THRESHOLD, conversationId = null } = {}) {
  const merged = new Map();
  let semanticUsed = false;

  if (embeddingsAvailable()) {
    try {
      const vector = await embedQuery(question, { conversationId });
      const rows = await many('select * from public.seo_virji_match_chunks($1::extensions.vector, $2, $3)', [
        toVector(vector),
        topK * 2,
        minSimilarity,
      ]);
      semanticUsed = true;
      for (const r of rows) merged.set(r.chunk_id, { ...r, score: r.similarity + priorityBoost(r), via: ['semantic'] });
    } catch (err) {
      logger.warn('rag.semantic_failed', { error: err.message });
    }
  }

  try {
    const rows = await many('select * from public.seo_virji_keyword_chunks($1, $2)', [question.slice(0, 500), topK * 2]);
    for (const r of rows) {
      if (r.rank < KEYWORD_MIN_RANK) continue;
      const keywordScore = Math.min(0.75, 0.3 + r.rank) + priorityBoost(r);
      const prev = merged.get(r.chunk_id);
      if (prev) {
        prev.score += 0.1; // confirmed by both retrievers
        prev.via.push('keyword');
      } else merged.set(r.chunk_id, { ...r, score: semanticUsed ? keywordScore * 0.85 : keywordScore, via: ['keyword'] });
    }
  } catch (err) {
    logger.warn('rag.keyword_failed', { error: err.message });
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => ({
      chunkId: r.chunk_id,
      sourceId: r.source_id,
      title: r.title,
      url: r.source_url,
      type: r.source_type,
      content: r.content,
      score: Number(r.score.toFixed(4)),
      via: r.via,
    }));
}
