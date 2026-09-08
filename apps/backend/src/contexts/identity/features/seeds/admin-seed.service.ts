import { Inject, Injectable, Logger } from '@nestjs/common';
import { newId } from '../../../../shared/cqrs/ids.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/password-hasher.js';
import { User } from '../../domain/user.aggregate.js';
import { UserRepository } from '../../domain/user.repository.js';

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
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async seed(email: string, password: string): Promise<AdminSeedOutcome> {
    const existing = await this.users.findByLogin(email);

    if (existing) {
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        existing.updatedAt = new Date();
        await this.users.save(existing);
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
    await this.users.save(user);
    this.logger.log(`Seeded the administrator account ${email}.`);
    return 'created';
  }

  /**
   * Whether the seeded account still has its seeded password. The portal warns
   * while this is true, and it is written to `ops.adminPasswordIsDefault` so the
   * warning survives a page load rather than living in a boot log nobody reads.
   */
  async isStillDefault(email: string, password: string): Promise<boolean> {
    if (password !== DEFAULT_ADMIN_PASSWORD && email !== DEFAULT_ADMIN_EMAIL) return false;
    const user = await this.users.findByLogin(email);
    if (!user?.passwordHash) return false;
    return this.hasher.verify(user.passwordHash, DEFAULT_ADMIN_PASSWORD);
  }

  warnIfDefault(email: string, isDefault: boolean): void {
    if (!isDefault) return;
    this.logger.warn(
      `The administrator account ${email} still has its default password. ` +
        'Change it from the portal (POST /api/v1/auth/password) — this warning repeats every boot until you do.',
    );
  }
}
