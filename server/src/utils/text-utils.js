import crypto from 'node:crypto';

export const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');

/** Approximate token count (~4 characters per token for English). Used for sizing only. */
export const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);

export const normaliseWhitespace = (text) =>
  String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const truncate = (text, n) => (text && text.length > n ? `${text.slice(0, n - 1).trim()}…` : text || '');

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
