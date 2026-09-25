/**
 * Where an attachment's bytes live, and how a client is told to fetch them.
 *
 * Neither store holds file bytes — a profile records a *key* and the bytes sit
 * behind this port — so the platform has a storage provider the way it has a
 * repository per store: one adapter per place the bytes can be. Today that is
 * the `media` volume on the owner's machine; an object store (Supabase Storage,
 * phase 029) is a second adapter and nothing else changes.
 *
 * `url()` is the promise that makes the seam real. A client is never handed a
 * key or a path, it is handed a URL it can put in an `<img>` without a session
 * — for the filesystem adapter a signed route on this API, for an object store
 * whatever it mints — so the day the adapter changes, no client notices.
 */
export abstract class StorageProvider {
  /** Stores the bytes under `key`, replacing whatever was there. */
  abstract put(key: string, bytes: Buffer): Promise<void>;
  abstract remove(key: string): Promise<void>;
  /** `null` for a key nothing stored — a missing file is an answer, not a fault. */
  abstract read(key: string): Promise<Buffer | null>;
  /** A URL a client can load the file from with no credentials of its own. */
  abstract url(key: string): string;
}
