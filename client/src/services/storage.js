/**
 * Browser storage helpers. Storage can be unavailable (private mode, blocked cookies,
 * sandboxed iframes) so every access is guarded — the widget still works without it.
 *
 *  - visitor id + conversation session: localStorage, so a returning visitor can resume
 *    (the server enforces expiry; messages themselves live in Supabase, not the browser)
 *  - small UI state (open/closed): sessionStorage
 */
const PREFIX = 'seo-virji-chat';

function get(store) {
  try {
    return window[store];
  } catch {
    return null;
  }
}

function read(store, key) {
  try {
    const raw = get(store)?.getItem(`${PREFIX}:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(store, key, value) {
  try {
    if (value == null) get(store)?.removeItem(`${PREFIX}:${key}`);
    else get(store)?.setItem(`${PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
}

export const loadSession = (key) => read('sessionStorage', key);
export const saveSession = (key, value) => write('sessionStorage', key, value);
export const clearSession = (key) => write('sessionStorage', key, null);

export const loadLocal = (key) => read('localStorage', key);
export const saveLocal = (key, value) => write('localStorage', key, value);

/** Random, non-identifying visitor id (never derived from personal data). */
export function getVisitorId() {
  let id = loadLocal('visitor');
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(id)) return id;
  const bytes = new Uint8Array(18);
  (window.crypto || {}).getRandomValues?.(bytes);
  id = `v_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  saveLocal('visitor', id);
  return id;
}
