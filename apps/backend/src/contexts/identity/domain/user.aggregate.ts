import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import type { Role } from '../../../shared/auth/principal.js';

export type UserStatus = 'active' | 'banned';

export interface UserState {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string | null;
  googleSub: string | null;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
}

/**
 * A member. P0 ships the aggregate and its store so the seeded administrator
 * exists and `me` can answer; the commands that change it — register, sign in,
 * change password, ban — arrive with P1.
 *
 * `userId` is its own id: Identity is the one context whose aggregate *is* the
 * member, and the base class scopes everything else by the member it belongs to.
 */
export class User extends AggregateRoot<string> {
  readonly id: string;
  email: string;
  displayName: string | null;
  passwordHash: string | null;
  googleSub: string | null;
  role: Role;
  status: UserStatus;
  readonly createdAt: Date;
  lastLoginAt: Date | null;
  deletedAt: Date | null;

  private constructor(state: UserState) {
    super();
    this.id = state.id;
    this.email = state.email;
    this.displayName = state.displayName;
    this.passwordHash = state.passwordHash;
    this.googleSub = state.googleSub;
    this.role = state.role;
    this.status = state.status;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.lastLoginAt = state.lastLoginAt;
    this.deletedAt = state.deletedAt;
  }

  get userId(): string {
    return this.id;
  }

  /** Rehydration from the store. Raises nothing: reading is not an event. */
  static rehydrate(state: UserState): User {
    return new User(state);
  }

  /**
   * A new member. The event is what every Mongo context hangs its own
   * bootstrap off — the default profile and preferences, the pinned coach and
   * planner conversations, the rhythm state row, the empty athlete profile.
   */
  static register(state: Omit<UserState, 'deletedAt' | 'lastLoginAt'>): User {
    const user = new User({ ...state, lastLoginAt: null, deletedAt: null });
    user.raise('identity.UserRegistered', 'user', {
      email: state.email,
      locale: null,
      timezone: null,
    });
    return user;
  }

  recordPasswordChanged(bySelf: boolean, at: Date = new Date()): void {
    this.updatedAt = at;
    this.raise('identity.PasswordChanged', 'user', { bySelf }, at);
  }

  recordSignIn(at: Date = new Date()): void {
    this.lastLoginAt = at;
    this.updatedAt = at;
  }

  get isActive(): boolean {
    return this.status === 'active' && this.deletedAt === null;
  }
}
