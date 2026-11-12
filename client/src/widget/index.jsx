/**
 * Embeddable widget entry point (built with `npm run build:widget` → dist-widget/widget.js).
 *
 * Usage on any website:
 *   <script src="https://YOUR-CHATBOT-DOMAIN.com/widget.js" data-bot-id="seo-virji" defer></script>
 *
 * The script initialises itself, renders into an isolated Shadow DOM and exposes a small
 * global API: window.SEOVirjiChat.open() / .close() / .toggle() / .reset() / .unmount()
 */
import { mountWidget, unmountWidget } from './mount.jsx';
import { readScriptConfig } from './config.js';

// Must be read synchronously while the script is executing.
const currentScript =
  document.currentScript || document.querySelector('script[data-bot-id][src*="widget"]');
const scriptConfig = readScriptConfig(currentScript);
const autoInit = currentScript?.getAttribute('data-auto-init') !== 'false';

let api = null;

function init(options) {
  api = mountWidget({ ...scriptConfig, ...options });
  return api;
}

const globalApi = {
  mount: init,
  unmount: () => {
    unmountWidget();
    api = null;
  },
  open: () => api?.open(),
  close: () => api?.close(),
  toggle: () => api?.toggle(),
  reset: () => api?.reset(),
  ask: (text) => api?.ask(text),
};

window.SEOVirjiChat = globalApi;

if (autoInit) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  } else {
    init();
  }
}

export default globalApi;
