import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signs the image URLs the gateway proxies.
 *
 * Without a signature /media is an open proxy: anyone could point it at any
 * address the server can reach. The signature is the whole authorisation —
 * the route is public precisely so an <img> tag can load it, which a bearer
 * token cannot do (Image.network never sees the refresh interceptor, so a JWT
 * would 401 fifteen minutes later and on every history reload).
 *
 * No expiry: a capability URL on a single-user box, already fenced in by the
 * SSRF guard, gains nothing from one and would break history.
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
