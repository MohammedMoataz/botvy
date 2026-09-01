import { describe, expect, it } from 'vitest';
import { mediaPath, signMediaUrl, verifyMediaUrl } from '../src/media/media.signing.js';
import { checkUrlIsPublic, isPrivateAddress } from '../src/media/ssrf.js';

const SECRET = 'a-signing-secret-long-enough';

describe('media URL signing', () => {
  it('accepts a signature it produced', () => {
    const url = 'https://example.com/cat.jpg';
    expect(verifyMediaUrl(url, signMediaUrl(url, SECRET), SECRET)).toBe(true);
  });

  it('rejects a tampered url', () => {
    // The whole point: the signature is the authorisation, so changing the
    // target must invalidate it.
    const signature = signMediaUrl('https://example.com/cat.jpg', SECRET);
    expect(verifyMediaUrl('http://127.0.0.1:8080/', signature, SECRET)).toBe(false);
  });

  it('rejects a signature from a different secret', () => {
    const signature = signMediaUrl('https://example.com/cat.jpg', 'another-secret-entirely');
    expect(verifyMediaUrl('https://example.com/cat.jpg', signature, SECRET)).toBe(false);
  });

  it('rejects a truncated signature rather than comparing prefixes', () => {
    const url = 'https://example.com/cat.jpg';
    const signature = signMediaUrl(url, SECRET);
    expect(verifyMediaUrl(url, signature.slice(0, 16), SECRET)).toBe(false);
  });

  it('builds a relative path, so it survives a base-URL change', () => {
    const path = mediaPath('https://example.com/a b.jpg', SECRET);
    expect(path?.startsWith('/media?url=')).toBe(true);
    expect(path).toContain('a%20b.jpg');
  });

  it('builds nothing when signing is switched off', () => {
    expect(mediaPath('https://example.com/cat.jpg', undefined)).toBeNull();
  });
});

describe('isPrivateAddress', () => {
  it('rejects the ranges that reach inside the host or the network', () => {
    for (const address of [
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.1.2.3',
      '172.16.5.4',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1', // IPv4 wearing an IPv6 hat
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const address of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it('treats anything that is not an address as private', () => {
    expect(isPrivateAddress('not-an-address')).toBe(true);
  });
});

describe('checkUrlIsPublic', () => {
  it('refuses a literal private address', async () => {
    expect(await checkUrlIsPublic('http://127.0.0.1:8080/')).toMatchObject({ ok: false });
    expect(await checkUrlIsPublic('http://169.254.169.254/latest/meta-data/')).toMatchObject({
      ok: false,
    });
    expect(await checkUrlIsPublic('http://[::1]/')).toMatchObject({ ok: false });
  });

  it('refuses a service name on the compose network', async () => {
    // postgres, n8n and searxng all sit beside the gateway.
    expect(await checkUrlIsPublic('http://postgres:5432/')).toMatchObject({ ok: false });
  });

  it('refuses schemes that are not http(s)', async () => {
    for (const url of ['file:///etc/passwd', 'gopher://x/', 'data:image/png;base64,AAA']) {
      expect(await checkUrlIsPublic(url), url).toMatchObject({ ok: false });
    }
  });

  it('refuses a url long enough to be a payload', async () => {
    const long = `https://example.com/${'a'.repeat(4000)}`;
    expect(await checkUrlIsPublic(long)).toMatchObject({ ok: false, reason: 'url too long' });
  });

  it('refuses something that is not a url at all', async () => {
    expect(await checkUrlIsPublic('just some text')).toMatchObject({ ok: false });
  });

  it('allows a public address', async () => {
    expect(await checkUrlIsPublic('https://1.1.1.1/cat.jpg')).toMatchObject({ ok: true });
  });
});
