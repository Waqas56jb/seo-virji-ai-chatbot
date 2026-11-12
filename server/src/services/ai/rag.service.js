/** RAG step: retrieves knowledge for the latest message (with light context from the previous turn). */
import { retrieve } from '../knowledge/vector-search.service.js';

export async function retrieveForMessage(message, recentMessages, { conversationId, topK, minSimilarity } = {}) {
  // Short follow-ups ("how long does that take?") are enriched with the previous visitor message.
  const previousUser = [...recentMessages].reverse().find((m) => m.role === 'user')?.content;
  const query = message.length < 60 && previousUser ? `${previousUser}\n${message}` : message;
  return retrieve(query, { conversationId, topK, minSimilarity });
}

/** Maps the model's used_source_ids ("S1"...) to public source references (website pages only get links). */
export function citedSources(chunks, usedIds = []) {
  const seen = new Set();
  const out = [];
  for (const id of usedIds) {
    const chunk = chunks[Number(String(id).replace(/\D/g, '')) - 1];
    if (!chunk || seen.has(chunk.sourceId)) continue;
    seen.add(chunk.sourceId);
    out.push({ title: chunk.title, url: chunk.type === 'website' ? chunk.url : null, type: chunk.type });
  }
  return out.slice(0, 3);
}
