/** Strips control characters and trims. Frontends render output as text, never as HTML. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value, max = 10_000) {
  return String(value ?? '')
    .replace(CONTROL, '')
    .trim()
    .slice(0, max);
}

export const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
