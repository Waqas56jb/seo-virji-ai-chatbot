/** Lead pipeline: New → Contacted → Interested → Qualified → Converted (or Not Interested). */
export const LEAD_STATUSES = [
  { value: 'new', label: 'New', tone: 'blue' },
  { value: 'contacted', label: 'Contacted', tone: 'navy' },
  { value: 'interested', label: 'Interested', tone: 'violet' },
  { value: 'qualified', label: 'Qualified', tone: 'yellow' },
  { value: 'converted', label: 'Converted', tone: 'green' },
  { value: 'not_interested', label: 'Not Interested', tone: 'gray' },
];

export const LEAD_STATUS_MAP = Object.fromEntries(LEAD_STATUSES.map((s) => [s.value, s]));

/** Safe lookup — unknown/legacy values fall back to a neutral badge. */
export const leadStatusMeta = (status) => LEAD_STATUS_MAP[status] || { value: status, label: status ? String(status).replace(/_/g, ' ') : 'Unknown', tone: 'gray' };

export const LEAD_HANDOFF_FILTERS = [
  { value: 'all', label: 'Any WhatsApp status' },
  { value: 'yes', label: 'WhatsApp handoff' },
  { value: 'no', label: 'No WhatsApp handoff' },
];

export const CONVERSATION_STATUSES = {
  new: { label: 'New', tone: 'blue' },
  qualified: { label: 'Qualified', tone: 'yellow' },
  handoff: { label: 'WhatsApp Handoff', tone: 'green' },
  resolved: { label: 'Resolved', tone: 'gray' },
};

export const conversationStatusMeta = (status) => CONVERSATION_STATUSES[status] || { label: status || 'Unknown', tone: 'gray' };

export const CONVERSATION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'handoff', label: 'WhatsApp Handoff' },
  { value: 'active', label: 'Active' },
  { value: 'resolved', label: 'Resolved' },
];

/**
 * WhatsApp handoff states. We only know that a wa.me link was generated or opened —
 * never whether a message was actually sent or delivered.
 */
export const HANDOFF_STATUSES = {
  link_generated: { label: 'WhatsApp link generated', tone: 'gold' },
  opened: { label: 'WhatsApp opened', tone: 'green' },
};

export const handoffMeta = (status) => (status ? HANDOFF_STATUSES[status] || HANDOFF_STATUSES.link_generated : null);

export const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:5173';
