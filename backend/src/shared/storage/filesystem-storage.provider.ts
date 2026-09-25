import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { signMediaUrl } from '../media/media.signing.js';
import { StorageProvider } from './storage.provider.js';

/** The route `LocalFilesController` answers on; the URL is `key` + signature. */
export const LOCAL_FILES_PATH = '/media/files';

/**
 * Attachments on the `media` volume, served back by this API.
 *
 * The URL it mints is a capability, exactly like an article's proxied image:
 * the key and an HMAC over it under `MEDIA_SIGNING_SECRET`, on a public route.
 * No expiry, for the reason `media.signing.ts` gives — a single-household box
 * gains nothing from one and an old profile would lose its picture.
 */
@Injectable()
export class FilesystemStorageProvider extends StorageProvider {
  private readonly logger = new Logger(FilesystemStorageProvider.name);
  readonly #root: string;
  readonly #secret: string;

  constructor(root: string, secret: string) {
    super();
    this.#root = resolve(root);
    this.#secret = secret;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const target = this.#absolute(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(this.#absolute(key), { force: true });
    } catch (error) {
      // A file that will not delete is a disk problem, not a reason to fail
      // the request that replaced it — the row already points elsewhere.
      this.logger.warn(`could not remove ${key}: ${(error as Error).message}`);
    }
  }

  async read(key: string): Promise<Buffer | null> {
    const target = this.#absolute(key);
    try {
      return await readFile(target);
    } catch {
      return null;
    }
  }

  url(key: string): string {
    return `${LOCAL_FILES_PATH}?key=${encodeURIComponent(key)}&sig=${signMediaUrl(key, this.#secret)}`;
  }

  /**
   * Resolves a key inside the root, and refuses anything that escapes it.
   *
   * Keys are minted by adapters and never come from a request, so this is
   * defence in depth — but a `../` in a stored key would read and delete
   * arbitrary files on the volume, and the check costs a line.
   */
  #absolute(key: string): string {
    const target = resolve(join(this.#root, normalize(key)));
    if (target !== this.#root && !target.startsWith(this.#root + sep)) {
      throw new Error(`storage key escapes the media directory: ${key}`);
    }
    return target;
  }
}
