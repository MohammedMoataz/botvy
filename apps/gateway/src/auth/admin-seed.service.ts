import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';

/** What ADMIN_EMAIL / ADMIN_PASSWORD fall back to. */
export const DEFAULT_ADMIN_EMAIL = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';

/**
 * Gives a fresh install an admin account to log in with.
 *
 * Before this, the first account was an ordinary user and had to be promoted
 * with a hand-written `UPDATE users SET role='admin'` — a step easy to miss and
 * impossible to do from the admin portal itself, since you could not get in.
 *
 * It creates the account named by `ADMIN_EMAIL` when that account does not
 * exist, and promotes it if it exists as an ordinary user. It never resets a
 * password and never demotes anyone, so changing the password in the portal
 * sticks and nothing done there is undone by a restart.
 *
 * The consequence worth knowing: deleting this account brings it back on the
 * next boot, because it is a *default*. Point `ADMIN_EMAIL` somewhere else if
 * that is not wanted.
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('ADMIN_EMAIL')!;
    const password = this.config.get<string>('ADMIN_PASSWORD')!;

    try {
      await this.seed(email, password);
    } catch (err) {
      // A gateway that will not start is worse than one with no seeded admin:
      // every other feature still works, and the account can be made by hand.
      this.logger.error(`Could not seed the admin account: ${String(err)}`);
      return;
    }

    this.warnIfDefault(email, password);
  }

  private async seed(email: string, password: string) {
    // Keyed on the account existing, not on whether *some* admin does. Gating
    // on "the database has no admin" meant an install that already had one
    // never got this account, so the documented default credentials simply did
    // not work there — which is the opposite of a default.
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Already here. Its password is left exactly as it is, so changing it
      // sticks across restarts instead of being reset back to the default.
      if (existing.role !== 'admin') {
        await this.prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
        this.logger.log(`Promoted the existing "${email}" account to admin.`);
      }
      return;
    }

    await this.prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(password),
        displayName: 'Administrator',
        role: 'admin',
      },
    });
    this.logger.log(`Created the admin account "${email}".`);
  }

  /**
   * Says so, every boot, while the shipped password is still in use.
   *
   * The admin portal is served from the gateway, which is the one thing in this
   * stack that is deliberately public — so anyone who finds the hostname can
   * try admin/admin and get the user list, every device, and the settings.
   */
  private warnIfDefault(email: string, password: string) {
    if (password !== DEFAULT_ADMIN_PASSWORD) return;

    this.logger.warn(
      `The admin account "${email}" is using the default password. ` +
        'The admin portal is on the public surface, so change it — set ' +
        'ADMIN_PASSWORD before first boot, or change it in the portal.',
    );
  }
}
