import type { Model } from 'mongoose';
import {
  LinkPreviewCache,
  type CachedPreview,
  type LinkPreview,
} from '../domain/link-preview.ports.js';

export interface LinkPreviewDoc {
  _id: string;
  preview: LinkPreview | null;
  fetchedAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

/**
 * `link_previews`, written with a bare upsert: a cache row has no aggregate,
 * no owner and no lost update worth guarding. `expiresAt` is filtered on here
 * and carries a TTL index (migration `20261008000000`), so an expired row is
 * neither served nor kept.
 */
export class MongoLinkPreviewCache extends LinkPreviewCache {
  constructor(private readonly model: Model<LinkPreviewDoc>) {
    super();
  }

  async get(key: string, now: Date): Promise<CachedPreview | null> {
    const row = await this.model
      .findOne({ _id: key, expiresAt: { $gt: now } })
      .lean<LinkPreviewDoc>()
      .exec();
    return row ? { preview: row.preview ?? null } : null;
  }

  async put(
    key: string,
    entry: CachedPreview & { fetchedAt: Date; expiresAt: Date },
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: key },
        {
          $set: {
            preview: entry.preview,
            fetchedAt: entry.fetchedAt,
            expiresAt: entry.expiresAt,
            updatedAt: entry.fetchedAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }
}

/** For the handler spec. */
export class InMemoryLinkPreviewCache extends LinkPreviewCache {
  readonly rows = new Map<
    string,
    CachedPreview & { fetchedAt: Date; expiresAt: Date }
  >();

  async get(key: string, now: Date): Promise<CachedPreview | null> {
    const row = this.rows.get(key);
    return row && row.expiresAt > now ? { preview: row.preview } : null;
  }

  async put(
    key: string,
    entry: CachedPreview & { fetchedAt: Date; expiresAt: Date },
  ): Promise<void> {
    this.rows.set(key, entry);
  }
}
