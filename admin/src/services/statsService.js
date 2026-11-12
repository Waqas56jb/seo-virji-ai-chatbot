import { api } from './apiClient.js';

/** GET /api/analytics/overview — every number is computed from Supabase data. */
export const getOverview = () => api.get('/api/analytics/overview');

export const getUsage = (days = 30) => api.get(`/api/analytics/usage?days=${days}`);
