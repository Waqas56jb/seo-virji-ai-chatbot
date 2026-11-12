/**
 * CSV export (RFC 4180). Cells that start with = + - @ are prefixed with ' so spreadsheet
 * apps never execute visitor-written text as a formula (CSV injection).
 */
function cell(value) {
  if (value == null) return '';
  let s = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(cell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Sends CSV as a download (UTF-8 BOM so Excel shows non-English text correctly). */
export function sendCsv(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`﻿${toCsv(rows, columns)}`);
}
