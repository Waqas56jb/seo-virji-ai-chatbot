import { api, qs } from './apiClient.js';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/conversations?status&search&from&to&page&pageSize
 * → { items, total, page, pageSize, pages, counts }
 */
export const listConversations = ({ status = 'all', search = '', from, to, page = 1, pageSize = 30 } = {}) =>
  api.get(`/api/conversations${qs({ status, search, from, to, page, pageSize })}`);

/** GET /api/conversations/:id → { conversation (messages, handoffs, summary, facts), lead } */
export const getConversation = (id) => api.get(`/api/conversations/${id}`);

/** status: 'resolved' | 'active' (reopen) | 'archived'. Returns the updated detail. */
export const setConversationStatus = (id, status) => api.patch(`/api/conversations/${id}/status`, { status });

export const deleteConversation = (id) => api.delete(`/api/conversations/${id}`);

/** include: 'summary' (one row per conversation) | 'messages' (one row per message). */
export const exportConversations = ({ status, search, from, to, include = 'summary' } = {}) =>
  api.download(`/api/conversations/export${qs({ status, search, from, to, include })}`, `seo-virji-conversations-${include}-${today()}.csv`);
