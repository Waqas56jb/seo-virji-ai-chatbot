import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Two build targets live in this one config:
 *
 *  1. `vite` / `vite build`           → the demo host page (index.html) used for local
 *                                        development and client presentations.
 *  2. `vite build --mode widget`      → the embeddable widget: a single self-initialising
 *                                        IIFE file (dist-widget/widget.js) with all CSS inlined
 *                                        and injected into a Shadow DOM at runtime.
 *
 * The widget is embedded on any website with:
 *   <script src="https://YOUR-CHATBOT-DOMAIN.com/widget.js" data-bot-id="seo-virji" defer></script>
 */

/** Emits a tiny host page next to widget.js so the bundle can be tested in isolation. */
function widgetTestPage() {
  return {
    name: 'seo-virji-widget-test-page',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Widget isolation test</title>
  <style>
    /* Deliberately aggressive host styles: the widget must not be affected by these. */
    * { font-family: "Comic Sans MS", cursive !important; color: #c00; }
    button { background: lime; border: 4px dashed red; padding: 30px; }
    div { border: 1px dotted #999; }
    body { margin: 0; padding: 40px; background: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Third-party host page</h1>
  <p>This page loads <code>widget.js</code> with hostile global CSS to prove style isolation.</p>
  <button type="button">A host button</button>
  <script src="./widget.js" data-bot-id="seo-virji" defer></script>
</body>
</html>`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'widget') {
    return {
      plugins: [react(), widgetTestPage()],
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      publicDir: false,
      build: {
        outDir: 'dist-widget',
        emptyOutDir: true,
        cssCodeSplit: false,
        sourcemap: false,
        lib: {
          entry: 'src/widget/index.jsx',
          name: 'SEOVirjiChat',
          formats: ['iife'],
          fileName: () => 'widget.js',
        },
        rollupOptions: {
          output: { inlineDynamicImports: true },
        },
      },
      preview: { port: 4174, proxy: { '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4100', changeOrigin: true } } },
    };
  }

  // Dev/preview: forward /api to the local backend so the app runs same-origin.
  const proxy = { '/api': { target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4100', changeOrigin: true } };
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  };
});
