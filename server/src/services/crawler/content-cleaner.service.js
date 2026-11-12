/**
 * Cross-page boilerplate removal: lines that repeat on most pages of a crawl (menus, CTAs,
 * footers that survived template removal) are dropped from every page.
 */
import { normaliseWhitespace } from '../../utils/text-utils.js';

export function findBoilerplateLines(pages, { minPages = 4, ratio = 0.6 } = {}) {
  if (pages.length < minPages) return new Set();
  const counts = new Map();
  for (const page of pages) {
    for (const line of new Set(page.text.split('\n'))) {
      if (line.startsWith('## ') && line.length > 40) continue; // keep real headings
      counts.set(line, (counts.get(line) || 0) + 1);
    }
  }
  const threshold = Math.max(minPages, Math.ceil(pages.length * ratio));
  return new Set([...counts].filter(([, n]) => n >= threshold).map(([line]) => line));
}

export function removeBoilerplate(text, boilerplate) {
  if (!boilerplate.size) return text;
  return normaliseWhitespace(
    text
      .split('\n')
      .filter((line) => !boilerplate.has(line))
      .join('\n'),
  );
}

/** Removes headings that ended up with no content beneath them. */
export function dropEmptySections(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.startsWith('## ') && (next === undefined || next.startsWith('## '))) {
      // A heading directly followed by another heading: fold it into the next one
      // (e.g. "Our Story — Built by one founder…") so its context is not lost.
      if (next !== undefined) {
        const combined = `## ${line.slice(3)} — ${next.slice(3)}`;
        if (combined.length <= 160) lines[i + 1] = combined;
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
