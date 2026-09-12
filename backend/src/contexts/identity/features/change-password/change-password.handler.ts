import { Inject, Injectable } from '@nestjs/common';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../domain/password-hasher.js';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.js';
import { MIN_PASSWORD_LENGTH } from '../../domain/password-rules.js';
import { UserRepository } from '../../domain/user.repository.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';

export interface ChangePasswordCommand {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export { MIN_PASSWORD_LENGTH };

export class CurrentPasswordWrong extends Error {
  constructor() {
    super('the current password is incorrect');
  }
}

export class NewPasswordTooShort extends Error {
  constructor() {
    super(
      `the new password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

export class NewPasswordUnchanged extends Error {
  constructor() {
    super('the new password is the same as the current one');
  }
}

/**
 * Change your own password.
 *
 * Requires the current one even though the caller is already authenticated: a
 * stolen access token should not be enough to lock the owner out of their own
 * account, which is the whole point of asking again.
 *
 * The aggregate raises `identity.PasswordChanged`, and the repository writes it
 * to `identity_outbox` in the same transaction as the new hash — so a crash
 * between the two cannot leave the event unsent or the password unchanged.
 */
@Injectable()
export class ChangePasswordHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly tokens: RefreshTokenRepository,
  ) {}

  async handle(
    command: ChangePasswordCommand,
  ): Promise<{ changed: true; sessionsEnded: number }> {
    const user = await this.users.findById(command.userId, command.userId);
    if (!user?.passwordHash) throw new CurrentPasswordWrong();

    if (
      !(await this.hasher.verify(user.passwordHash, command.currentPassword))
    ) {
      throw new CurrentPasswordWrong();
    }
    if (command.newPassword.length < MIN_PASSWORD_LENGTH)
      throw new NewPasswordTooShort();
    if (command.newPassword === command.currentPassword)
      throw new NewPasswordUnchanged();

    // Hashed outside the transaction, for the same reason as `register`.
    const nextHash = await this.hasher.hash(command.newPassword);

    return this.uow.run(async () => {
      user.passwordHash = nextHash;
      user.recordPasswordChanged(true);
      await this.users.save(user);

      // Every session, including this caller's. The point of changing a
      // password is that access obtained with the old one ends, and a member
      // who changes it because they think someone else has it would otherwise
      // leave that someone signed in for another thirty days.
      //
      // In the same transaction as the new hash: a crash between the two would
      // otherwise leave the old sessions alive against the new password.
      const sessionsEnded = await this.tokens.revokeAllForUser(user.id);

      return { changed: true, sessionsEnded };
    });
  }
}
