/**
 * Admin HTTP client.
 *  - Access token is kept in memory only (never localStorage).
 *  - The refresh token is an HttpOnly cookie set by the API; on a 401 we refresh once
 *    and retry, otherwise we notify the app to show the login screen.
 *  - Base URL: VITE_API_BASE_URL in production; empty in dev (Vite proxies /api).
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

let accessToken = null;
let refreshing = null;
const listeners = new Set();

export const setAccessToken = (token) => {
  accessToken = token;
};
export const onAuthLost = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function raw(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", { status: 0, code: 'NETWORK' });
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.error?.message || `Request failed (${res.status})`, { status: res.status, code: json?.error?.code, details: json?.error?.details });
  }
  return json?.data;
}

/** Exchanges the refresh cookie for a new access token (single-flight). */
export async function refreshSession() {
  refreshing ||= raw('POST', '/api/admin/auth/refresh')
    .then((data) => {
      setAccessToken(data.accessToken);
      return data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Runs `fn`; on a 401 refreshes the session once and retries, otherwise signals auth loss. */
async function withRefresh(path, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status !== 401 || path.startsWith('/api/admin/auth/')) throw err;
    try {
      await refreshSession();
    } catch {
      setAccessToken(null);
      listeners.forEach((fn) => fn());
      throw err;
    }
    return fn();
  }
}

const request = (method, path, body) => withRefresh(path, () => raw(method, path, body));

/** Authenticated GET that returns a file (e.g. CSV export) as a Blob. */
async function rawFile(path) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", { status: 0, code: 'NETWORK' });
  }
  if (!res.ok) {
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* not JSON */
    }
    throw new ApiError(json?.error?.message || `Download failed (${res.status})`, { status: res.status, code: json?.error?.code, details: json?.error?.details });
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return { blob: await res.blob(), filename: match ? decodeURIComponent(match[1]) : null };
}

/** Downloads a protected file with the access token and saves it via a temporary link. */
async function download(path, fallbackName = 'download') {
  const { blob, filename } = await withRefresh(path, () => rawFile(path));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || fallbackName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename || fallbackName;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  download,
};

export const qs = (params = {}) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all'));
  const str = s.toString();
  return str ? `?${str}` : '';
};
