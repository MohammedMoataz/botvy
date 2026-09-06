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

/** The eight 16-bit groups of an IPv6 address, `::` expanded. */
function expandV6(address: string): number[] | null {
  const value = address.toLowerCase().split('%')[0];
  const halves = value.split('::');
  if (halves.length > 2) return null;

  const parse = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const piece of part.split(':')) {
      // A trailing dotted quad, as in ::ffff:127.0.0.1, is two groups.
      if (piece.includes('.')) {
        const octets = piece.split('.').map(Number);
        if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
          return null;
        }
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      groups.push(parseInt(piece, 16));
    }
    return groups;
  };

  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  if (head === null || tail === null) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;
  const gap = 8 - head.length - tail.length;
  if (gap < 0) return null;
  return [...head, ...Array<number>(gap).fill(0), ...tail];
}

function isPrivateV6(address: string): boolean {
  const groups = expandV6(address);
  if (groups === null) return true; // unparseable: refuse rather than guess

  // Unspecified (::) and loopback (::1).
  if (groups.every((g, i) => (i === 7 ? g === 0 || g === 1 : g === 0))) return true;

  // IPv4 inside IPv6. Checked on the expanded groups, not the text: the URL
  // parser rewrites ::ffff:127.0.0.1 as ::ffff:7f00:1, and a regex looking for
  // dotted quads never sees it — which let loopback and the cloud metadata
  // address straight through.
  const v4Mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  const v4Compatible = groups.slice(0, 6).every((g) => g === 0) && groups[6] !== 0;
  if (v4Mapped || v4Compatible) {
    const high = groups[6];
    const low = groups[7];
    return isPrivateV4(
      [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'),
    );
  }

  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true; // unique local, fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local, fe80::/10
  if (first === 0x0064 && groups[1] === 0xff9b) return true; // NAT64, 64:ff9b::/96
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
