import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { StorageProvider } from '../../../shared/storage/storage.provider.js';
import { PhotoStore } from '../domain/profile.repository.js';

/** The stored size. Square, because every surface shows it in a circle. */
export const PHOTO_EDGE_PX = 512;

/** Where photos sit inside whatever the storage provider is. */
const PREFIX = 'photos/';

/**
 * Member photos, behind the platform's storage provider.
 *
 * This adapter owns the *policy* — what a photo becomes before it is kept —
 * and the provider owns the bytes, so moving photos to an object store is a
 * different provider and not a change here. Three things happen to an upload
 * and each is deliberate:
 *
 * 1. **Re-encoded to WebP at 512².** A phone photo is several megabytes and
 *    4000 px wide; every surface renders it at avatar size. Re-encoding also
 *    means the bytes served are bytes this process produced, so an upload
 *    carrying something that is not an image cannot be served back as one.
 * 2. **EXIF is dropped.** A camera writes GPS coordinates into a photo, and a
 *    profile picture is the most-shared object a member has. `sharp` drops all
 *    metadata unless asked to keep it, which is the behaviour we want and worth
 *    saying out loud.
 * 3. **Named by content hash.** The key changes when the image changes, so a
 *    cached copy is never a stale copy, re-uploading the same image twice is
 *    idempotent, and the URL the client is handed can be cached for ever.
 */
@Injectable()
export class StoredPhotoStore extends PhotoStore {
  constructor(private readonly storage: StorageProvider) {
    super();
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
    const key = `${PREFIX}${userId}/avatar-${hash}.webp`;
    await this.storage.put(key, webp);
    return key;
  }

  async remove(path: string): Promise<void> {
    await this.storage.remove(key(path));
  }

  async read(path: string): Promise<Buffer | null> {
    return this.storage.read(key(path));
  }

  url(path: string): string {
    return this.storage.url(key(path));
  }
}

/**
 * A profile written before the storage provider existed records the path
 * relative to the photos directory (`<userId>/avatar-<hash>.webp`); one
 * written since records the full key. Both reach the same file.
 */
function key(path: string): string {
  return path.startsWith(PREFIX) ? path : `${PREFIX}${path}`;
}
