import { api, qs } from './apiClient.js';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * GET /api/leads?status&search&handoff&from&to&page&pageSize
 * → { items, total, page, pageSize, pages, stats: { total, byStatus } }
 */
export const listLeads = ({ status, search, handoff, from, to, page = 1, pageSize = 25 } = {}) =>
  api.get(`/api/leads${qs({ status, search, handoff, from, to, page, pageSize })}`);

export const getLead = (id) => api.get(`/api/leads/${id}`);

export const updateLead = (id, patch) => api.patch(`/api/leads/${id}`, patch);

export const updateLeadStatus = (id, status) => updateLead(id, { status });

export const saveLeadNotes = (id, notes) => updateLead(id, { notes });

export const deleteLead = (id) => api.delete(`/api/leads/${id}`);

/** Downloads a CSV of every lead matching the current filters. */
export const exportLeads = ({ status, search, handoff, from, to } = {}) =>
  api.download(`/api/leads/export${qs({ status, search, handoff, from, to })}`, `seo-virji-leads-${today()}.csv`);
