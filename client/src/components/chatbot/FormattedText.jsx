import { Fragment } from 'react';

/**
 * Minimal, safe formatter for assistant replies (no dangerouslySetInnerHTML):
 *  - blank line → new paragraph
 *  - lines starting with "- " or "• " → bullet list
 *  - **bold** and *italic*
 *  - single newlines → <br />
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;

function renderInline(text, keyPrefix) {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function renderLines(text, keyPrefix) {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <Fragment key={`${keyPrefix}-l${i}`}>
      {renderInline(line, `${keyPrefix}-l${i}`)}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ));
}

export default function FormattedText({ text = '' }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());

  return blocks.map((block, bi) => {
    const lines = block.split('\n');
    const isList = lines.every((l) => /^\s*[-•]\s+/.test(l));
    if (isList) {
      return (
        <ul key={bi} className="sv-md-list">
          {lines.map((l, li) => (
            <li key={li}>{renderInline(l.replace(/^\s*[-•]\s+/, ''), `${bi}-${li}`)}</li>
          ))}
        </ul>
      );
    }
    return <p key={bi}>{renderLines(block, `${bi}`)}</p>;
  });
}
