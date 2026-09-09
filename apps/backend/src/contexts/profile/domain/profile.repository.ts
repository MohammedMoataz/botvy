import type { Preferences } from './preferences.aggregate.js';
import type { Profile } from './profile.aggregate.js';

/**
 * Two ports rather than one, because they are two aggregates with two
 * lifetimes: a member patches their preferences without touching their profile,
 * and the events the two raise are consumed by different contexts.
 *
 * Both are keyed by `userId` alone. There is one of each per account, and
 * `userId` here is the PostgreSQL uuid as a string — Identity owns the account,
 * this context owns what the member said about themselves.
 */
export abstract class ProfileRepository {
  abstract find(userId: string): Promise<Profile | null>;
  abstract save(profile: Profile): Promise<void>;
  abstract remove(userId: string): Promise<boolean>;
}

export abstract class PreferencesRepository {
  abstract find(userId: string): Promise<Preferences | null>;
  abstract save(preferences: Preferences): Promise<void>;
  abstract remove(userId: string): Promise<boolean>;
}

/**
 * Where a member's photo lives.
 *
 * A port because the bytes are not in either store: they are on the `media`
 * volume, and the purge handler has to be able to delete them without knowing
 * that. An installation that later serves photos from object storage replaces
 * this adapter and nothing else.
 */
export abstract class PhotoStore {
  /**
   * Returns the stored path, which is what the profile records.
   *
   * No mime type: every adapter sniffs the format from the bytes and re-encodes
   * anyway, so a declared parameter nobody reads would be a signature that
   * lies. The *accepted* types are the handler's rule, checked before the bytes
   * ever reach a store.
   */
  abstract put(userId: string, bytes: Buffer): Promise<string>;
  abstract remove(path: string): Promise<void>;
  abstract read(path: string): Promise<Buffer | null>;
}
