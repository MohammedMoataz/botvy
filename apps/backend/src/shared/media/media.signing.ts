import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Signs the image URLs the API proxies. Ported from v1 unchanged, with its
 * reasoning.
 *
 * Without a signature `/media` is an open proxy: anyone could point it at any
 * address the server can reach. The signature is the whole authorisation — the
 * route is public precisely so an `<img>` tag can load it, which a bearer token
 * cannot do, because an image request never passes through the refresh
 * interceptor and a JWT would start failing fifteen minutes later and on every
 * reload of history.
 *
 * No expiry: a capability URL on a single-household box, already fenced in by
 * the SSRF guard below, gains nothing from one and would break old history.
 */
export function signMediaUrl(target: string, secret: string): string {
  return createHmac('sha256', secret).update(target).digest('hex');
}

export function verifyMediaUrl(target: string, signature: string, secret: string): boolean {
  const expected = signMediaUrl(target, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The relative markdown src for an image, or null when signing is disabled. */
export function mediaPath(target: string, secret: string | undefined): string | null {
  if (!secret) return null;
  return `/media?url=${encodeURIComponent(target)}&sig=${signMediaUrl(target, secret)}`;
}

export type SsrfVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * What the proxy is allowed to fetch.
 *
 * A signature proves *we* minted the URL; it does not prove the target is safe.
 * The two are separate concerns and both are needed: the compose network puts
 * PostgreSQL, Mongo, n8n and the model server one hostname away, and a proxy
 * that would fetch `http://n8n:5678` on request is a hole regardless of who
 * signed it. Everything private is refused by default.
 */
export function checkTarget(rawUrl: string): SsrfVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'not a url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: `refused scheme ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { allowed: false, reason: 'refused a local name' };
  }

  // A bare name with no dot is a container on the compose network — `n8n`,
  // `mongo`, `postgres`. That is precisely what must never be reachable here.
  if (!host.includes('.') && isIP(host) === 0) {
    return { allowed: false, reason: 'refused an internal hostname' };
  }

  if (isIP(host) !== 0 && isPrivateAddress(host)) {
    return { allowed: false, reason: 'refused a private address' };
  }

  return { allowed: true };
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const v6 = address.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    // Unique-local and link-local.
    if (v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')) return true;
    // IPv4 written inside an IPv6 address still names an IPv4 host.
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    return mapped ? isPrivateAddress(mapped[1]!) : false;
  }

  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  const [a, b] = parts as [number, number, number, number];

  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, and the cloud metadata address
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}
