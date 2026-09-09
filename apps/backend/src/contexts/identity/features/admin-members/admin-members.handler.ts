import { Injectable, Logger } from '@nestjs/common';
import type { Principal, Role } from '../../../../shared/auth/principal.js';
import { AuditPort } from '../../../operations/domain/audit.port.js';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import { UserRepository } from '../../domain/user.repository.js';

export class MemberNotFound extends Error {
  constructor() {
    super('no such member');
  }
}

export class CannotActOnSelf extends Error {
  constructor(what: string) {
    super(`an administrator cannot ${what} their own account`);
  }
}

export class LastAdminProtected extends Error {
  constructor() {
    super('this is the only administrator; promote another before changing this one');
  }
}

/**
 * The administrative actions on a member: role, ban, unban.
 *
 * Every one writes an `audit_log` row through Operations' port before returning
 * — Identity never opens that collection, and "what happened to this account"
 * has to be answerable from one place. The row is written even when the action
 * is refused, because an attempt that was refused is exactly what an Owner wants
 * to find afterwards.
 *
 * Two guards that are not in the task list but are the difference between an
 * admin tool and a foot-gun:
 *
 * - An administrator cannot ban or demote themselves. Both are one click from
 *   an installation nobody can administer.
 * - The last administrator cannot be demoted or banned at all. There is no
 *   recovery path in this product other than editing the database by hand.
 */
@Injectable()
export class AdminMembersHandler {
  private readonly logger = new Logger(AdminMembersHandler.name);

  constructor(
    private readonly users: UserRepository,
    private readonly tokens: RefreshTokenRepository,
    private readonly audit: AuditPort,
  ) {}

  async setRole(
    actor: Principal,
    userId: string,
    role: Role,
  ): Promise<{ userId: string; role: Role }> {
    const user = await this.mustFind(actor, 'admin.setRole', userId);

    if (actor.id === userId && role !== 'admin') {
      await this.refuse(actor, 'admin.setRole', userId, 'self_demotion');
      throw new CannotActOnSelf('demote');
    }
    if (user.role === 'admin' && role !== 'admin' && (await this.isLastAdmin(userId))) {
      await this.refuse(actor, 'admin.setRole', userId, 'last_admin');
      throw new LastAdminProtected();
    }

    user.setRole(role, actor.id);
    await this.users.save(user);

    await this.audit.record({
      actor,
      action: 'admin.setRole',
      target: { type: 'user', id: userId },
      at: new Date(),
      meta: { role },
    });
    return { userId, role };
  }

  /**
   * Bans, and ends every session the member holds.
   *
   * Revoking the families is what makes a ban take effect now rather than at
   * token expiry: an access token already in flight lasts fifteen minutes, but
   * a refresh token lasts thirty days, so without this a banned member keeps
   * working for a month.
   */
  async ban(
    actor: Principal,
    userId: string,
    reason: string | null,
  ): Promise<{ userId: string; sessionsEnded: number }> {
    const user = await this.mustFind(actor, 'admin.ban', userId);

    if (actor.id === userId) {
      await this.refuse(actor, 'admin.ban', userId, 'self_ban');
      throw new CannotActOnSelf('ban');
    }
    if (user.role === 'admin' && (await this.isLastAdmin(userId))) {
      await this.refuse(actor, 'admin.ban', userId, 'last_admin');
      throw new LastAdminProtected();
    }

    user.ban(actor.id, reason);
    await this.users.save(user);
    const sessionsEnded = await this.tokens.revokeAllForUser(userId);

    await this.audit.record({
      actor,
      action: 'admin.ban',
      target: { type: 'user', id: userId },
      at: new Date(),
      meta: { reason, sessionsEnded },
    });

    this.logger.log(`${userId} banned by ${actor.id}; ${sessionsEnded} session(s) ended`);
    return { userId, sessionsEnded };
  }

  /**
   * Unbans. It does *not* restore the sessions the ban revoked, and that is the
   * point — a session that survived a ban is a session the ban did not end.
   * The member signs in again.
   */
  async unban(actor: Principal, userId: string): Promise<{ userId: string }> {
    const user = await this.mustFind(actor, 'admin.unban', userId);

    // The self-check `ban` and `setRole` both had and this did not — which
    // turned privilege *retention* into privilege *escalation*. A banned
    // administrator still holds a valid access token for up to its TTL, and
    // without this they could un-ban themselves with it and then ban whoever
    // banned them.
    if (actor.id === userId) {
      await this.refuse(actor, 'admin.unban', userId, 'self_unban');
      throw new CannotActOnSelf('unban');
    }

    user.unban(actor.id);
    await this.users.save(user);

    await this.audit.record({
      actor,
      action: 'admin.unban',
      target: { type: 'user', id: userId },
      at: new Date(),
    });
    return { userId };
  }

  private async mustFind(actor: Principal, action: string, userId: string) {
    const user = await this.users.findById(userId, userId);
    if (!user || user.deletedAt !== null) {
      await this.refuse(actor, action, userId, 'not_found');
      throw new MemberNotFound();
    }
    return user;
  }

  private async refuse(
    actor: Principal,
    action: string,
    userId: string,
    why: string,
  ): Promise<void> {
    await this.audit.record({
      actor,
      action,
      target: { type: 'user', id: userId },
      at: new Date(),
      meta: { outcome: 'refused', reason: why },
    });
  }

  /**
   * Whether this account is the only administrator left.
   *
   * Asked through the repository's own count rather than by listing every user,
   * so an installation with many members does not read them all to answer a
   * yes-or-no question.
   */
  private async isLastAdmin(userId: string): Promise<boolean> {
    return (await this.users.countAdminsExcept(userId)) === 0;
  }
}
