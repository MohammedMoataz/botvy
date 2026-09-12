import { Inject, Injectable } from '@nestjs/common';
import { newId } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../domain/password-hasher.js';
import { MIN_PASSWORD_LENGTH } from '../../domain/password-rules.js';
import { User } from '../../domain/user.aggregate.js';
import { UserRepository } from '../../domain/user.repository.js';

export interface RegisterCommand {
  email: string;
  password: string;
  passwordConfirm: string;
  displayName?: string;
  locale?: string;
  timezone?: string;
}

export interface Registered {
  userId: string;
  email: string;
}

export class RegistrationClosed extends Error {
  constructor() {
    super('registration is closed on this installation');
  }
}
export class PasswordsDoNotMatch extends Error {
  constructor() {
    super('the two passwords do not match');
  }
}
export class PasswordTooShort extends Error {
  constructor() {
    super(`the password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}
export class EmailAlreadyRegistered extends Error {
  constructor() {
    super('an account with that email already exists');
  }
}

/**
 * Creates a member.
 *
 * Gated on `auth.registrationOpen`, a settings key rather than an environment
 * variable, so the Owner can close registration from the portal without a
 * redeploy. Asked on every attempt rather than read once at construction —
 * `SettingsService` owns the caching, and it drops its entry when the key is
 * written, so a closed installation stops accepting sign-ups immediately rather
 * than at the next restart.
 *
 * The confirmation field is checked here as well as in the client. The client's
 * check is for the person who mistyped; this one is for every caller that is not
 * the client.
 *
 * `identity.UserRegistered` is what the Mongo contexts hang their own bootstrap
 * off — the default profile and preferences, the pinned conversations, the
 * rhythm row. It goes to `identity_outbox` in the same transaction as the row.
 */
@Injectable()
export class RegisterHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly settings: SettingsService,
  ) {}

  async handle(command: RegisterCommand): Promise<Registered> {
    if (!(await this.settings.get('auth.registrationOpen')))
      throw new RegistrationClosed();

    if (command.password !== command.passwordConfirm)
      throw new PasswordsDoNotMatch();
    if (command.password.length < MIN_PASSWORD_LENGTH)
      throw new PasswordTooShort();

    const email = command.email.trim().toLowerCase();

    // Before the transaction: scrypt takes long enough to matter against
    // Prisma's interactive-transaction timeout, and holding a transaction open
    // across it would serialise sign-ups behind each other's key derivation.
    const passwordHash = await this.hasher.hash(command.password);

    return this.uow.run(async () => {
      if (await this.users.findByLogin(email))
        throw new EmailAlreadyRegistered();

      const now = new Date();
      const user = User.register(
        {
          id: newId(),
          email,
          displayName: command.displayName?.trim() || null,
          passwordHash,
          googleSub: null,
          role: 'user',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
        { locale: command.locale ?? null, timezone: command.timezone ?? null },
      );

      await this.users.save(user);
      return { userId: user.id, email: user.email };
    });
  }
}
