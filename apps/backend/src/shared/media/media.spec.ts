import { describe, expect, it } from 'vitest';
import { checkTarget, isPrivateAddress, mediaPath, signMediaUrl, verifyMediaUrl } from './media.signing.js';

const SECRET = 'a-media-signing-secret';
const TARGET = 'https://images.example.test/photo.jpg';

describe('media signing', () => {
  it('verifies a signature it produced', () => {
    expect(verifyMediaUrl(TARGET, signMediaUrl(TARGET, SECRET), SECRET)).toBe(true);
  });

  it('refuses a signature for a different target', () => {
    const signature = signMediaUrl(TARGET, SECRET);

    expect(verifyMediaUrl('https://images.example.test/other.jpg', signature, SECRET)).toBe(false);
  });

  it('refuses a signature made with another secret', () => {
    expect(verifyMediaUrl(TARGET, signMediaUrl(TARGET, 'another-secret'), SECRET)).toBe(false);
  });

  it('refuses a signature of the wrong length without comparing byte by byte', () => {
    expect(verifyMediaUrl(TARGET, 'short', SECRET)).toBe(false);
    expect(verifyMediaUrl(TARGET, '', SECRET)).toBe(false);
  });

  it('builds a relative path, and nothing at all when signing is disabled', () => {
    expect(mediaPath(TARGET, SECRET)).toMatch(/^\/media\?url=https%3A%2F%2Fimages/);
    expect(mediaPath(TARGET, undefined)).toBeNull();
  });
});

/**
 * A signature proves we minted the URL. It does not prove the target is safe,
 * and on the compose network PostgreSQL, Mongo, n8n and the model server are
 * all one hostname away.
 */
describe('proxy target guard', () => {
  it('allows an ordinary public image', () => {
    expect(checkTarget(TARGET)).toEqual({ allowed: true });
  });

  it('refuses a container name on the compose network', () => {
    for (const host of ['http://n8n:5678/webhook', 'http://mongo:27017', 'http://postgres/x']) {
      expect(checkTarget(host).allowed, host).toBe(false);
    }
  });

  it('refuses loopback by name and by address', () => {
    for (const url of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://[::1]/x',
      'http://127.9.9.9/x',
    ]) {
      expect(checkTarget(url).allowed, url).toBe(false);
    }
  });

  it('refuses private ranges', () => {
    for (const url of [
      'http://10.0.0.5/x',
      'http://192.168.1.10/x',
      'http://172.16.4.4/x',
      'http://172.31.255.1/x',
    ]) {
      expect(checkTarget(url).allowed, url).toBe(false);
    }
  });

  /** The address a cloud instance answers its own credentials on. */
  it('refuses the link-local metadata address', () => {
    expect(checkTarget('http://169.254.169.254/latest/meta-data/').allowed).toBe(false);
  });

  it('refuses schemes that are not http', () => {
    for (const url of ['file:///etc/passwd', 'gopher://x/1', 'ftp://x/y']) {
      expect(checkTarget(url).allowed, url).toBe(false);
    }
  });

  it('refuses something that is not a url at all', () => {
    expect(checkTarget('not a url').allowed).toBe(false);
  });

  it('allows a public address that merely looks close to a private one', () => {
    expect(checkTarget('http://172.32.0.1/x').allowed).toBe(true);
    expect(checkTarget('http://11.0.0.1/x').allowed).toBe(true);
  });

  it('sees through an IPv4 address written inside an IPv6 one', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('refuses IPv6 unique-local and link-local', () => {
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});
