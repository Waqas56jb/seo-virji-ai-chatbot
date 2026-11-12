import { many, one } from '../config/supabase.js';
import { ok } from '../utils/response.js';
import { conversationCounts, handoffStats, listConversations, overviewStats, usageStats } from '../services/admin.service.js';
import { leadStats, listLeads } from '../services/leads/lead.service.js';
import { getSettings, whatsappNumber } from '../services/settings.service.js';
import { knowledgeStatus } from '../services/knowledge/knowledge.service.js';
import { nextScheduledRun, serializeJob } from '../services/crawler/crawler.service.js';
import { env } from '../config/env.js';

/** Everything the Overview page needs, from real Supabase data. */
export const overview = async (req, res) => {
  const [stats, counts, conversations, leads, settings, number, knowledge, latestJob] = await Promise.all([
    overviewStats(),
    conversationCounts(),
    listConversations({ pageSize: 5 }),
    listLeads({ pageSize: 5 }),
    getSettings(),
    whatsappNumber(),
    knowledgeStatus(),
    one('select * from public.seo_virji_website_crawl_jobs order by created_at desc limit 1'),
  ]);
  ok(res, {
    stats,
    conversationCounts: counts,
    recentConversations: conversations.items,
    recentLeads: leads.items,
    knowledge,
    crawl: {
      latest: serializeJob(latestJob),
      lastSuccessfulSyncAt: knowledge.lastSuccessfulSyncAt,
      nextScheduledAt: env.CRAWLER_SCHEDULE_ENABLED ? nextScheduledRun() : null,
    },
    status: {
      enabled: settings.chatbot_enabled !== false,
      online: settings.is_online,
      domain: settings.website_url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      aiConfigured: env.openaiConfigured,
      model: settings.ai_model,
      whatsappEnabled: settings.whatsapp_enabled && Boolean(number),
      knowledgeItems: knowledge.website_pages + knowledge.manual_sources + knowledge.faqs,
      knowledgeChunks: knowledge.chunks,
      knowledgeEmbedded: knowledge.embedded,
      lastSyncAt: knowledge.lastSuccessfulSyncAt,
    },
  });
};

export const conversations = async (req, res) => {
  const daily = await many(
    `select d::date as day, (select count(*)::int from public.seo_virji_conversations c where c.message_count > 1 and c.created_at >= d and c.created_at < d + interval '1 day') as count
     from generate_series(current_date - 29, current_date, interval '1 day') d order by d`,
  );
  ok(res, { counts: await conversationCounts(), daily });
};

export const leads = async (req, res) => ok(res, await leadStats());
export const handoffs = async (req, res) => ok(res, await handoffStats());
export const usage = async (req, res) => ok(res, await usageStats({ days: Math.min(365, Number(req.query.days) || 30) }));
