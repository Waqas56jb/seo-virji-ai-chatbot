/** Admin read models: conversations (shaped for the admin UI) and analytics from real data. */
import { many, one, query } from '../config/supabase.js';
import { notFound } from '../utils/errors.js';
import { serializeLead } from './leads/lead.service.js';
import { referenceCode } from './whatsapp/whatsapp.service.js';

const QUALIFIED = `('qualified','contacted','converted')`;

/** Admin-facing status (matches the admin filters): resolved > handoff > qualified > new. */
function uiStatus(c) {
  if (c.status === 'resolved' || c.status === 'archived') return 'resolved';
  if (c.status === 'transferred' || c.whatsapp_handoff_at) return 'handoff';
  if (['qualified', 'contacted', 'converted'].includes(c.lead_status)) return 'qualified';
  return 'new';
}

function serializeConversation(c) {
  return {
    id: c.conversation_uuid,
    reference: referenceCode(c.conversation_uuid),
    visitorId: c.visitor_id,
    visitorName: c.visitor_name || null,
    leadId: c.lead_id || null,
    topic: c.topic || 'New conversation',
    preview: c.first_user_message || c.topic || '',
    summary: c.summary || '',
    status: uiStatus(c),
    conversationStatus: c.status,
    resolved: c.status === 'resolved' || c.status === 'archived',
    resolvedAt: c.resolved_at || null,
    leadStatus: c.lead_status,
    handoff: Boolean(c.whatsapp_handoff_at),
    handoffAt: c.whatsapp_handoff_at,
    handoffStatus: c.handoff_status || null,
    messageCount: c.message_count,
    sourcePage: c.website_url || null,
    startedAt: c.created_at,
    lastMessageAt: c.last_message_at,
  };
}

const LIST_SELECT = `select c.*, l.id as lead_id,
  (select m.content from public.seo_virji_messages m where m.conversation_id = c.id and m.role = 'user' order by m.created_at limit 1) as first_user_message,
  (select h.handoff_status from public.seo_virji_whatsapp_handoffs h where h.conversation_id = c.id order by h.created_at desc limit 1) as handoff_status
  from public.seo_virji_conversations c left join public.seo_virji_leads l on l.conversation_id = c.id`;

const RESOLVED = `c.status in ('resolved','archived')`;
const HANDOFF = `(c.status = 'transferred' or c.whatsapp_handoff_at is not null)`;
const STATUS_FILTER = {
  new: `not ${RESOLVED} and not ${HANDOFF} and c.lead_status not in ${QUALIFIED}`,
  qualified: `not ${RESOLVED} and not ${HANDOFF} and c.lead_status in ${QUALIFIED}`,
  handoff: `not ${RESOLVED} and ${HANDOFF}`,
  active: `not ${RESOLVED}`,
  resolved: RESOLVED,
};

const like = (q) => `%${String(q).replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

function conversationWhere({ status = 'all', search = '', from, to } = {}) {
  const where = ['c.message_count > 1']; // hide conversations where the visitor never wrote anything
  const params = [];
  if (STATUS_FILTER[status]) where.push(STATUS_FILTER[status]);
  if (from) {
    params.push(from);
    where.push(`c.last_message_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`c.created_at < ($${params.length}::date + interval '1 day')`);
  }
  if (search) {
    params.push(like(search));
    const p = `$${params.length}`;
    params.push(`${search.trim().toLowerCase()}%`);
    const ref = `$${params.length}`;
    where.push(`(c.visitor_name ilike ${p} or c.topic ilike ${p} or c.summary ilike ${p} or c.conversation_uuid::text like ${ref}
      or exists (select 1 from public.seo_virji_messages m where m.conversation_id = c.id and m.content ilike ${p}))`);
  }
  return { clause: `where ${where.join(' and ')}`, params };
}

