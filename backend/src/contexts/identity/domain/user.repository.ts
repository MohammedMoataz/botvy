import type { Role } from '../../../shared/auth/principal.js';
import type { User } from './user.aggregate.js';

export interface MemberSearch {
  /** Matches the email or the display name, case-insensitively. */
  query?: string;
  status?: 'active' | 'banned';
  role?: Role;
  limit: number;
  /** The id after which to continue, from a previous page's `nextCursor`. */
  cursor?: string;
}

export interface MemberSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
  status: 'active' | 'banned';
  createdAt: Date;
  lastLoginAt: Date | null;
  deviceCount: number;
}

export interface MemberPage {
  members: MemberSummary[];
  nextCursor: string | null;
}

/**
 * Identity's write side. `findByLogin` takes the thing a member typed — an
 * email today, a Google subject in P1 — rather than exposing a query language,
 * so the shape of a sign-in lookup stays inside the context that owns it.
 */
export abstract class UserRepository {
  abstract findById(userId: string, id: string): Promise<User | null>;
  abstract findByLogin(email: string): Promise<User | null>;
  abstract save(user: User): Promise<void>;
  abstract remove(user: User): Promise<void>;

  /** Used by the admin seed to decide whether there is anything to create. */
  abstract countAll(): Promise<number>;

  /**
   * How many active administrators there are other than this one.
   *
   * A count rather than a listing, so the "is this the last admin" guard does
   * not read every member to answer a yes-or-no question — and the guard is
   * worth having, because this product has no recovery path from an
   * installation with no administrator except editing the database by hand.
   */
  abstract countAdminsExcept(userId: string): Promise<number>;

  /** Admin listing: search by email or name, newest first, cursor by id. */
  abstract search(criteria: MemberSearch): Promise<MemberPage>;

  /**
   * Addresses for a handful of ids, for a screen that has to name people.
   *
   * A map rather than a list, and ids it cannot find are simply absent — the
   * caller is the audit page, where a **deleted member's acts remain in the
   * trail** and the id is the honest fallback. Throwing, or returning a row
   * with an empty email, would make the one page that answers "who did this"
   * unable to.
   *
   * Deleted members are included deliberately, unlike `search`: the question
   * here is who acted, not who is on the books.
   */
  abstract labelsByIds(ids: string[]): Promise<Record<string, string>>;
}
