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

/**
 * The same question, asked of what the name actually resolves to (P11, T1111).
 *
 * `checkTarget` reads the URL. That refuses `http://n8n:5678` and
 * `http://169.254.169.254/latest/meta-data/`, which is most of the attack — and
 * it does not refuse `http://evil.example/` when `evil.example` has an A record
 * pointing at `10.0.0.5`. Registering a public name for a private address costs
 * nothing and is the textbook way past a string-only guard, so the name is
 * resolved and every address it gives is checked.
 *
 * **The residual risk is DNS rebinding**, and it is stated rather than hidden:
 * between this lookup and the socket the runtime opens, a hostile resolver can
 * answer differently, and the fetch would then reach the address this refused.
 * Closing that needs the check at connect time — an undici dispatcher with a
 * custom `lookup`, which means taking a direct dependency on undici and keeping
 * its version in step with the one Node bundles, or two HTTP stacks in one
 * process. The trade is recorded in `docs/security-review.md`: what remains is
 * a race against a resolver the attacker controls, on a self-hosted
 * installation whose outbound fetches are links its own owner saved.
 *
 * A lookup that fails is **not** a refusal. DNS being unreachable is our
 * problem, not the source's, and the fetcher's whole retry model turns on that
 * distinction — reading it as a refusal would spend one of a link's attempts on
 * an outage of ours.
 */
export async function checkResolvedTarget(
  rawUrl: string,
  lookup: (host: string) => Promise<Array<{ address: string }>> = defaultLookup,
): Promise<SsrfVerdict> {
  const first = checkTarget(rawUrl);
  if (!first.allowed) return first;

  const host = new URL(rawUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // An address literal was already judged by `checkTarget`; resolving it again
  // asks the resolver a question it has no business answering.
  if (isIP(host) !== 0) return first;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host);
  } catch {
    return { allowed: true };
  }

  const offender = addresses.find((entry) => isPrivateAddress(entry.address));
  return offender
    ? { allowed: false, reason: `refused a name pointing at ${offender.address}` }
    : { allowed: true };
}

async function defaultLookup(host: string): Promise<Array<{ address: string }>> {
  const { lookup } = await import('node:dns/promises');
  // Every address, not the first: a name with one public and one private
  // address would otherwise pass whenever the resolver happened to order the
  // public one first.
  return lookup(host, { all: true });
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
