import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Keeps the image proxy from being pointed at the inside of the network.
 *
 * The gateway sits on a compose network with Postgres, n8n and SearXNG, and on
 * a host with whatever else is listening. A proxy that fetches any URL it is
 * given is a way to reach all of it from outside, so every address is resolved
 * and checked before a request is made, and again after each redirect.
 */

/** Blocked ranges, as [first, last] of the address in 32-bit form. */
const BLOCKED_V4: [string, string][] = [
  ['0.0.0.0', '0.255.255.255'], // "this network"
  ['10.0.0.0', '10.255.255.255'], // private
  ['100.64.0.0', '100.127.255.255'], // CGNAT
  ['127.0.0.0', '127.255.255.255'], // loopback
  ['169.254.0.0', '169.254.255.255'], // link-local, incl. cloud metadata
  ['172.16.0.0', '172.31.255.255'], // private
  ['192.0.0.0', '192.0.0.255'], // IETF protocol assignments
  ['192.168.0.0', '192.168.255.255'], // private
  ['198.18.0.0', '198.19.255.255'], // benchmarking
  ['224.0.0.0', '255.255.255.255'], // multicast and reserved
];

function toInt(address: string): number {
  return address.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

function isPrivateV4(address: string): boolean {
  const value = toInt(address);
  return BLOCKED_V4.some(([first, last]) => value >= toInt(first) && value <= toInt(last));
}

function isPrivateV6(address: string): boolean {
  const value = address.toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return true;
  // Unique local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true;
  // IPv4 written inside IPv6, which would otherwise skip the v4 table.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateV4(address);
  if (family === 6) return isPrivateV6(address);
  return true; // not an address at all: refuse rather than guess
}

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

const MAX_URL_LENGTH = 2048;

/**
 * Resolves the host and rejects anything that points inside. Called for the
 * original URL and again for every redirect target.
 *
 * ponytail: resolves once and then lets fetch resolve again, so a name that
 * answers differently between the two calls slips through (DNS rebinding).
 * Closing that means pinning the address into the socket, which Node's fetch
 * does not expose — worth an undici dispatcher only if this ever faces
 * untrusted callers.
 */
export async function checkUrlIsPublic(raw: string): Promise<UrlCheck> {
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'url too long' };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `refused scheme ${url.protocol}` };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: 'address is private' }
      : { ok: true };
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: 'host does not resolve' };
  }

  if (addresses.length === 0) return { ok: false, reason: 'host does not resolve' };
  // Every answer must be public: one private record is enough to reach inside.
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    return { ok: false, reason: 'host resolves to a private address' };
  }
  return { ok: true };
}
