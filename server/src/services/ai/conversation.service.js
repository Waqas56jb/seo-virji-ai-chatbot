/**
 * Visitor conversations: start/resume, secure session checks, and the full message pipeline.
 */
import { env } from '../../config/env.js';
import { many, one, query, transaction } from '../../config/supabase.js';
import { AppError, notFound, unauthorized } from '../../utils/errors.js';
import { randomToken, sha256, truncate } from '../../utils/text-utils.js';
import { logger } from '../../utils/logger.js';
import { runInBackground } from '../../utils/background.js';
import { getSettings, whatsappNumber } from '../settings.service.js';
import { chatJSON, recordUsage } from './openai.service.js';
import { buildSystemPrompt, REPLY_SCHEMA } from './prompt-builder.service.js';
import { getMemory, getRecentMessages, groundFacts, maybeUpdateSummary, mergeFacts, recallOlderMessages, saveFacts } from './memory.service.js';
import { citedSources, retrieveForMessage } from './rag.service.js';
import { syncLeadFromConversation } from '../leads/lead.service.js';

const STARTERS = ['Improve My Google Rankings', 'Generate More Leads', 'Discuss My Business Challenges'];
const FACT_ORDER = ['challenge', 'industry', 'website', 'seo_situation', 'goal', 'business_name', 'name', 'budget', 'contact_method'];
const FACT_NAMES = {
  challenge: 'their main challenge', industry: 'their industry', website: 'their website', seo_situation: 'their SEO history',
  goal: 'their main goal', business_name: 'business name', name: 'their name (ask permission)', budget: 'budget range (only if relevant)',
  contact_method: 'preferred contact method',
};

/**
 * One in-flight AI request per conversation, enforced in the database so it also holds
 * across serverless instances. The lock expires on its own if a worker dies.
 */
async function acquireLock(conversationId) {
  const row = await one(
    `update public.seo_virji_conversations set processing_until = now() + interval '90 seconds'
     where id = $1 and (processing_until is null or processing_until < now()) returning id`,
    [conversationId],
  );
  return Boolean(row);
}
const releaseLock = (conversationId) =>
  query('update public.seo_virji_conversations set processing_until = null where id = $1', [conversationId]).catch(() => {});

export async function assertChatbotEnabled() {
  const settings = await getSettings();
  if (settings && settings.chatbot_enabled === false) {
    throw new AppError(503, 'CHATBOT_DISABLED', 'The assistant is currently unavailable. Please use the contact details on the website.');
  }
  return settings;
}

/* ------------------------------------------------------------ serialization */

export function serializeMessage(m) {
  const meta = m.metadata || {};
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    ...(meta.quickReplies?.length ? { quickReplies: meta.quickReplies } : {}),
    ...(meta.attachment ? { attachment: meta.attachment } : {}),
    ...(meta.noted ? { noted: meta.noted } : {}),
    ...(meta.sources?.length ? { sources: meta.sources } : {}),
  };
}

const PUBLIC_FACTS = { name: 'name', business_name: 'businessName', website: 'website', industry: 'industry', challenge: 'challenge', goal: 'goal', seo_situation: 'seoSituation', budget: 'budget', contact_method: 'contactMethod' };
/** The visitor's own details (what they told us) — used for the handoff preview in the widget. */
export function publicLead(facts = {}) {
  return Object.fromEntries(Object.entries(PUBLIC_FACTS).filter(([k]) => facts[k]).map(([k, v]) => [v, facts[k]]));
}

/* ------------------------------------------------------------ sessions */

async function createConversation(visitorId, { source, websiteUrl }) {
  const settings = await getSettings();
  const token = randomToken(32);
  const conv = await transaction(async (client) => {
    const c = (
      await client.query(
        `insert into public.seo_virji_conversations (visitor_id, session_id, session_expires_at, source, website_url)
         values ($1,$2, now() + make_interval(days => $3), $4, $5) returning *`,
        [visitorId, sha256(token), env.CHAT_SESSION_DAYS, source || 'widget', websiteUrl || null],
      )
    ).rows[0];
    await client.query(
      `insert into public.seo_virji_messages (conversation_id, role, content, message_type, metadata) values ($1,'assistant',$2,'greeting',$3)`,
      [c.id, settings.welcome_message, { quickReplies: STARTERS }],
    );
    await client.query(`insert into public.seo_virji_conversation_memories (conversation_id, visitor_id) values ($1,$2)`, [c.id, visitorId]);
    await client.query(`update public.seo_virji_conversations set message_count = 1 where id = $1`, [c.id]);
    return c;
  });
  return { conv, token };
}

/** Loads a conversation the visitor is allowed to access (uuid + visitorId + session token must all match). */
export async function authorizeConversation(conversationUuid, visitorId, token) {
  if (!token) throw unauthorized('Missing chat session', 'SESSION_INVALID');
  const conv = await one('select * from public.seo_virji_conversations where conversation_uuid = $1', [conversationUuid]);
  // Same error for "not found" and "wrong owner" so conversation IDs cannot be probed.
  if (!conv || conv.visitor_id !== visitorId || conv.session_id !== sha256(token)) throw unauthorized('This chat session is not valid', 'SESSION_INVALID');
  if (new Date(conv.session_expires_at) < new Date()) throw unauthorized('This chat session has expired', 'SESSION_EXPIRED');
  if (conv.status === 'archived') throw unauthorized('This conversation is closed', 'SESSION_INVALID');
  return conv;
}

