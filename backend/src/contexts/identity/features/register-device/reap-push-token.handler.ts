import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { DeviceRepository } from '../../domain/device.repository.js';

/**
 * Clears a push token the push service has reported as undeliverable.
 *
 * ## Why this exists as a handler rather than as a repository call
 *
 * The notification sweep learns from FCM that a token is dead. The row is a
 * device in *PostgreSQL*, which is Identity's, so the sweep has to ask rather
 * than write — that much is principle I.
 *
 * What it asks *for* is the part worth being careful about. Exporting
 * `DeviceRepository` to Notifications would have handed it the write surface
 * for every device operation there is, to accomplish one of them. `CLAUDE.md`
 * puts it plainly: a query handler is the published surface, and reaching for
 * another context's feature service is a violation even in the permitted
 * direction. So Identity publishes exactly one operation, named for exactly
 * what it does, and Notifications binds its port to that.
 *
 * ## Why it clears rather than deletes
 *
 * The device is still the member's and still syncs; it simply has no push route
 * until the app registers a fresh token on its next launch. Deleting the row
 * would also throw away `lastSeenAt` — and the sweep skips any device whose
 * `lastSeenAt` is at or after an alert's `plannedAt`, on the grounds that such a
 * device holds its own local alarm. A phone the member uses daily would come
 * back looking like one that has never synced, so every alert would be pushed
 * to it *as well as* fired locally and the member would get everything twice.
 */
@Injectable()
export class ReapPushTokenHandler {
  private readonly logger = new Logger(ReapPushTokenHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly devices: DeviceRepository,
  ) {}

  /**
   * Returns how many devices actually lost a token, which is not the same as
   * how many were asked about: a token FCM rejects twice in one sweep, or one
   * belonging to a device already reaped, is counted once and zero times
   * respectively. The sweep logs this number, so it has to mean something.
   */
  async reap(tokens: string[]): Promise<number> {
    let cleared = 0;

    for (const token of new Set(tokens)) {
      const device = await this.devices.findByPushToken(token);
      if (!device) continue;

      // `losePushToken`, not `reregister`: see that method's comment for why
      // stamping `lastSeenAt` here would silently stop the member's
      // notifications altogether.
      if (!device.losePushToken()) continue;

      await this.uow.run(() => this.devices.save(device));
      cleared += 1;
    }

    if (cleared > 0) {
      this.logger.log(
        `cleared the push token on ${cleared} device(s) the push service rejected`,
      );
    }
    return cleared;
  }
}
