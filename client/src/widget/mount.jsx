import { createRoot } from 'react-dom/client';
import WidgetApp from '../components/widget/WidgetApp.jsx';
import { resolveConfig } from './config.js';
import { configureApi } from '../services/chatService.js';
import widgetStyles from '../styles/widget/index.js';

const HOST_ID = 'seo-virji-chat-widget';
const FONT_LINK_ID = 'seo-virji-chat-fonts';
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap';

let instance = null;

/**
 * Fonts are the one thing a Shadow DOM cannot load by itself (@font-face is ignored inside
 * shadow roots), so we add a single <link> to <head>. It declares font faces only — it never
 * styles any host element. The widget falls back to system fonts if it is blocked.
 */
function ensureFonts() {
  if (document.getElementById(FONT_LINK_ID)) return;
  const link = document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

/** A tiny event bus so the host page can call open()/close() on the React tree. */
function createBus() {
  const listeners = new Set();
  return {
    emit: (type, payload) => listeners.forEach((fn) => fn(type, payload)),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function mountWidget(options = {}) {
  if (instance) return instance.api;

  const config = resolveConfig(options);
  configureApi(config);

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-bot-id', config.botId);
  // Inline styles on the host only — no global selectors are ever written to the page.
  host.style.cssText = `all: initial; position: fixed; z-index: ${Number(config.zIndex) || 2147483000}; top: 0; left: 0; width: 0; height: 0;`;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = widgetStyles;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'sv-root';
  shadow.appendChild(container);

  ensureFonts();

  const bus = createBus();
  const root = createRoot(container);
  root.render(<WidgetApp config={config} bus={bus} portalTarget={container} />);

  const api = {
    open: () => bus.emit('open'),
    close: () => bus.emit('close'),
    toggle: () => bus.emit('toggle'),
    reset: () => bus.emit('reset'),
    /** Opens the chat and sends `text` as the visitor (used by "Ask about…" buttons on a page). */
    ask: (text) => bus.emit('ask', String(text || '')),
    unmount: () => {
      root.unmount();
      host.remove();
      instance = null;
    },
    config,
  };

  instance = { api, host, root };
  return api;
}

/**
 * Mounts the chatbot as a full page (the client app's own screen) — same component,
 * same Shadow DOM isolation, but always open inside a phone-style frame.
 */
export function mountStandalone(target, options = {}) {
  const config = resolveConfig(options);
  configureApi(config);
  const shadow = target.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = widgetStyles;
  shadow.appendChild(style);
  const container = document.createElement('div');
  container.className = 'sv-root';
  shadow.appendChild(container);
  ensureFonts();
  createRoot(container).render(<WidgetApp config={config} standalone />);
}

export function unmountWidget() {
  instance?.api.unmount();
}