async function messagesFor(conversationId) {
  const rows = await many('select * from public.seo_virji_messages where conversation_id = $1 and role in (\'user\',\'assistant\') order by created_at, id', [conversationId]);
  return rows.map(serializeMessage);
}

export async function startOrResume({ visitorId, resume, resumeOnly = false, source, websiteUrl }) {
  if (resume?.conversationId && resume?.sessionToken) {
    try {
      const conv = await authorizeConversation(resume.conversationId, visitorId, resume.sessionToken);
      if (conv.status !== 'completed') {
        await query(`update public.seo_virji_conversations set session_expires_at = now() + make_interval(days => $2) where id = $1`, [conv.id, env.CHAT_SESSION_DAYS]);
        const memory = await getMemory(conv.id);
        return { conversationId: conv.conversation_uuid, sessionToken: resume.sessionToken, resumed: true, messages: await messagesFor(conv.id), lead: publicLead(memory.important_facts) };
      }
    } catch (err) {
      if (!(err instanceof AppError)) throw err; // invalid/expired → start fresh below
    }
  }
  // Page-load resume attempts must not create empty conversations.
  if (resumeOnly) return { resumed: false, conversationId: null, sessionToken: null, messages: [], lead: {} };
  const { conv, token } = await createConversation(visitorId, { source, websiteUrl });
  return { conversationId: conv.conversation_uuid, sessionToken: token, resumed: false, messages: await messagesFor(conv.id), lead: {} };
}

export async function getConversationForVisitor(conversationUuid, visitorId, token) {
  const conv = await authorizeConversation(conversationUuid, visitorId, token);
  const memory = await getMemory(conv.id);
  return { conversationId: conv.conversation_uuid, status: conv.status, messages: await messagesFor(conv.id), lead: publicLead(memory.important_facts) };
}

export async function endConversation(conv, status = 'completed') {
  await query(`update public.seo_virji_conversations set status = $2 where id = $1 and status <> 'transferred'`, [conv.id, status]);
}

/* ------------------------------------------------------------ message pipeline */

function newlyNoted(before, after) {
  for (const key of FACT_ORDER) {
    if (after[key] && after[key] !== before[key] && !['email', 'phone'].includes(key)) {
      const labels = { challenge: 'challenge', industry: 'industry', website: 'website', seo_situation: 'seoSituation', goal: 'goal', business_name: 'businessName', name: 'name', budget: 'budget', contact_method: 'contactMethod' };
      return { field: labels[key], value: truncate(after[key], 80) };
    }
  }
  return null;
}

