export const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

/** wa.me follow-up link to a lead's own number. Null when the visitor did not share a phone. */
export function leadWhatsAppUrl(lead) {
  const number = digitsOnly(lead?.phone);
  if (number.length < 8) return null;
  const firstName = lead?.name && lead.name !== 'Unnamed visitor' ? lead.name.split(' ')[0] : 'there';
  const about = lead?.challenge ? ` about ${lead.challenge.charAt(0).toLowerCase()}${lead.challenge.slice(1)}` : '';
  const text = `Hi ${firstName}, this is the SEO Virji team. Thanks for chatting with our AI consultant${about} — we'd love to help. Is now a good time for a quick chat?`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(lead) {
  const url = leadWhatsAppUrl(lead);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  return Boolean(url);
}
