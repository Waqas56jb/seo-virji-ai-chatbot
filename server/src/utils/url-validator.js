/**
 * URL safety for the crawler (SSRF protection):
 *  - http/https only, no credentials, default ports only
 *  - hostname must be on the approved allowlist
 *  - every resolved IP must be public (blocks localhost, private ranges, link-local,
 *    cloud metadata 169.254.169.254, CGNAT, IPv6 ULA/link-local, IPv4-mapped IPv6)
 * Redirects are validated hop-by-hop by the scraper using the same checks.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[a-z]+|_ga|_gl|ref|igshid|yclid)$/i;

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
  }
  return true;
}

/** Canonical form used for de-duplication. Returns null if not parseable. */
export function normaliseUrl(input, base) {
  let url;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
  [...url.searchParams.keys()].forEach((k) => TRACKING_PARAMS.test(k) && url.searchParams.delete(k));
  url.searchParams.sort();
  if (url.pathname !== '/' && url.pathname.endsWith('/')) url.pathname = url.pathname.replace(/\/+$/, '/');
  return url.toString();
}

/** Synchronous structural checks (no DNS). Returns an error string or null. */
export function checkUrlShape(input, allowedHosts) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return 'Invalid URL';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'Only http and https URLs are allowed';
  if (url.username || url.password) return 'URLs with credentials are not allowed';
  if (url.port && !['80', '443'].includes(url.port)) return 'Non-standard ports are not allowed';
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return 'Local hosts are not allowed';
  if (net.isIP(host) && isPrivateIp(host)) return 'Private network addresses are not allowed';
  if (net.isIP(host)) return 'IP-address URLs are not allowed';
  if (allowedHosts && !allowedHosts.includes(host)) return `Only these domains can be crawled: ${allowedHosts.join(', ')}`;
  return null;
}

/** Full check including DNS resolution. Throws with a safe message on failure. */
export async function assertSafeUrl(input, allowedHosts) {
  const problem = checkUrlShape(input, allowedHosts);
  if (problem) throw Object.assign(new Error(problem), { code: 'UNSAFE_URL' });
  const host = new URL(input).hostname;
  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw Object.assign(new Error('Domain could not be resolved'), { code: 'UNSAFE_URL' });
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
    throw Object.assign(new Error('Domain resolves to a private network address'), { code: 'UNSAFE_URL' });
  }
  return true;
}
