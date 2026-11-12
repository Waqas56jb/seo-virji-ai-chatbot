export function normaliseUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidUrl(value) {
  try {
    const url = new URL(normaliseUrl(value));
    return /^https?:$/.test(url.protocol) && /\.[a-z]{2,}$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function isValidDomain(value) {
  return /^(?!-)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''));
}

export function isValidPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export const isHexColor = (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || ''));

export function required(value, label) {
  return String(value || '').trim() ? null : `${label} is required.`;
}
