import { api, qs } from './apiClient.js';

/**
 * Knowledge base (Supabase + embeddings). Every content change is re-chunked and re-embedded
 * on the server so the AI consultant uses it in the next conversation.
 */

/** GET /api/knowledge → { sources, status } (every active record; used by the page sections). */
export const listKnowledge = () => api.get('/api/knowledge');

/**
 * Paged knowledge records browser.
 * GET /api/knowledge?type&status&embedding&search&page&pageSize → { items, total, page, pageSize, sources, status }
 */
export function listKnowledgeRecords({ type, status = 'all', embedding, search, page = 1, pageSize = 20 } = {}) {
  // `qs()` drops 'all', but the API defaults to active-only, so status is always sent explicitly.
  const query = qs({ type, embedding, search, page, pageSize });
  const statusParam = `status=${encodeURIComponent(status || 'all')}`;
  return api.get(`/api/knowledge${query ? `${query}&${statusParam}` : `?${statusParam}`}`);
}

/** GET /api/knowledge/:id → source with full content + chunks. */
export const getKnowledge = (id) => api.get(`/api/knowledge/${id}`);

export const createKnowledge = ({ title, content }) => api.post('/api/knowledge', { title, content });
export const updateKnowledge = (id, patch) => api.patch(`/api/knowledge/${id}`, patch);
export const setKnowledgeStatus = (id, status) => api.patch(`/api/knowledge/${id}/status`, { status });
export const reprocessKnowledge = (id) => api.post(`/api/knowledge/${id}/reprocess`);
export const recrawlKnowledge = (id, { discardEdits = false } = {}) => api.post(`/api/knowledge/${id}/recrawl`, { discardEdits });
export const deleteKnowledge = (id) => api.delete(`/api/knowledge/${id}`);
export const reindexKnowledge = (full = false) => api.post('/api/knowledge/reindex', { full });
/** → { sources, embedded, stillFailing } */
export const retryFailedEmbeddings = () => api.post('/api/knowledge/retry-embeddings');

export const listFaqs = () => api.get('/api/knowledge/faq');
export const createFaq = ({ question, answer }) => api.post('/api/knowledge/faq', { question, answer });
export const updateFaq = (id, { question, answer }) => api.patch(`/api/knowledge/faq/${id}`, { question, answer });
export const deleteFaq = (id) => api.delete(`/api/knowledge/faq/${id}`);

/* Website crawler */
/** → { latest, lastFullSync, lastSuccessfulSync, failedUrls, knowledge, websiteUrl, allowedHosts, schedule } */
export const getCrawlStatus = () => api.get('/api/crawler/status');
export const listCrawlJobs = (limit = 20) => api.get(`/api/crawler/jobs?limit=${limit}`);
/** Crawl log: job + pages[]. */
export const getCrawlJob = (id) => api.get(`/api/crawler/jobs/${id}`);
/** "Sync Website Now": incremental sync of the whole site. */
export const syncWebsite = () => api.post('/api/crawler/start', {});
/** "Full Website Re-Crawl": re-reads every page; pages that disappeared are removed. */
export const fullRecrawl = () => api.post('/api/crawler/recrawl');
/** Re-tries the pages that failed in the last website sync (400 if there are none). */
export const retryFailedPages = () => api.post('/api/crawler/retry-failed');
/** Single page ({ url, singlePage: true }) or a sync with an explicit body. */
export const startCrawl = (body = {}) => api.post('/api/crawler/start', body);
export const cancelCrawl = (id) => api.post(`/api/crawler/cancel/${id}`);
