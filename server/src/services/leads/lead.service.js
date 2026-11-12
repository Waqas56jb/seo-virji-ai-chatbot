/** Lead persistence (one lead per conversation) and admin queries. */
import { many, one, query } from '../../config/supabase.js';
import { nextStatus, scoreLead, shouldCreateLead, statusFor } from './lead-qualification.service.js';
import { notFound } from '../../utils/errors.js';

/** Creates or updates the lead for a conversation from the current facts. Returns the lead or null. */
export async function syncLeadFromConversation(conversationId, facts, { interest = 'none', requirements = [], summary = null } = {}, client) {
  const db = client || { query };
  const existing = (await db.query('select * from public.seo_virji_leads where conversation_id = $1', [conversationId])).rows[0];
  if (!existing && !shouldCreateLead(facts, interest)) return null;

  const score = Math.max(existing?.qualification_score || 0, scoreLead(facts, interest));
  const status = nextStatus(existing?.lead_status, statusFor(score, facts, interest));
  const reqs = JSON.stringify([...new Set([...(existing?.requirements || []), ...requirements])].slice(0, 12));

  const values = [
    conversationId, facts.name || null, facts.email || null, facts.phone || null, facts.business_name || null,
    facts.website || null, facts.industry || null, facts.challenge || null, facts.seo_situation || null,
    facts.goal || null, facts.budget || null, facts.contact_method || null, reqs, score, status, summary,
  ];

  const { rows } = await db.query(
    `insert into public.seo_virji_leads (conversation_id, visitor_name, email, phone, business_name, website_url, industry,
       business_challenge, seo_situation, seo_goals, budget_range, contact_method, requirements, qualification_score, lead_status, summary)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)
     on conflict (conversation_id) do update set
       visitor_name = coalesce(excluded.visitor_name, seo_virji_leads.visitor_name),
       email = coalesce(excluded.email, seo_virji_leads.email),
       phone = coalesce(excluded.phone, seo_virji_leads.phone),
       business_name = coalesce(excluded.business_name, seo_virji_leads.business_name),
       website_url = coalesce(excluded.website_url, seo_virji_leads.website_url),
       industry = coalesce(excluded.industry, seo_virji_leads.industry),
       business_challenge = coalesce(excluded.business_challenge, seo_virji_leads.business_challenge),
       seo_situation = coalesce(excluded.seo_situation, seo_virji_leads.seo_situation),
       seo_goals = coalesce(excluded.seo_goals, seo_virji_leads.seo_goals),
       budget_range = coalesce(excluded.budget_range, seo_virji_leads.budget_range),
       contact_method = coalesce(excluded.contact_method, seo_virji_leads.contact_method),
       requirements = excluded.requirements,
       qualification_score = excluded.qualification_score,
       lead_status = excluded.lead_status,
       summary = coalesce(excluded.summary, seo_virji_leads.summary)
     returning *`,
    values,
  );
  const lead = rows[0];
  await db.query(
    `update public.seo_virji_conversations set lead_status = $2,
       visitor_name = coalesce($3, visitor_name), visitor_email = coalesce($4, visitor_email), visitor_phone = coalesce($5, visitor_phone)
     where id = $1`,
    [conversationId, lead.lead_status, facts.name || null, facts.email || null, facts.phone || null],
  );
  return lead;
}

/* ------------------------------------------------------------------ admin */