export async function listConversations({ page = 1, pageSize = 30, ...filters } = {}) {
  const { clause, params } = conversationWhere(filters);
  const total = (await one(`select count(*)::int n from public.seo_virji_conversations c ${clause}`, params)).n;
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await many(`${LIST_SELECT} ${clause} order by c.last_message_at desc limit $${params.length - 1} offset $${params.length}`, params);
  return { items: rows.map(serializeConversation), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function conversationCounts() {
  return one(`select
     count(*)::int as all,
     count(*) filter (where ${STATUS_FILTER.new})::int as new,
     count(*) filter (where ${STATUS_FILTER.qualified})::int as qualified,
     count(*) filter (where ${STATUS_FILTER.handoff})::int as handoff,
     count(*) filter (where ${STATUS_FILTER.active})::int as active,
     count(*) filter (where ${STATUS_FILTER.resolved})::int as resolved
   from public.seo_virji_conversations c where c.message_count > 1`);
}

export async function getConversationDetail(uuid) {
  const c = await one(`${LIST_SELECT} where c.conversation_uuid = $1`, [uuid]);
  if (!c) throw notFound('Conversation not found');
  const messages = await many(
    `select id, role, content, created_at, metadata from public.seo_virji_messages where conversation_id = $1 and role in ('user','assistant') order by created_at, id`,
    [c.id],
  );
  const memory = await one('select memory_summary, important_facts, business_context from public.seo_virji_conversation_memories where conversation_id = $1', [c.id]);
  const lead = c.lead_id ? await one('select l.*, $2::uuid as conversation_uuid from public.seo_virji_leads l where l.id = $1', [c.lead_id, c.conversation_uuid]) : null;
  const handoffs = await many(
    'select id, whatsapp_number, generated_message, handoff_status, created_at from public.seo_virji_whatsapp_handoffs where conversation_id = $1 order by created_at',
    [c.id],
  );
  return {
    conversation: {
      ...serializeConversation(c),
      summary: memory?.memory_summary || c.summary || '',
      facts: memory?.important_facts || {},
      requirements: memory?.business_context?.requirements || [],
      handoffs: handoffs.map((h) => ({ id: h.id, number: h.whatsapp_number, message: h.generated_message, status: h.handoff_status, createdAt: h.created_at })),
      messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at, sources: m.metadata?.sources || [] })),
    },
    lead: lead ? serializeLead(lead) : null,
  };
}

/** resolve → 'resolved', reopen → 'active' (or back to 'transferred' if it was handed off), archive → 'archived'. */
export async function setConversationStatus(uuid, status) {
  const row = await one(
    `update public.seo_virji_conversations set
       status = case when $2 = 'active' and whatsapp_handoff_at is not null then 'transferred' else $2 end,
       resolved_at = case when $2 in ('resolved','archived') then now() else null end
     where conversation_uuid = $1 returning conversation_uuid`,
    [uuid, status],
  );
  if (!row) throw notFound('Conversation not found');
  return getConversationDetail(uuid);
}

/**
 * Deletes a conversation. Messages, memory, feedback and handoff records cascade; the lead
 * (a business record) is kept but unlinked (ON DELETE SET NULL); usage logs are unlinked.
 */
export async function deleteConversation(uuid) {
  const { rowCount } = await query('delete from public.seo_virji_conversations where conversation_uuid = $1', [uuid]);
  if (!rowCount) throw notFound('Conversation not found');
}