export async function handleMessage({ conv, text: incomingText, clientMessageId }) {
  let text = incomingText;
  await assertChatbotEnabled();
  if (!(await acquireLock(conv.id))) throw new AppError(409, 'MESSAGE_IN_PROGRESS', 'Please wait for the current reply to finish.');
  try {
    // 1) Save the visitor message first (idempotent on clientMessageId) so it is never lost.
    let userMsg = clientMessageId
      ? await one('select * from public.seo_virji_messages where conversation_id = $1 and client_message_id = $2', [conv.id, clientMessageId])
      : null;
    if (userMsg) {
      const answered = await one(
        `select * from public.seo_virji_messages where conversation_id = $1 and role = 'assistant' and metadata->>'reply_to' = $2`,
        [conv.id, userMsg.id],
      );
      if (answered) return { message: serializeMessage(answered), duplicate: true, ...(await turnExtras(conv)) };
      text = userMsg.content; // safe retry of a message whose reply previously failed
    } else {
      userMsg = await one(
        `insert into public.seo_virji_messages (conversation_id, role, content, client_message_id) values ($1,'user',$2,$3) returning *`,
        [conv.id, text, clientMessageId || null],
      );
      await query(
        `update public.seo_virji_conversations set message_count = message_count + 1, last_message_at = now(),
           topic = coalesce(topic, $2), status = case when status in ('completed','resolved') then 'active' else status end where id = $1`,
        [conv.id, truncate(text, 120)],
      );
    }

    // 2) Context: last 20 messages (includes the one just saved), memory, settings, knowledge.
    const settings = await getSettings();
    const memoryLimit = settings.memory_message_limit || env.CHAT_MEMORY_LIMIT;
    const [memory, recent, number] = await Promise.all([getMemory(conv.id), getRecentMessages(conv.id, memoryLimit), whatsappNumber()]);
    const knowledge = await retrieveForMessage(text, recent.slice(0, -1), {
      conversationId: conv.id,
      topK: settings.rag_top_k || env.RAG_TOP_K,
      minSimilarity: settings.rag_min_similarity != null ? Number(settings.rag_min_similarity) : env.RAG_SIMILARITY_THRESHOLD,
    });
    const facts = memory.important_facts || {};
    const missingFacts = FACT_ORDER.filter((k) => !facts[k]).map((k) => FACT_NAMES[k]);
    const whatsappAvailable = settings.whatsapp_enabled && Boolean(number);
    const countRow = await one('select message_count from public.seo_virji_conversations where id = $1', [conv.id]);
    const beyondWindow = countRow.message_count > memoryLimit;
    const includeSummary = beyondWindow && memory.memory_summary;
    // Older messages that fell out of the window but relate to this message (e.g. "what did I say my budget was?").
    const olderMessages = beyondWindow ? await recallOlderMessages(conv.id, text, memoryLimit) : [];

    const system = buildSystemPrompt({
      settings,
      knowledge,
      memorySummary: includeSummary ? memory.memory_summary : '',
      olderMessages,
      facts,
      missingFacts,
      whatsappAvailable,
    });

    // 3) AI call (no fabricated fallback — errors propagate as friendly 503s).
    const { data, usage, model } = await chatJSON({
      conversationId: conv.id,
      schemaName: 'consultant_reply',
      schema: REPLY_SCHEMA,
      model: settings.ai_model || env.OPENAI_CHAT_MODEL,
      temperature: settings.temperature != null ? Number(settings.temperature) : env.OPENAI_TEMPERATURE,
      maxTokens: settings.max_output_tokens || env.OPENAI_MAX_OUTPUT_TOKENS,
      messages: [{ role: 'system', content: system }, ...recent.map((m) => ({ role: m.role, content: m.content }))],
    });

    const reply = String(data.reply || '').trim();
    if (!reply) throw new AppError(503, 'AI_EMPTY_RESPONSE', 'The AI service returned an empty reply.');

    // 4) Facts, lead and reply metadata.
    const visitorText = (await many(`select content from public.seo_virji_messages where conversation_id = $1 and role = 'user'`, [conv.id]))
      .map((m) => m.content)
      .join('\n');
    const updatedFacts = mergeFacts(facts, groundFacts(mergeFacts({}, data.lead), visitorText));
    const requirements = [...new Set([...(memory.business_context?.requirements || []), ...(data.requirements || [])])];
    const sources = citedSources(knowledge, data.used_source_ids);
    const offerWhatsapp = Boolean(data.offer_whatsapp && whatsappAvailable);
    const metadata = {
      reply_to: userMsg.id,
      quickReplies: (data.suggested_replies || []).map((s) => truncate(String(s), 60)).filter(Boolean).slice(0, 3),
      ...(offerWhatsapp ? { attachment: { type: 'whatsapp-cta' } } : {}),
      ...(sources.length ? { sources } : {}),
      noted: newlyNoted(facts, updatedFacts),
      retrieval: knowledge.map((k) => ({ id: k.chunkId, score: k.score, via: k.via })),
      interest: data.interest_level,
    };

    const assistantMsg = await one(
      `insert into public.seo_virji_messages (conversation_id, role, content, metadata, tokens_used, model) values ($1,'assistant',$2,$3,$4,$5) returning *`,
      [conv.id, reply, metadata, usage.input + usage.output, model],
    );
    await recordUsage({ operation: 'chat', model, inputTokens: usage.input, outputTokens: usage.output, status: 'success', conversationId: conv.id, messageId: assistantMsg.id });
    const after = await one(
      `update public.seo_virji_conversations set message_count = message_count + 1, last_message_at = now() where id = $1 returning message_count`,
      [conv.id],
    );

    await saveFacts(conv.id, conv.visitor_id, updatedFacts, requirements);
    const lead = await syncLeadFromConversation(conv.id, updatedFacts, { interest: data.interest_level, requirements: data.requirements || [], summary: memory.memory_summary || null });

    // Summaries are not needed for this reply — refresh them in the background (no added latency).
    runInBackground('memory.summary', async () => {
      const summary = await maybeUpdateSummary(conv.id, after.message_count);
      if (summary && lead) await query('update public.seo_virji_leads set summary = $2 where id = $1', [lead.id, summary]);
    });

    return {
      message: serializeMessage(assistantMsg),
      suggestedReplies: metadata.quickReplies,
      sources,
      leadStatus: lead?.lead_status || 'new',
      lead: publicLead(updatedFacts),
    };
  } catch (err) {
    logger.warn('chat.message_failed', { conversation: conv.conversation_uuid, code: err.code, error: err.message });
    throw err;
  } finally {
    await releaseLock(conv.id);
  }
}

async function turnExtras(conv) {
  const memory = await getMemory(conv.id);
  const lead = await one('select lead_status from public.seo_virji_leads where conversation_id = $1', [conv.id]);
  return { leadStatus: lead?.lead_status || 'new', lead: publicLead(memory.important_facts) };
}

export async function addFeedback(conv, { messageId, rating, text }) {
  if (messageId) {
    const msg = await one('select id from public.seo_virji_messages where id = $1 and conversation_id = $2', [messageId, conv.id]);
    if (!msg) throw notFound('Message not found');
  }
  await query('insert into public.seo_virji_feedback (conversation_id, message_id, rating, feedback_text) values ($1,$2,$3,$4)', [conv.id, messageId || null, rating, text || null]);
}
