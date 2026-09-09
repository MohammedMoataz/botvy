import { Inject, Injectable, Logger } from '@nestjs/common';
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/password-hasher.js';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import { UserRepository } from '../../domain/user.repository.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';

export interface DeleteAccountCommand {
  userId: string;
  /**
   * Required for an account that has one. Deleting everything a member owns on
   * the strength of a token alone is the one irreversible thing a stolen token
   * should not be able to do.
   */
  password?: string;
}

export class AccountNotFound extends Error {
  constructor() {
    super('no such account');
  }
}
export class PasswordRequired extends Error {
  constructor() {
    super('the current password is required to delete an account');
  }
}

/**
 * Deletes a member's account.
 *
 * Soft, on this side: the row stays with `deletedAt` set, so the id keeps
 * resolving. Every Mongo context holds this `userId` as a plain string with no
 * foreign key to tell it the account is gone, and `identity.UserDeleted` is what
 * tells them to purge — a hard delete here would leave them holding rows for an
 * id that resolves to nothing, which is worse than a tombstone.
 *
 * The sessions go immediately rather than waiting for the purge handlers, so a
 * client holding a live refresh token cannot keep the account breathing while
 * its data is being removed underneath it.
 */
@Injectable()
export class DeleteAccountHandler {
  private readonly logger = new Logger(DeleteAccountHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly tokens: RefreshTokenRepository,
  ) {}

  async handle(command: DeleteAccountCommand): Promise<{ deleted: true }> {
    const user = await this.users.findById(command.userId, command.userId);
    if (!user || user.deletedAt !== null) throw new AccountNotFound();

    if (user.passwordHash) {
      if (!command.password) throw new PasswordRequired();
      if (!(await this.hasher.verify(user.passwordHash, command.password))) {
        throw new PasswordRequired();
      }
    }

    // The tombstone, the revocations and `identity.UserDeleted` commit together
    // or not at all. A crash between them is the case that matters most here:
    // the purge handlers key off the event, so a committed tombstone with no
    // event leaves every Mongo context holding rows nobody will ever remove.
    const sessionsEnded = await this.uow.run(async () => {
      user.softDelete();
      await this.users.save(user);
      return this.tokens.revokeAllForUser(user.id);
    });

    this.logger.log(`account ${user.id} deleted; ${sessionsEnded} session(s) ended`);
    return { deleted: true };
  }
}
