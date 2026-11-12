/**
 * Records a WhatsApp handoff BEFORE the visitor is redirected.
 * A wa.me link only pre-fills a message the visitor reviews and sends themselves — so the
 * record is "link_generated", never "delivered".
 */
import { one, transaction } from '../../config/supabase.js';
import { getSettings, whatsappNumber } from '../settings.service.js';
import { getMemory, mergeFacts, saveFacts } from '../ai/memory.service.js';
import { syncLeadFromConversation } from '../leads/lead.service.js';
import { buildHandoffMessage, buildWhatsAppUrl } from './whatsapp.service.js';
import { notFound, unavailable } from '../../utils/errors.js';

export async function createHandoff(conversation, { name } = {}) {
  const settings = await getSettings();
  const number = await whatsappNumber();
  if (!settings.whatsapp_enabled || !number) throw unavailable('WhatsApp handoff is not configured yet.', 'WHATSAPP_NOT_CONFIGURED');

  const memory = await getMemory(conversation.id);
  const facts = mergeFacts(memory.important_facts, name ? { name } : {});
  if (name) await saveFacts(conversation.id, conversation.visitor_id, facts, memory.business_context?.requirements);

  const firstQuestion = await one(
    `select content from public.seo_virji_messages where conversation_id = $1 and role = 'user' order by created_at limit 1`,
    [conversation.id],
  );
  const message = buildHandoffMessage({
    intro: settings.whatsapp_welcome_message,
    facts,
    question: firstQuestion?.content,
    requirements: memory.business_context?.requirements || [],
    summary: memory.memory_summary || conversation.summary,
    reference: conversation.conversation_uuid,
  });
  const url = buildWhatsAppUrl(number, message);
  if (!url) throw unavailable('WhatsApp handoff is not configured correctly.', 'WHATSAPP_NOT_CONFIGURED');

  const handoff = await transaction(async (client) => {
    // A visitor asking to talk to the team is a real lead even if few details were shared.
    let lead = await syncLeadFromConversation(conversation.id, { ...facts, challenge: facts.challenge || conversation.topic || 'Wants to talk to the team' }, { interest: 'ready', summary: memory.memory_summary || null }, client);
    lead = (
      await client.query(
        `update public.seo_virji_leads set whatsapp_handoff_at = now(),
           lead_status = case when lead_status in ('new','interested') then 'qualified' else lead_status end
         where id = $1 returning *`,
        [lead.id],
      )
    ).rows[0];
    await client.query(
      `update public.seo_virji_conversations set status = 'transferred', whatsapp_handoff_at = now(), lead_status = $2 where id = $1`,
      [conversation.id, lead.lead_status],
    );
    return (
      await client.query(
        `insert into public.seo_virji_whatsapp_handoffs (conversation_id, lead_id, whatsapp_number, generated_message, handoff_status)
         values ($1,$2,$3,$4,'link_generated') returning id, created_at`,
        [conversation.id, lead.id, number, message],
      )
    ).rows[0];
  });

  return { handoffId: handoff.id, url, message, createdAt: handoff.created_at };
}

/** Marks a handoff as "opened" (the visitor's browser opened WhatsApp). Never claims delivery. */
export async function markHandoffOpened(conversation, handoffId) {
  const row = await one(
    `update public.seo_virji_whatsapp_handoffs set handoff_status = 'opened' where id = $1 and conversation_id = $2 returning id, handoff_status`,
    [handoffId, conversation.id],
  );
  if (!row) throw notFound('Handoff not found');
  return { handoffId: row.id, status: row.handoff_status };
}
