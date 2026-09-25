import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { signMediaUrl } from '../media/media.signing.js';
import { LocalFilesController } from './local-files.controller.js';
import { StorageProvider } from './storage.provider.js';

/**
 * The route that serves a file the filesystem provider holds.
 *
 * The URL a client is handed for an attachment is a capability, exactly like
 * an article's proxied image: a key plus a signature only this installation
 * could have minted, on a public route so an `<img>` can load it. Three things
 * to get right — a signed key is served as the right type and cached for ever,
 * a key with a wrong signature is refused without saying whether it exists,
 * and a signed key nobody stored is a plain 404.
 */

const SECRET = 'a-media-signing-secret-long-enough';
const env = { MEDIA_SIGNING_SECRET: SECRET } as unknown as Env;

class StubStorage extends StorageProvider {
  readonly files = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer): Promise<void> {
    this.files.set(key, bytes);
  }
  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
  async read(key: string): Promise<Buffer | null> {
    return this.files.get(key) ?? null;
  }
  url(key: string): string {
    return `/media/files?key=${encodeURIComponent(key)}&sig=${signMediaUrl(key, SECRET)}`;
  }
}

function recorder() {
  const state = {
    status: 200,
    headers: {} as Record<string, string>,
    body: undefined as Buffer | undefined,
    ended: false,
  };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return response;
    },
    end(body?: Buffer) {
      state.body = body;
      state.ended = true;
    },
  };
  return { state, response };
}

describe('GET /media/files', () => {
  const storage = new StubStorage();
  const key = 'photos/user-1/avatar-abc123.webp';
  const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]);
  storage.files.set(key, bytes);
  const controller = new LocalFilesController(env, storage);

  it('serves a signed key as its type, immutable', async () => {
    const { state, response } = recorder();
    await controller.serve(key, signMediaUrl(key, SECRET), response as never);
    expect(state.status).toBe(200);
    expect(state.body).toEqual(bytes);
    expect(state.headers['content-type']).toBe('image/webp');
    expect(state.headers['cache-control']).toContain('immutable');
  });

  it('refuses a wrong signature as a bad request, not as forbidden', async () => {
    const { response } = recorder();
    await expect(
      controller.serve(
        key,
        signMediaUrl('another-key', SECRET),
        response as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a request with no key or no signature', async () => {
    const { response } = recorder();
    await expect(
      controller.serve('', '', response as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('answers 404 for a signed key nothing stored', async () => {
    const { response } = recorder();
    const missing = 'photos/user-1/avatar-gone.webp';
    await expect(
      controller.serve(
        missing,
        signMediaUrl(missing, SECRET),
        response as never,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('the provider mints the URL the route accepts', async () => {
    const url = new URL(storage.url(key), 'http://botvy.test');
    expect(url.pathname).toBe('/media/files');
    const { state, response } = recorder();
    await controller.serve(
      url.searchParams.get('key') ?? '',
      url.searchParams.get('sig') ?? '',
      response as never,
    );
    expect(state.status).toBe(200);
  });
});
