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
 * A member.
 *
 * Every state change is a method here that raises its own event, rather than a
 * handler reaching in and assigning fields. That is what keeps the rules in one
 * place — a ban that forgets to raise `identity.UserBanned` leaves the Mongo
 * contexts still serving the member's data, and the only way to be sure the
 * event and the change travel together is for the aggregate to own both.
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
  static register(
    state: Omit<UserState, 'deletedAt' | 'lastLoginAt'>,
    /**
     * What the member told us while signing up, if anything. It rides on the
     * event because Profile's bootstrap prefers it over the registry defaults,
     * and the alternative — Profile asking Identity afterwards — is a query
     * across a store boundary for a value that was in hand at the time.
     */
    supplied: { locale?: string | null; timezone?: string | null } = {},
  ): User {
    const user = new User({ ...state, lastLoginAt: null, deletedAt: null });
    user.raise('identity.UserRegistered', 'user', {
      email: state.email,
      locale: supplied.locale ?? null,
      timezone: supplied.timezone ?? null,
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

  /**
   * Attaches a Google identity to an existing account.
   *
   * Refused when a different subject is already linked. Overwriting it would
   * silently transfer the account to whoever signed in second, and the member
   * whose address it was would find themselves locked out with nothing in the
   * log to explain it.
   */
  linkGoogle(googleSub: string, at: Date = new Date()): void {
    if (this.googleSub !== null && this.googleSub !== googleSub) {
      throw new GoogleAlreadyLinked();
    }
    if (this.googleSub === googleSub) return;

    this.googleSub = googleSub;
    this.updatedAt = at;
    this.raise('identity.GoogleLinked', 'user', { googleSub }, at);
  }

  /**
   * Bans a member. The event is what the other contexts react to; the status is
   * what this context refuses future sign-ins on.
   *
   * Idempotent, because an admin clicking twice must not raise the event twice
   * and make a consumer count two bans.
   */
  ban(by: string, reason: string | null = null, at: Date = new Date()): void {
    if (this.status === 'banned') return;

    this.status = 'banned';
    this.updatedAt = at;
    this.raise('identity.UserBanned', 'user', { by, reason }, at);
  }

  unban(by: string, at: Date = new Date()): void {
    if (this.status !== 'banned') return;

    this.status = 'active';
    this.updatedAt = at;
    // Note what unbanning does *not* do: it does not restore the refresh
    // families the ban revoked. Those are gone deliberately — a session that
    // survived a ban is a session the ban did not end.
    this.raise('identity.UserUnbanned', 'user', { by }, at);
  }

  /** Promotion and demotion are one command, because they are one decision. */
  setRole(role: Role, by: string, at: Date = new Date()): void {
    if (this.role === role) return;

    const from = this.role;
    this.role = role;
    this.updatedAt = at;
    this.raise('identity.RoleChanged', 'user', { from, to: role, by }, at);
  }

  /**
   * Soft delete. The row stays so the id keeps resolving — every Mongo context
   * holds this `userId` as a string with no foreign key to tell it the account
   * is gone, and the event is what tells them to purge.
   */
  softDelete(at: Date = new Date()): void {
    if (this.deletedAt !== null) return;

    this.deletedAt = at;
    this.updatedAt = at;
    this.raise('identity.UserDeleted', 'user', { email: this.email }, at);
  }

  get isActive(): boolean {
    return this.status === 'active' && this.deletedAt === null;
  }
}

export class GoogleAlreadyLinked extends Error {
  constructor() {
    super('this account is already linked to a different Google identity');
  }
}
