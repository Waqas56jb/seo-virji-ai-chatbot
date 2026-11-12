/**
 * wa.me click-to-chat link + pre-filled message. Contains only what the visitor actually
 * shared, their own question, and a conversation reference the team can look up in the admin.
 */
const LABELS = [
  ['name', 'Name'],
  ['business_name', 'Business'],
  ['website', 'Website'],
  ['industry', 'Industry'],
  ['challenge', 'Main challenge'],
  ['goal', 'Main goal'],
];

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Short, human-friendly reference (first block of the conversation UUID). */
export const referenceCode = (uuid) => String(uuid || '').split('-')[0].toUpperCase();

export function buildHandoffMessage({ intro, facts = {}, question, requirements = [], summary, reference }) {
  const lines = [intro?.trim() || "Hi SEO Virji team! I've just been chatting with your AI consultant and would like to continue the conversation."];
  if (question) lines.push('', `My question: ${clip(String(question).trim(), 300)}`);
  const details = LABELS.filter(([k]) => facts[k]).map(([k, label]) => `• ${label}: ${facts[k]}`);
  if (details.length) lines.push('', ...details);
  const reqs = [...new Set(requirements)].filter(Boolean).slice(0, 5);
  if (reqs.length) lines.push('', 'What I need:', ...reqs.map((r) => `• ${clip(String(r), 120)}`));
  if (summary) lines.push('', `Summary: ${clip(summary, 400)}`);
  if (reference) lines.push('', `Chat reference: ${referenceCode(reference)}`);
  return lines.join('\n');
}

export function buildWhatsAppUrl(number, message) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
