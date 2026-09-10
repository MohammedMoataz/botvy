import { Injectable } from '@nestjs/common';
import { RegisterDeviceHandler } from '../../identity/features/register-device/register-device.handler.js';
import { PendingAlertsQueryHandler } from '../../notifications/features/pending-alerts/pending-alerts.query.js';
import {
  DeviceTouchPort,
  PendingAlertsPort,
} from '../domain/syncable-entity.port.js';

/**
 * The facade's two bindings to other contexts, in the one layer allowed to
 * make them.
 *
 * Both are narrow on purpose. The facade needs to stamp a device as seen and to
 * fetch a week of alarms; it does not need Identity's device repository or
 * Notifications' alert store, and taking either would hand it a write surface
 * it has no business holding.
 */

/**
 * `devices.lastSeenAt`, stamped by asking Identity.
 *
 * The value is load-bearing rather than informational: the notification sweep
 * skips any device whose `lastSeenAt` is at or after an alert's `plannedAt`, on
 * the grounds that a device which has synced since the plan holds its own local
 * alarm. So a completed round trip is the *evidence* for that claim, and this
 * is where the evidence is recorded.
 *
 * Which is also why the facade must not write the column itself: it is a
 * PostgreSQL row belonging to Identity, and a Mongo-side context opening it is
 * exactly what principle I forbids.
 */
@Injectable()
export class IdentityDeviceTouch extends DeviceTouchPort {
  constructor(private readonly devices: RegisterDeviceHandler) {
    super();
  }

  /**
   * Null for an install we do not know, and the caller logs rather than fails.
   *
   * A sync from an unrecognised `installId` is a real situation — an app
   * reinstalled, or a client that never called `register-device` — and
   * refusing the whole round trip over it would leave that member unable to
   * sync at all. Serving the data and warning is the better failure: the only
   * consequence is that the sweep keeps pushing to a device that may not need
   * it, which is a duplicate notification rather than lost work.
   */
  async touch(installId: string, at: Date): Promise<string | null> {
    return this.devices.seen(installId, at);
  }
}

/**
 * The next seven days of alarms, from Notifications.
 *
 * Returned by `/sync` rather than by a route of its own, because the phone
 * needs them on exactly the occasions it syncs — and a second round trip would
 * be a second chance to be offline between the two.
 */
@Injectable()
export class NotificationsPendingAlerts extends PendingAlertsPort {
  constructor(private readonly alerts: PendingAlertsQueryHandler) {
    super();
  }

  async forMember(userId: string, now: Date): Promise<unknown[]> {
    return this.alerts.forMember(userId, now);
  }
}
