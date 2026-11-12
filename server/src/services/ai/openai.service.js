/**
 * OpenAI chat calls with structured (JSON-schema) output, safe error mapping and usage logging.
 * Never fabricates a reply: failures surface as AppErrors the controller turns into a friendly message.
 */
import { openai } from '../../config/openai.js';
import { env } from '../../config/env.js';
import { query } from '../../config/supabase.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export function estimateCost(operation, inputTokens, outputTokens) {
  const p = env.pricing;
  if (operation === 'embedding') return p.embedding == null ? null : (inputTokens / 1e6) * p.embedding;
  if (p.input == null || p.output == null) return null;
  return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
}

export async function recordUsage({ operation = 'chat', model, inputTokens = 0, outputTokens = 0, status, conversationId = null, messageId = null }) {
  try {
    await query(
      `insert into public.seo_virji_usage_logs (conversation_id, message_id, provider, operation, model, input_tokens, output_tokens, estimated_cost, request_status)
       values ($1,$2,'openai',$3,$4,$5,$6,$7,$8)`,
      [conversationId, messageId, operation, model, inputTokens, outputTokens, estimateCost(operation, inputTokens, outputTokens), status],
    );
  } catch (err) {
    logger.warn('usage.record_failed', { error: err.message });
  }
}

/** Translates provider errors into safe, typed AppErrors (details are logged, not returned). */
export function mapOpenAIError(err) {
  if (err instanceof AppError) return err;
  const status = err?.status;
  const code = err?.code || err?.error?.code;
  logger.error('openai.error', { status, code, type: err?.name, message: err?.message?.slice(0, 200) });
  if (status === 401) return new AppError(503, 'AI_AUTH_FAILED', 'The AI service is not configured correctly.');
  if (code === 'insufficient_quota') return new AppError(503, 'AI_QUOTA_EXCEEDED', 'The AI service is temporarily unavailable.');
  if (status === 429) return new AppError(503, 'AI_RATE_LIMITED', 'The AI service is busy right now.');
  if (code === 'context_length_exceeded') return new AppError(503, 'AI_CONTEXT_LIMIT', 'The conversation is too long for the AI service.');
  if (err?.name === 'APIConnectionTimeoutError' || err?.name === 'APIConnectionError') return new AppError(503, 'AI_UNREACHABLE', 'The AI service could not be reached.');
  if (status >= 500) return new AppError(503, 'AI_PROVIDER_ERROR', 'The AI service is having problems.');
  return new AppError(503, 'AI_ERROR', 'The AI service could not complete the request.');
}

export function assertAIConfigured() {
  if (!openai) throw new AppError(503, 'AI_NOT_CONFIGURED', 'The AI consultant is not configured yet (OPENAI_API_KEY is missing).');
}

/**
 * Calls the chat model expecting a JSON object matching `schema` (strict json_schema).
 * Returns { data, usage, model }.
 */
export async function chatJSON({ messages, schema, schemaName = 'response', model = env.OPENAI_CHAT_MODEL, temperature = env.OPENAI_TEMPERATURE, maxTokens = env.OPENAI_MAX_OUTPUT_TOKENS, conversationId = null, operation = 'chat' }) {
  assertAIConfigured();
  let res;
  try {
    res = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    });
  } catch (err) {
    await recordUsage({ operation, model, status: 'error', conversationId });
    throw mapOpenAIError(err);
  }

  const usage = { input: res.usage?.prompt_tokens || 0, output: res.usage?.completion_tokens || 0 };
  const choice = res.choices?.[0];
  let data;
  try {
    if (choice?.message?.refusal) throw new Error('refusal');
    if (choice?.finish_reason === 'length') throw new Error('truncated');
    data = JSON.parse(choice?.message?.content || '');
  } catch (err) {
    await recordUsage({ operation, model: res.model || model, inputTokens: usage.input, outputTokens: usage.output, status: 'error', conversationId });
    logger.error('openai.malformed_response', { reason: err.message });
    throw new AppError(503, 'AI_MALFORMED_RESPONSE', 'The AI service returned an unexpected response.');
  }
  return { data, usage, model: res.model || model };
}

/** Lightweight connectivity check used by scripts/test-connections.js. */
export async function pingChat() {
  assertAIConfigured();
  const res = await openai.chat.completions.create({
    model: env.OPENAI_CHAT_MODEL,
    messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    max_tokens: 5,
  });
  return res.choices?.[0]?.message?.content?.trim();
}
