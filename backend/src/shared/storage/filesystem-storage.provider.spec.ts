import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyMediaUrl } from '../media/media.signing.js';
import { FilesystemStorageProvider } from './filesystem-storage.provider.js';

/**
 * The provider that keeps attachments on the `media` volume.
 *
 * It is one of possibly several: what every adapter promises is that a key
 * put can be read back and removed, and that `url()` mints something a client
 * can load without a session. The filesystem one has one rule of its own — a
 * key never escapes the root, because a stored key that reached the disk with
 * a `../` in it would read and delete whatever the process can.
 */

const SECRET = 'a-media-signing-secret-long-enough';

describe('FilesystemStorageProvider', () => {
  let root: string;
  let storage: FilesystemStorageProvider;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'botvy-storage-'));
    storage = new FilesystemStorageProvider(root, SECRET);
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('puts, reads back and removes by key, creating directories as it goes', async () => {
    const key = 'photos/user-1/avatar-1.webp';
    await storage.put(key, Buffer.from('bytes'));
    expect((await storage.read(key))?.toString()).toBe('bytes');
    await storage.remove(key);
    expect(await storage.read(key)).toBeNull();
  });

  it('reads a missing key as null rather than throwing', async () => {
    expect(await storage.read('photos/nobody/nothing.webp')).toBeNull();
  });

  it('mints a signed URL on the local files route, and the signature is over the key', () => {
    const key = 'photos/user-1/avatar-2.webp';
    const url = new URL(storage.url(key), 'http://botvy.test');
    expect(url.pathname).toBe('/media/files');
    expect(url.searchParams.get('key')).toBe(key);
    expect(verifyMediaUrl(key, url.searchParams.get('sig') ?? '', SECRET)).toBe(
      true,
    );
  });

  it('refuses a key that escapes the root', async () => {
    await expect(storage.read('../outside.txt')).rejects.toThrow(/escapes/);
    await expect(
      storage.put('photos/../../outside.txt', Buffer.alloc(1)),
    ).rejects.toThrow(/escapes/);
  });
});
