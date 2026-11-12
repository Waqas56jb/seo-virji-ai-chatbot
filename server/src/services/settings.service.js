/** Chatbot settings (single active row) with a short in-memory cache. */

/** Chat models the admin may choose (all support strict JSON-schema output). */
export const AI_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4.1'];
import { env } from '../config/env.js';
import { one } from '../config/supabase.js';

let cache = null;
let cachedAt = 0;
const TTL = process.env.VERCEL ? 5_000 : 15_000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL) return cache;
  const row = await one('select * from public.seo_virji_chatbot_settings where is_active order by created_at limit 1');
  cache = row;
  cachedAt = Date.now();
  return row;
}

export function invalidateSettings() {
  cache = null;
}

export async function whatsappNumber() {
  const s = await getSettings();
  return String(s?.whatsapp_number || env.SEO_VIRJI_WHATSAPP_NUMBER || '').replace(/\D/g, '');
}

/** Settings in the shape the admin UI uses. Contains no secrets. */
export function toAdminShape(s) {
  return {
    general: {
      chatbotName: s.bot_name,
      businessName: s.business_name,
      enabled: s.chatbot_enabled,
      description: s.assistant_description,
      welcomeMessage: s.welcome_message,
      domain: (s.website_url || '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
      online: s.is_online,
    },
    personality: {
      tone: s.personality_tone,
      style: s.response_style,
      behaviours: s.behaviours,
      instructions: s.additional_instructions,
      systemInstructions: s.system_instructions,
    },
    ai: {
      model: s.ai_model,
      models: AI_MODELS,
      temperature: Number(s.temperature),
      maxOutputTokens: s.max_output_tokens,
      topK: s.rag_top_k,
      minSimilarity: Number(s.rag_min_similarity),
      memoryLimit: s.memory_message_limit,
      configured: env.openaiConfigured,
    },
    whatsapp: {
      enabled: s.whatsapp_enabled,
      number: s.whatsapp_number,
      welcomeMessage: s.whatsapp_welcome_message,
      buttonLabel: s.whatsapp_button_label,
    },
    appearance: {
      primaryColor: s.primary_color,
      accentColor: s.secondary_color,
      position: s.launcher_position,
      title: s.chatbot_title,
      logo: s.logo_url,
    },
    updatedAt: s.updated_at,
  };
}

const COLUMN_MAP = {
  general: { chatbotName: 'bot_name', businessName: 'business_name', enabled: 'chatbot_enabled', description: 'assistant_description', welcomeMessage: 'welcome_message', online: 'is_online', domain: 'website_url' },
  ai: { model: 'ai_model', temperature: 'temperature', maxOutputTokens: 'max_output_tokens', topK: 'rag_top_k', minSimilarity: 'rag_min_similarity', memoryLimit: 'memory_message_limit' },
  personality: { tone: 'personality_tone', style: 'response_style', behaviours: 'behaviours', instructions: 'additional_instructions', systemInstructions: 'system_instructions' },
  whatsapp: { enabled: 'whatsapp_enabled', number: 'whatsapp_number', welcomeMessage: 'whatsapp_welcome_message', buttonLabel: 'whatsapp_button_label' },
  appearance: { primaryColor: 'primary_color', accentColor: 'secondary_color', position: 'launcher_position', title: 'chatbot_title', logo: 'logo_url' },
};

/** Applies a partial { general?, personality?, whatsapp?, appearance? } patch. */
export async function updateSettings(patch) {
  const current = await getSettings({ fresh: true });
  const sets = [];
  const values = [current.id];
  for (const [group, fields] of Object.entries(patch)) {
    for (const [key, value] of Object.entries(fields || {})) {
      const column = COLUMN_MAP[group]?.[key];
      if (!column) continue;
      let v = value;
      if (column === 'website_url') v = `https://${String(value).replace(/^https?:\/\//, '').replace(/\/$/, '')}/`;
      if (column === 'behaviours') v = { ...current.behaviours, ...value };
      values.push(v);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length) await one(`update public.seo_virji_chatbot_settings set ${sets.join(', ')} where id = $1 returning id`, values);
  invalidateSettings();
  return toAdminShape(await getSettings({ fresh: true }));
}

/** Public, non-sensitive configuration for the widget. */
export async function publicConfig() {
  const s = await getSettings();
  const number = await whatsappNumber();
  return {
    enabled: s.chatbot_enabled !== false,
    botName: s.chatbot_title || s.bot_name,
    assistantName: s.bot_name,
    assistantTagline: s.assistant_description,
    businessName: s.business_name,
    welcomeMessage: s.welcome_message,
    primaryColor: s.primary_color,
    accentColor: s.secondary_color,
    position: s.launcher_position,
    logoUrl: s.logo_url,
    online: s.is_online,
    whatsappEnabled: s.whatsapp_enabled && Boolean(number),
    whatsappLabel: s.whatsapp_button_label,
    maxMessageLength: env.MAX_MESSAGE_LENGTH,
  };
}
