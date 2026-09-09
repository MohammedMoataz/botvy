import { Inject, Injectable, Logger } from '@nestjs/common';
import { newId } from '../../../../shared/cqrs/ids.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/password-hasher.js';
import { User } from '../../domain/user.aggregate.js';
import { UserRepository } from '../../domain/user.repository.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';

export type { PasswordHasher } from '../../domain/password-hasher.js';

/** What ADMIN_EMAIL / ADMIN_PASSWORD fall back to. */
export const DEFAULT_ADMIN_EMAIL = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';

export type AdminSeedOutcome = 'created' | 'promoted' | 'unchanged';

/**
 * Gives a fresh install an account to sign in with. Ported from v1, with its
 * reasoning intact.
 *
 * Before it existed the first account was an ordinary member and had to be
 * promoted with a hand-written UPDATE — a step easy to miss and impossible to
 * perform from the portal, because you could not get into the portal.
 *
 * Two rules it must keep. It is keyed on *this account* existing, not on
 * whether some administrator does: gating on "the database has no admin" meant
 * an install that already had one never got this account, so the documented
 * default credentials did not work there, which is the opposite of a default.
 * And it never resets a password, so a password changed in the portal survives
 * every restart.
 *
 * The consequence worth knowing: deleting this account brings it back on the
 * next boot, because it is a default. Point ADMIN_EMAIL elsewhere if that is
 * not wanted.
 */
@Injectable()
export class AdminSeedService {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async seed(email: string, password: string): Promise<AdminSeedOutcome> {
    const existing = await this.users.findByLogin(email);

    if (existing) {
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        existing.updatedAt = new Date();
        await this.uow.run(() => this.users.save(existing));
        this.logger.log(`Promoted ${email} to administrator.`);
        return 'promoted';
      }
      // Password left exactly as it is. A change made in the portal has to stick.
      return 'unchanged';
    }

    const now = new Date();
    const user = User.register({
      id: newId(),
      email,
      displayName: 'Owner',
      passwordHash: await this.hasher.hash(password),
      googleSub: null,
      role: 'admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    // The seeded administrator raises `identity.UserRegistered` like anybody
    // else, and Profile's bootstrap hangs off it. Without the transaction the
    // row and the event are two statements, so a crash on a first boot would
    // leave the Owner with an account and no profile - and the seed never runs
    // again, because it finds the account and takes the no-op exit.
    await this.uow.run(() => this.users.save(user));
    this.logger.log(`Seeded the administrator account ${email}.`);
    return 'created';
  }

  /**
   * Whether the seeded account still has its seeded password.
   *
   * P0 only logs it. The registry holds a read-only `ops.adminPasswordIsDefault`
   * for the portal to read so the warning survives a page load rather than
   * living in a boot log nobody opens, and the code that writes that key lands
   * with the portal in `specs/015-identity-profile` (T118). Saying it was
   * written here, as this comment used to, is how a capability every phase
   * credits to another phase ends up built by none of them.
   */
  warnIfDefault(email: string, isDefault: boolean): void {
    if (!isDefault) return;
    this.logger.warn(
      `The administrator account ${email} still has its default password. ` +
        'The endpoint that changes it (POST /api/v1/auth/password) arrives with sign-in in P1; ' +
        'until then this warning repeats every boot.',
    );
  }
}
