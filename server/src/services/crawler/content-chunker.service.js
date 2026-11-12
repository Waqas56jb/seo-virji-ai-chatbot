/**
 * Section-aware chunking.
 *  - splits on "## Heading" lines so each chunk keeps its section heading
 *  - packs paragraphs up to ~TARGET tokens, never cutting mid-paragraph unless a single
 *    paragraph is oversized (then it splits on sentence boundaries)
 *  - carries ~OVERLAP tokens of trailing context into the next chunk of the same section
 * Each chunk is prefixed with page + section context to improve retrieval.
 */
import { estimateTokens, sha256 } from '../../utils/text-utils.js';

const TARGET_TOKENS = 650;
const MAX_TOKENS = 800;
const OVERLAP_TOKENS = 100;

function splitSentences(paragraph) {
  return paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [paragraph];
}

function toUnits(body) {
  const units = [];
  for (const p of body.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (estimateTokens(p) <= MAX_TOKENS) units.push(p);
    else {
      let buf = '';
      for (const s of splitSentences(p)) {
        if (buf && estimateTokens(`${buf} ${s}`) > TARGET_TOKENS) {
          units.push(buf);
          buf = s;
        } else buf = buf ? `${buf} ${s}` : s;
      }
      if (buf) units.push(buf);
    }
  }
  return units;
}

function tailOverlap(units) {
  const out = [];
  let tokens = 0;
  for (let i = units.length - 1; i >= 0 && tokens < OVERLAP_TOKENS; i -= 1) {
    out.unshift(units[i]);
    tokens += estimateTokens(units[i]);
  }
  return out;
}

export function chunkDocument({ text, title = '', sourceUrl = null, sourceId = null, crawledAt = null }) {
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of String(text || '').split('\n')) {
    if (line.startsWith('## ')) {
      if (current.lines.length) sections.push(current);
      current = { heading: line.slice(3).trim(), lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.length) sections.push(current);

  const chunks = [];
  for (const section of sections) {
    const units = toUnits(section.lines.join('\n'));
    let buf = [];
    let tokens = 0;
    const flush = () => {
      if (!buf.length) return;
      const header = [title && `Page: ${title}`, section.heading && `Section: ${section.heading}`].filter(Boolean).join('\n');
      const body = buf.join('\n');
      const content = header ? `${header}\n\n${body}` : body;
      chunks.push({
        content,
        token_count: estimateTokens(content),
        content_hash: sha256(content),
        metadata: { source_url: sourceUrl, page_title: title, section_heading: section.heading, source_id: sourceId, crawled_at: crawledAt },
      });
    };
    for (const unit of units) {
      const t = estimateTokens(unit);
      if (buf.length && tokens + t > TARGET_TOKENS) {
        flush();
        buf = tailOverlap(buf);
        tokens = buf.reduce((n, u) => n + estimateTokens(u), 0);
      }
      buf.push(unit);
      tokens += t;
    }
    flush();
  }

  // Merge very small trailing chunks into the previous chunk of the document.
  const merged = [];
  for (const c of chunks) {
    const prev = merged[merged.length - 1];
    if (prev && c.token_count < 60 && prev.token_count + c.token_count <= MAX_TOKENS) {
      prev.content = `${prev.content}\n\n${c.content}`;
      prev.token_count = estimateTokens(prev.content);
      prev.content_hash = sha256(prev.content);
    } else merged.push(c);
  }
  return merged.map((c, i) => ({ ...c, chunk_index: i, metadata: { ...c.metadata, chunk_index: i } }));
}
