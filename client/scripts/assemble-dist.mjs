/**
 * Combines the two client builds into one deployable folder (dist/):
 *   dist/index.html       standalone chatbot page (mobile-style)
 *   dist/widget.js        embeddable widget (one <script> tag, Shadow DOM isolated)
 *   dist/embed-test.html  an "external website" with hostile CSS that embeds widget.js
 * Run after `vite build` and `vite build --mode widget` (see `npm run build:deploy`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const widgetDist = path.join(root, 'dist-widget');

for (const f of ['widget.js']) {
  if (!fs.existsSync(path.join(widgetDist, f))) throw new Error(`Missing ${f} — run "vite build --mode widget" first.`);
}
fs.copyFileSync(path.join(widgetDist, 'widget.js'), path.join(dist, 'widget.js'));
fs.copyFileSync(path.join(widgetDist, 'index.html'), path.join(dist, 'embed-test.html'));
console.log('[assemble] dist/widget.js and dist/embed-test.html added');
