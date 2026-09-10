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

  /**
   * The batched read, added for P3's rhythm tick.
   *
   * It is a separate method rather than a loop over `find` at the call site
   * because the caller is a job that runs over *every* member: the tick asks
   * what time it is for each of them on a five-minute pulse, and the phase's
   * performance goal is a pass in under ten seconds when nobody is due. One
   * `find` per member is one round trip per member — five hundred members
   * against two collections is a thousand round trips, and a round trip is the
   * expensive part, not the query. The `$in` form is two.
   *
   * Missing ids are simply absent from the result; the order is not promised,
   * because neither store gives one for an `$in` and a caller that relied on it
   * would be relying on an accident. `schedulesFor` indexes what comes back and
   * fills the gaps, which is where the "every id gets an answer" promise lives.
   */
  abstract findMany(userIds: string[]): Promise<Profile[]>;

  abstract save(profile: Profile): Promise<void>;
  abstract remove(userId: string): Promise<boolean>;
}

export abstract class PreferencesRepository {
  abstract find(userId: string): Promise<Preferences | null>;

  /** Same batched read, same reasoning as `ProfileRepository.findMany`. */
  abstract findMany(userIds: string[]): Promise<Preferences[]>;

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
