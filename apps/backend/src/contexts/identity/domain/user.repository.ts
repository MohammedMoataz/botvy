import type { User } from './user.aggregate.js';

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
}
