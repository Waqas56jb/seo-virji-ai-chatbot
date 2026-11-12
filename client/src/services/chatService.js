/**
 * Chat service — the ONLY module the widget uses to talk to the backend.
 * The widget never talks to OpenAI or Supabase directly; it calls the SEO Virji API:
 *
 *   GET  /api/chat/config                     public chatbot settings (from the admin panel)
 *   POST /api/chat/start                      start or resume a conversation
 *   POST /api/chat/message                    send a visitor message → AI reply
 *   POST /api/chat/:id/reset                  close this conversation and start a new one
 *   POST /api/chat/:id/handoff                record the WhatsApp handoff and get the wa.me link
 *
 * Every conversation call carries the visitor's session token (X-Chat-Session).
 */
let apiBase = '';

export function configureApi({ apiBaseUrl } = {}) {
  apiBase = String(apiBaseUrl || '').replace(/\/$/, '');
}

export class ChatServiceError extends Error {
  constructor(message, code = 'UNKNOWN', status = 0) {
    super(message);
    this.name = 'ChatServiceError';
    this.code = code;
    this.status = status;
  }
}

const FRIENDLY = {
  OFFLINE: 'You appear to be offline. Check your connection and try again.',
  TIMEOUT: 'This is taking longer than usual. Please try again.',
  NETWORK: "We couldn't reach the SEO Virji assistant. Please try again in a moment.",
  RATE_LIMITED: "You're sending messages a little too quickly. Please wait a moment and try again.",
  SESSION_INVALID: 'This conversation has expired. Please start a new one.',
  SESSION_EXPIRED: 'This conversation has expired. Please start a new one.',
  MESSAGE_IN_PROGRESS: 'Still working on the previous reply — one moment.',
  CHATBOT_DISABLED: 'The assistant is currently unavailable. Please use the contact details on our website.',
  WHATSAPP_NOT_CONFIGURED: 'WhatsApp is not available right now. Please use the contact details on our website.',
  AI: "I'm having trouble thinking right now. Please try again in a moment.",
};

function friendly(code, fallback) {
  if (code?.startsWith('AI_')) return FRIENDLY.AI;
  return FRIENDLY[code] || fallback || FRIENDLY.NETWORK;
}

async function request(path, { method = 'GET', body, sessionToken, timeout = 45_000 } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ChatServiceError(FRIENDLY.OFFLINE, 'OFFLINE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(sessionToken ? { 'X-Chat-Session': sessionToken } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw err.name === 'AbortError' ? new ChatServiceError(FRIENDLY.TIMEOUT, 'TIMEOUT') : new ChatServiceError(FRIENDLY.NETWORK, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || !json?.success) {
    const code = json?.error?.code || `HTTP_${res.status}`;
    throw new ChatServiceError(friendly(code, json?.error?.message), code, res.status);
  }
  return json.data;
}

export const fetchBotConfig = () => request('/api/chat/config', { timeout: 10_000 });

export const startConversation = ({ visitorId, resume, resumeOnly, pageUrl }) =>
  request('/api/chat/start', { method: 'POST', body: { visitorId, resume, resumeOnly, pageUrl, source: 'widget' }, timeout: 20_000 });

export const sendMessage = ({ conversationId, visitorId, sessionToken, text, clientMessageId }) =>
  request('/api/chat/message', { method: 'POST', sessionToken, body: { conversationId, visitorId, message: text, clientMessageId } });

export const resetConversation = ({ conversationId, visitorId, sessionToken }) =>
  request(`/api/chat/${conversationId}/reset`, { method: 'POST', sessionToken, body: { visitorId }, timeout: 20_000 });

export const requestHandoff = ({ conversationId, visitorId, sessionToken, name }) =>
  request(`/api/chat/${conversationId}/handoff`, { method: 'POST', sessionToken, body: { visitorId, ...(name ? { name } : {}) }, timeout: 20_000 });

/** Tells the server the visitor's browser opened WhatsApp (best effort — never blocks the visitor). */
export const markHandoffOpened = ({ conversationId, visitorId, sessionToken, handoffId }) =>
  request(`/api/chat/${conversationId}/handoff/${handoffId}/opened`, { method: 'POST', sessionToken, body: { visitorId }, timeout: 10_000 }).catch(() => null);

export const isSessionError = (err) => err?.code === 'SESSION_INVALID' || err?.code === 'SESSION_EXPIRED';
