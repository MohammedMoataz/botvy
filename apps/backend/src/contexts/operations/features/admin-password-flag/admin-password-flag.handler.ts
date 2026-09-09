import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';

export const ADMIN_PASSWORD_FLAG = 'ops.adminPasswordIsDefault';

/**
 * Keeps `ops.adminPasswordIsDefault` true or false.
 *
 * The flag exists because a boot log is not a warning anybody sees. The seeded
 * administrator login is published in `SETUP.md`, so an installation still
 * using it is one that anybody who read the documentation can sign into — and
 * the portal has to be able to say so on every page load, not only in the
 * minute after a restart.
 *
 * Two inputs, and they are deliberately different shapes:
 *
 * - **At boot**, Identity knows whether the password still verifies against
 *   the shipped default, and reports it through `record`.
 * - **Afterwards**, `identity.PasswordChanged` clears it. Reacting to the event
 *   rather than re-checking on a timer means the banner disappears the moment
 *   the Owner fixes it, which is the only moment they are looking.
 *
 * The flag lives in Operations because the registry does. Identity raises the
 * event and answers the question; it does not write another context's store.
 */
@Injectable()
export class AdminPasswordFlagHandler {
  private readonly logger = new Logger(AdminPasswordFlagHandler.name);

  constructor(private readonly settings: SettingsService) {}

  /** Called by Identity's boot sequence with what it found. */
  async record(isStillDefault: boolean): Promise<void> {
    await this.settings.setSystem(ADMIN_PASSWORD_FLAG, isStillDefault);
    if (isStillDefault) {
      this.logger.warn(
        'The seeded administrator still has its default password. The portal will warn until it is changed.',
      );
    }
  }

  /**
   * `identity.PasswordChanged`.
   *
   * Cleared for *any* member's password change, not only the administrator's,
   * and that is a deliberate simplification worth naming: this installation has
   * one seeded account, and the event does not carry enough to tell whose it
   * was without asking Identity across a store boundary. The cost of being
   * wrong is a warning that disappears slightly early on an installation with
   * several members; the cost of the alternative is a cross-context query for a
   * banner. If that trade stops being right — more than one administrator, say
   * — the event gains the userId and this asks.
   *
   * ponytail: clears on any password change; add the discriminator when the
   * event carries who it was about.
   */
  async onPasswordChanged(event: DomainEvent): Promise<void> {
    await this.settings.setSystem(ADMIN_PASSWORD_FLAG, false);
    this.logger.log(`default-password warning cleared by ${event.name}`);
  }
}
