/**
 * Widget configuration.
 *
 * Resolution order (later wins):
 *   1. DEFAULT_CONFIG below
 *   2. Remote settings saved in the admin panel (GET /api/chat/config, loaded at runtime)
 *   3. window.SEOVirjiChatConfig = { ... }   (optional, set by the host page)
 *   4. data-* attributes on the <script> tag   (e.g. data-position="left")
 *   5. Options passed to window.SEOVirjiChat.mount({...})
 * Anything explicitly set by 3–5 is kept even after remote settings load.
 */
const env = import.meta.env || {};

export const DEFAULT_CONFIG = {
  botId: env.VITE_BOT_ID || 'seo-virji',
  // Where the SEO Virji API lives. Empty = same origin (Vite dev proxy forwards /api).
  apiBaseUrl: String(env.VITE_API_BASE_URL || '').replace(/^﻿/, '').trim(),
  brandName: 'SEO VIRJI',
  assistantName: 'SEO Virji AI Consultant',
  assistantTagline: 'Your Personal Business Growth Assistant',
  primaryColor: '#0B1050',
  accentColor: '#C9A132',
  position: 'right',
  whatsappEnabled: true,
  whatsappLabel: 'Continue on WhatsApp',
  online: true,
  enabled: true,
  openOnLoad: false,
  showNotificationDot: true,
  zIndex: 2147483000,
};

const ATTRIBUTE_MAP = {
  'data-bot-id': 'botId',
  'data-position': 'position',
  'data-primary-color': 'primaryColor',
  'data-accent-color': 'accentColor',
  'data-whatsapp-label': 'whatsappLabel',
  'data-assistant-name': 'assistantName',
  'data-api-base-url': 'apiBaseUrl',
  'data-api-url': 'apiBaseUrl',
  'data-open': 'openOnLoad',
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function readScriptConfig(script) {
  if (!script || !script.getAttribute) return {};
  const out = {};
  Object.entries(ATTRIBUTE_MAP).forEach(([attr, key]) => {
    const value = script.getAttribute(attr);
    if (value !== null && value !== '') out[key] = value;
  });
  if ('openOnLoad' in out) out.openOnLoad = out.openOnLoad !== 'false';
  // Default the API to the origin the script was served from (one-line embed just works).
  if (!out.apiBaseUrl && script.src && !env.VITE_API_BASE_URL) {
    try {
      out.apiBaseUrl = new URL(script.src).origin;
    } catch {
      /* ignore */
    }
  }
  return out;
}

function sanitise(cfg) {
  const c = { ...cfg };
  if (!HEX.test(c.primaryColor)) c.primaryColor = DEFAULT_CONFIG.primaryColor;
  if (!HEX.test(c.accentColor)) c.accentColor = DEFAULT_CONFIG.accentColor;
  c.position = c.position === 'left' ? 'left' : 'right';
  return c;
}

export function resolveConfig(...sources) {
  const fromWindow = typeof window !== 'undefined' ? window.SEOVirjiChatConfig || {} : {};
  const overrides = Object.assign({}, fromWindow, ...sources.filter(Boolean));
  return sanitise({ ...DEFAULT_CONFIG, ...overrides, explicitKeys: Object.keys(overrides) });
}

/** Maps GET /api/chat/config onto widget keys, without touching explicitly-set values. */
export function applyRemoteConfig(config, remote) {
  if (!remote) return config;
  const mapped = {
    enabled: remote.enabled,
    assistantName: remote.botName || remote.assistantName,
    assistantTagline: remote.assistantTagline,
    primaryColor: remote.primaryColor,
    accentColor: remote.accentColor,
    position: remote.position,
    online: remote.online,
    whatsappEnabled: remote.whatsappEnabled,
    whatsappLabel: remote.whatsappLabel,
    logoUrl: remote.logoUrl,
    maxMessageLength: remote.maxMessageLength,
  };
  const next = { ...config };
  for (const [k, v] of Object.entries(mapped)) {
    if (v !== undefined && v !== null && !config.explicitKeys?.includes(k)) next[k] = v;
  }
  return sanitise(next);
}
