import { z } from 'zod';

/** Lead pipeline shown in the admin: New → Contacted → Interested → Qualified → Converted (or Not Interested). */
export const STATUSES = ['new', 'contacted', 'interested', 'qualified', 'converted', 'not_interested'];
const opt = (max) => z.string().trim().max(max).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional();

export const listLeads = z.object({
  status: z.enum(['all', ...STATUSES]).optional(),
  search: z.string().trim().max(100).optional(),
  handoff: z.enum(['all', 'yes', 'no']).optional(),
  from: isoDate,
  to: isoDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const exportLeads = listLeads.omit({ page: true, pageSize: true });
export const createLead = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  phone: opt(40), businessName: opt(200), website: opt(300), industry: opt(120), challenge: opt(1000), goal: opt(500), budget: opt(80), notes: opt(4000),
  status: z.enum(STATUSES).optional(),
});
export const updateLead = createLead.partial();

export const CONVERSATION_FILTERS = ['all', 'new', 'qualified', 'handoff', 'active', 'resolved'];
export const listConversations = z.object({
  status: z.enum(CONVERSATION_FILTERS).optional(),
  search: z.string().trim().max(100).optional(),
  from: isoDate,
  to: isoDate,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
});
export const exportConversations = listConversations.omit({ page: true, pageSize: true }).extend({
  include: z.enum(['summary', 'messages']).default('summary'),
});
export const conversationStatus = z.object({ status: z.enum(['active', 'resolved', 'archived']) });
export const uuidParam = z.object({ id: z.string().uuid() });