/** Rows for CSV export (respects the same filters as the list). */
export async function exportConversations({ include = 'summary', ...filters } = {}) {
  const { clause, params } = conversationWhere(filters);
  const rows = await many(`${LIST_SELECT} ${clause} order by c.last_message_at desc limit 5000`, params);
  if (include !== 'messages') {
    return rows.map((c) => {
      const s = serializeConversation(c);
      return {
        reference: s.reference, conversation_id: s.id, started_at: s.startedAt, last_message_at: s.lastMessageAt, status: s.status,
        lead_status: s.leadStatus, visitor_name: s.visitorName || '', topic: s.topic, first_message: s.preview, summary: s.summary,
        messages: s.messageCount, whatsapp_handoff_at: s.handoffAt || '', source_page: s.sourcePage || '',
      };
    });
  }
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const messages = await many(
    `select m.conversation_id, m.role, m.content, m.created_at from public.seo_virji_messages m
     where m.conversation_id = any($1::uuid[]) and m.role in ('user','assistant') order by m.conversation_id, m.created_at, m.id`,
    [ids],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return messages.map((m) => ({
    reference: referenceCode(byId.get(m.conversation_id).conversation_uuid),
    conversation_id: byId.get(m.conversation_id).conversation_uuid,
    sent_at: m.created_at,
    role: m.role === 'user' ? 'visitor' : 'assistant',
    message: m.content,
  }));
}

/* ------------------------------------------------------------ analytics */

const pct = (a, b) => (b ? Number((((a - b) / b) * 100).toFixed(1)) : a ? 100 : 0);

async function series(table, column, where = 'true') {
  const rows = await many(
    `select d::date as day, (select count(*)::int from public.${table} t where ${where} and t.${column} >= d and t.${column} < d + interval '1 day') as n
     from generate_series(current_date - 6, current_date, interval '1 day') d order by d`,
  );
  return rows.map((r) => r.n);
}

export async function overviewStats() {
  const real = `message_count > 1`;
  const r = await one(`select
      (select count(*)::int from public.seo_virji_conversations where ${real}) conversations,
      (select count(distinct visitor_id)::int from public.seo_virji_conversations) visitors,
      (select count(distinct visitor_id)::int from public.seo_virji_conversations where created_at >= now() - interval '30 days') visitors_30,
      (select count(distinct visitor_id)::int from public.seo_virji_conversations where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days') visitors_prev,
      (select count(*)::int from public.seo_virji_conversations where ${real} and created_at >= now() - interval '30 days') conv_30,
      (select count(*)::int from public.seo_virji_conversations where ${real} and created_at >= now() - interval '60 days' and created_at < now() - interval '30 days') conv_prev,
      (select count(*)::int from public.seo_virji_leads) leads,
      (select count(*)::int from public.seo_virji_leads where created_at >= now() - interval '30 days') leads_30,
      (select count(*)::int from public.seo_virji_leads where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days') leads_prev,
      (select count(*)::int from public.seo_virji_whatsapp_handoffs) handoffs,
      (select count(*)::int from public.seo_virji_whatsapp_handoffs where created_at >= now() - interval '30 days') handoffs_30,
      (select count(*)::int from public.seo_virji_whatsapp_handoffs where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days') handoffs_prev,
      (select count(*)::int from public.seo_virji_conversations) started,
      (select count(*)::int from public.seo_virji_conversations c where (select count(*) from public.seo_virji_messages m where m.conversation_id = c.id and m.role = 'user') >= 2) engaged,
      (select count(*)::int from public.seo_virji_conversations where created_at >= now() - interval '30 days') started_30,
      (select count(*)::int from public.seo_virji_conversations c where created_at >= now() - interval '30 days' and (select count(*) from public.seo_virji_messages m where m.conversation_id = c.id and m.role = 'user') >= 2) engaged_30`);

  const engagement = r.started ? Math.round((r.engaged / r.started) * 100) : 0;
  const engagement30 = r.started_30 ? Math.round((r.engaged_30 / r.started_30) * 100) : 0;
  const visitorTrend = (
    await many(
      `select d::date as day, (select count(distinct visitor_id)::int from public.seo_virji_conversations t where t.created_at >= d and t.created_at < d + interval '1 day') as n
       from generate_series(current_date - 6, current_date, interval '1 day') d order by d`,
    )
  ).map((x) => x.n);
  return {
    totalVisitors: { value: r.visitors, change: pct(r.visitors_30, r.visitors_prev), trend: visitorTrend, definition: 'Unique browsers that opened a chat' },
    totalConversations: { value: r.conversations, change: pct(r.conv_30, r.conv_prev), trend: await series('seo_virji_conversations', 'created_at', real) },
    totalLeads: { value: r.leads, change: pct(r.leads_30, r.leads_prev), trend: await series('seo_virji_leads', 'created_at') },
    handoffs: { value: r.handoffs, change: pct(r.handoffs_30, r.handoffs_prev), trend: await series('seo_virji_whatsapp_handoffs', 'created_at') },
    engagement: { value: engagement, suffix: '%', change: Number((engagement30 - engagement).toFixed(1)), trend: [], definition: 'Conversations where the visitor sent at least two messages' },
  };
}

export async function usageStats({ days = 30 } = {}) {
  const totals = await one(
    `select count(*)::int requests, coalesce(sum(input_tokens),0)::int input_tokens, coalesce(sum(output_tokens),0)::int output_tokens,
       sum(estimated_cost)::float estimated_cost, count(*) filter (where request_status = 'error')::int errors
     from public.seo_virji_usage_logs where created_at >= now() - make_interval(days => $1)`,
    [days],
  );
  const byModel = await many(
    `select model, operation, count(*)::int requests, sum(input_tokens)::int input_tokens, sum(output_tokens)::int output_tokens
     from public.seo_virji_usage_logs where created_at >= now() - make_interval(days => $1) group by model, operation order by requests desc`,
    [days],
  );
  return { days, ...totals, byModel, costNote: totals.estimated_cost == null ? 'Set OPENAI_PRICE_* variables to estimate cost.' : null };
}

export async function handoffStats() {
  const rows = await many(
    `select h.id, h.created_at, h.handoff_status, l.visitor_name, l.business_name, c.conversation_uuid
     from public.seo_virji_whatsapp_handoffs h
     left join public.seo_virji_leads l on l.id = h.lead_id
     join public.seo_virji_conversations c on c.id = h.conversation_id
     order by h.created_at desc limit 50`,
  );
  const totals = await one(
    `select count(*)::int total, count(*) filter (where handoff_status = 'opened')::int opened from public.seo_virji_whatsapp_handoffs`,
  );
  return {
    total: totals.total,
    linkGenerated: totals.total,
    whatsappOpened: totals.opened,
    note: 'A WhatsApp link was generated / opened by the visitor. Whether the message was actually sent cannot be verified without the WhatsApp Business API.',
    recent: rows,
  };
}

export async function audit(adminId, action, resourceType, resourceId, metadata = {}) {
  await query('insert into public.seo_virji_audit_logs (admin_user_id, action, resource_type, resource_id, metadata) values ($1,$2,$3,$4,$5)', [
    adminId || null, action, resourceType, resourceId ? String(resourceId) : null, metadata,
  ]).catch(() => {});
}
