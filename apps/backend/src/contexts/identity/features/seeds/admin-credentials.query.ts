import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../../../shared/config/config.module.js';
import type { Env } from '../../../../shared/config/env.schema.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/password-hasher.js';
import { UserRepository } from '../../domain/user.repository.js';
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from './admin-seed.service.js';

/**
 * Whether the seeded administrator still has the password this project ships.
 *
 * A query, and separate from `AdminSeedService`, because it is the one thing
 * about the seed another context needs to know: Operations turns the answer
 * into `ops.adminPasswordIsDefault`, which is what makes the portal warn on
 * every page load rather than once in a boot log nobody reads.
 *
 * The seed itself is a *feature service*, and a feature is private to its
 * context. `OperationsBootstrap` was importing it directly — Operations
 * reaching into Identity's `features/`, which is what constitution IX means by
 * a context talking to another context's internals rather than its published
 * surface. A `*.query.ts` handler *is* that surface: `DevicesQueryHandler` is
 * how the alert path already asks Identity which phones an administrator has.
 *
 * It reads the environment itself rather than taking the address and password
 * as arguments. Which account is the seeded one is Identity's fact, and a
 * caller that has to pass `ADMIN_PASSWORD` in order to ask a question about it
 * is a caller holding a credential it has no use for.
 */
@Injectable()
export class AdminCredentialsQueryHandler {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async seededAdminIsStillDefault(): Promise<boolean> {
    const email = this.env.ADMIN_EMAIL;

    // An operator who changed *both* the address and the password in `.env` is
    // not running the shipped default, whatever is in the database. Changing
    // only one of them is not enough: the published pair is what makes this
    // installation reachable by anybody who read SETUP.md.
    if (this.env.ADMIN_PASSWORD !== DEFAULT_ADMIN_PASSWORD && email !== DEFAULT_ADMIN_EMAIL) {
      return false;
    }

    const user = await this.users.findByLogin(email);
    if (!user?.passwordHash) return false;

    // Verified against the stored hash rather than compared to the environment.
    // The seed never resets an existing password, so a password changed in the
    // portal is the case that matters most here - and `.env` still says
    // `admin` on every one of those installations.
    return this.hasher.verify(user.passwordHash, DEFAULT_ADMIN_PASSWORD);
  }
}
