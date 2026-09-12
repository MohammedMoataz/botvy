export interface StoredSetting {
  key: string;
  value: unknown;
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * Where settings live. A port so the service can be specified without a
 * database: the rules worth testing here are validation, the read-only refusal
 * and the cache, none of which are about Mongo.
 *
 * Documents are created lazily on first write; a key never written reads its
 * registry default, which is why an operator sees a full registry on a fresh
 * install rather than an empty screen.
 */
export abstract class SettingsStore {
  abstract get(key: string): Promise<StoredSetting | null>;
  abstract getMany(keys: string[]): Promise<StoredSetting[]>;
  abstract set(key: string, value: unknown, updatedBy: string | null): Promise<StoredSetting>;
}
