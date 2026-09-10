import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { PhotoStore } from '../domain/profile.repository.js';

/** The stored size. Square, because every surface shows it in a circle. */
export const PHOTO_EDGE_PX = 512;

/**
 * Member photos on the `media` volume.
 *
 * Three things happen to an upload before it lands, and each is deliberate:
 *
 * 1. **Re-encoded to WebP at 512².** A phone photo is several megabytes and
 *    4000 px wide; every surface renders it at avatar size. Re-encoding also
 *    means the bytes served are bytes this process produced, so an upload
 *    carrying something that is not an image cannot be served back as one.
 * 2. **EXIF is dropped.** A camera writes GPS coordinates into a photo, and a
 *    profile picture is the most-shared object a member has. `sharp` drops all
 *    metadata unless asked to keep it, which is the behaviour we want and worth
 *    saying out loud.
 * 3. **Named by content hash.** The path changes when the image changes, so a
 *    cached copy is never a stale copy, and re-uploading the same image twice
 *    is idempotent.
 */
@Injectable()
export class FilesystemPhotoStore extends PhotoStore {
  private readonly logger = new Logger(FilesystemPhotoStore.name);
  readonly #root: string;

  constructor(mediaDir: string) {
    super();
    this.#root = resolve(mediaDir, 'photos');
  }

  async put(userId: string, bytes: Buffer): Promise<string> {
    const webp = await sharp(bytes)
      .rotate() // Applies the EXIF orientation before the metadata is dropped.
      .resize(PHOTO_EDGE_PX, PHOTO_EDGE_PX, {
        fit: 'cover',
        position: 'centre',
      })
      .webp({ quality: 82 })
      .toBuffer();

    const hash = createHash('sha256').update(webp).digest('hex').slice(0, 16);
    const path = `${userId}/avatar-${hash}.webp`;
    const target = this.#absolute(path);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, webp);
    return path;
  }

  async remove(path: string): Promise<void> {
    try {
      await rm(this.#absolute(path), { force: true });
    } catch (error) {
      // A photo that will not delete is a disk problem, not a reason to fail
      // the request that replaced it — the profile already points elsewhere.
      this.logger.warn(`could not remove ${path}: ${(error as Error).message}`);
    }
  }

  async read(path: string): Promise<Buffer | null> {
    try {
      return await readFile(this.#absolute(path));
    } catch {
      return null;
    }
  }

  /**
   * Resolves a stored path inside the photo root, and refuses anything that
   * escapes it.
   *
   * The paths here are minted by `put` and never come from a request, so this
   * is defence in depth — but a `../` in a stored path would read and delete
   * arbitrary files on the media volume, and the check costs a line.
   */
  #absolute(path: string): string {
    const target = resolve(join(this.#root, normalize(path)));
    if (target !== this.#root && !target.startsWith(this.#root + sep)) {
      throw new Error(`photo path escapes the media directory: ${path}`);
    }
    return target;
  }
}
