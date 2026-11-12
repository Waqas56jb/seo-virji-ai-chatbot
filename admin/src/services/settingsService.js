import { api } from './apiClient.js';

/** GET /api/settings → { general, personality, ai, whatsapp, appearance, updatedAt } */
export const getSettings = () => api.get('/api/settings');

/** PATCH /api/settings — saves all editable groups to Supabase and returns the stored settings. */
export async function saveSettings(settings) {
  const { general, personality, whatsapp, appearance, ai } = settings;
  const body = { general, personality, whatsapp, appearance };
  if (ai) {
    // `models` and `configured` are read-only information from the server.
    const { model, temperature, maxOutputTokens, topK, minSimilarity, memoryLimit } = ai;
    body.ai = { model, temperature, maxOutputTokens, topK, minSimilarity, memoryLimit };
  }
  return api.patch('/api/settings', body);
}