export function serializeLead(l) {
  return {
    id: l.id,
    conversationId: l.conversation_uuid || null,
    name: l.visitor_name || 'Unnamed visitor',
    businessName: l.business_name || '',
    website: l.website_url ? l.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '') : '',
    industry: l.industry || '',
    challenge: l.business_challenge || '',
    seoSituation: l.seo_situation || '',
    goal: l.seo_goals || '',
    budget: l.budget_range || '',
    contactMethod: l.contact_method || '',
    email: l.email || '',
    phone: l.phone || '',
    status: l.lead_status,
    score: l.qualification_score,
    notes: l.notes || '',
    summary: l.summary || '',
    requirements: Array.isArray(l.requirements) ? l.requirements : [],
    whatsappHandoffAt: l.whatsapp_handoff_at,
    handoffStatus: l.handoff_status || (l.whatsapp_handoff_at ? 'link_generated' : null),
    reference: l.conversation_uuid ? String(l.conversation_uuid).split('-')[0].toUpperCase() : null,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

const SELECT = `select l.*, c.conversation_uuid,
  (select h.handoff_status from public.seo_virji_whatsapp_handoffs h where h.lead_id = l.id order by h.created_at desc limit 1) as handoff_status
  from public.seo_virji_leads l
  left join public.seo_virji_conversations c on c.id = l.conversation_id`;

function leadWhere({ status, search, handoff, from, to } = {}) {
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    params.push(status);
    where.push(`l.lead_status = $${params.length}`);
  }
  if (handoff === 'yes') where.push('l.whatsapp_handoff_at is not null');
  if (handoff === 'no') where.push('l.whatsapp_handoff_at is null');
  if (from) {
    params.push(from);
    where.push(`l.created_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    where.push(`l.created_at < ($${params.length}::date + interval '1 day')`);
  }
  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    const p = `$${params.length}`;
    where.push(`(l.visitor_name ilike ${p} or l.business_name ilike ${p} or l.website_url ilike ${p} or l.business_challenge ilike ${p}
      or l.email ilike ${p} or l.phone ilike ${p} or l.industry ilike ${p} or l.notes ilike ${p} or l.summary ilike ${p})`);
  }
  return { clause: where.length ? `where ${where.join(' and ')}` : '', params };
}

export async function listLeads({ page = 1, pageSize = 50, ...filters } = {}) {
  const { clause, params } = leadWhere(filters);
  const total = (await one(`select count(*)::int n from public.seo_virji_leads l ${clause}`, params)).n;
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await many(`${SELECT} ${clause} order by l.created_at desc limit $${params.length - 1} offset $${params.length}`, params);
  return { items: rows.map(serializeLead), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Flat rows for CSV export (same filters as the list). */
export async function exportLeads(filters = {}) {
  const { clause, params } = leadWhere(filters);
  const rows = await many(`${SELECT} ${clause} order by l.created_at desc limit 10000`, params);
  return rows.map((r) => {
    const l = serializeLead(r);
    return {
      created_at: l.createdAt, status: l.status, score: l.score, name: l.name, business: l.businessName, website: l.website,
      industry: l.industry, email: l.email, phone: l.phone, challenge: l.challenge, goal: l.goal, seo_situation: l.seoSituation,
      budget: l.budget, contact_method: l.contactMethod, requirements: l.requirements.join('; '), summary: l.summary, notes: l.notes,
      whatsapp_handoff_at: l.whatsappHandoffAt || '', whatsapp_status: l.handoffStatus || '', conversation_id: l.conversationId || '',
    };
  });
}

export async function getLead(id) {
  const row = await one(`${SELECT} where l.id = $1`, [id]);
  if (!row) throw notFound('Lead not found');
  return serializeLead(row);
}

export async function createLead(input) {
  const row = await one(
    `insert into public.seo_virji_leads (visitor_name, email, phone, business_name, website_url, industry, business_challenge, seo_goals, budget_range, lead_status, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [input.name, input.email || null, input.phone || null, input.businessName || null, input.website || null, input.industry || null,
      input.challenge || null, input.goal || null, input.budget || null, input.status || 'new', input.notes || null],
  );
  return serializeLead(row);
}

const PATCHABLE = {
  status: 'lead_status', notes: 'notes', name: 'visitor_name', email: 'email', phone: 'phone',
  businessName: 'business_name', website: 'website_url', industry: 'industry', challenge: 'business_challenge',
  goal: 'seo_goals', budget: 'budget_range',
};

export async function updateLead(id, patch) {
  const keys = Object.keys(patch).filter((k) => PATCHABLE[k] !== undefined);
  if (!keys.length) return getLead(id);
  const sets = keys.map((k, i) => `${PATCHABLE[k]} = $${i + 2}`).join(', ');
  const row = await one(`update public.seo_virji_leads set ${sets} where id = $1 returning id`, [id, ...keys.map((k) => patch[k])]);
  if (!row) throw notFound('Lead not found');
  if (patch.status) await query('update public.seo_virji_conversations c set lead_status = $2 from public.seo_virji_leads l where l.id = $1 and c.id = l.conversation_id', [id, patch.status]);
  return getLead(id);
}

export async function deleteLead(id) {
  const { rowCount } = await query('delete from public.seo_virji_leads where id = $1', [id]);
  if (!rowCount) throw notFound('Lead not found');
}

export async function leadStats() {
  const rows = await many('select lead_status, count(*)::int n from public.seo_virji_leads group by lead_status');
  const byStatus = Object.fromEntries(rows.map((r) => [r.lead_status, r.n]));
  return { total: rows.reduce((s, r) => s + r.n, 0), byStatus };
}
