/** OpenAI embeddings (batched) with usage logging. Returns null when OpenAI is not configured. */
import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { recordUsage, mapOpenAIError } from './openai.service.js';

const BATCH = 64;

export const embeddingsAvailable = () => Boolean(openai);

export async function embedTexts(texts, { conversationId = null } = {}) {
  if (!openai) return null;
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => String(t).slice(0, 24_000));
    try {
      const res = await openai.embeddings.create({
        model: env.OPENAI_EMBEDDING_MODEL,
        input: batch,
        dimensions: env.OPENAI_EMBEDDING_DIMENSIONS,
      });
      await recordUsage({ operation: 'embedding', model: env.OPENAI_EMBEDDING_MODEL, inputTokens: res.usage?.prompt_tokens || 0, outputTokens: 0, status: 'success', conversationId });
      res.data.sort((a, b) => a.index - b.index).forEach((d) => out.push(d.embedding));
    } catch (err) {
      await recordUsage({ operation: 'embedding', model: env.OPENAI_EMBEDDING_MODEL, status: 'error', conversationId });
      throw mapOpenAIError(err);
    }
  }
  return out;
}

export async function embedQuery(text, opts) {
  const res = await embedTexts([text], opts);
  return res ? res[0] : null;
}
