import { Injectable } from '@nestjs/common';
import { DevicesQueryHandler } from '../../identity/features/devices/devices.query.js';
import { ReapPushTokenHandler } from '../../identity/features/register-device/reap-push-token.handler.js';
import { PurgeTaskHandler } from '../../planning/features/purge-task/purge-task.handler.js';
import { ReminderLifecycleHandler } from '../../reminders/features/reminder-lifecycle/reminder-lifecycle.handler.js';
import {
  DeviceLookupPort,
  DeviceRemovalPort,
  TombstonePurgePort,
  type NotifiableDevice,
} from '../domain/notification.ports.js';

/**
 * Where this context is allowed to know the others exist.
 *
 * `infrastructure/` is the one layer constitution IX exempts, because binding a
 * local port to somebody else's published surface is exactly its job — the
 * pattern `admin-device.lookup.ts` and `admin-password.probe.ts` established in
 * P0. Nothing in `domain/` or `features/` imports any of these; the sweep takes
 * three abstract ports and never learns which contexts answer them.
 *
 * A note on what these are *not*. `plan.md` describes them as `CommandBus`
 * dispatches, and the principle is identical either way — the owning context
 * holds the write, and the sweep asks. They are ports because no `CommandBus`
 * is used anywhere in this codebase: introducing the first one here would add
 * a layer of indirection with no established convention, and the port is the
 * convention the lint rule is actually written around.
 */
@Injectable()
export class IdentityDeviceLookup extends DeviceLookupPort {
  constructor(private readonly devices: DevicesQueryHandler) {
    super();
  }

  /**
   * Identity's own batched query, narrowed to what the sweep needs.
   *
   * Batched rather than per-member because the sweep handles a whole batch of
   * alerts across many members: one query for two hundred members beats two
   * hundred queries, and against PostgreSQL from a Mongo context every round
   * trip crosses a store boundary.
   */
  async forUsers(userIds: string[]): Promise<NotifiableDevice[]> {
    const views = await this.devices.forUsers(userIds);
    return views.map((view) => ({
      userId: view.userId,
      deviceId: view.deviceId,
      pushToken: view.pushToken,
      lastSeenAt: view.lastSeenAt,
    }));
  }
}

/**
 * Reaping a device whose push token FCM has rejected.
 *
 * The row is in PostgreSQL and belongs to Identity. This adapter is the only
 * thing in Notifications that knows that, and it knows it because binding the
 * port is what it is for.
 */
@Injectable()
export class IdentityDeviceRemoval extends DeviceRemovalPort {
  constructor(private readonly reaper: ReapPushTokenHandler) {
    super();
  }

  /**
   * Straight through to Identity's own operation. This adapter exists only to
   * name the port the sweep depends on and bind it to the context that owns
   * the write — the reasoning about *why* the token is cleared rather than the
   * device deleted lives with the handler, where the write is.
   */
  async removeByPushToken(tokens: string[]): Promise<number> {
    return this.reaper.reap(tokens);
  }
}

/** Planning purging its own two collections, on request. */
@Injectable()
export class PlanningTombstonePurge extends TombstonePurgePort {
  constructor(private readonly tasks: PurgeTaskHandler) {
    super();
  }

  async purgeBefore(before: Date): Promise<number> {
    return this.tasks.purgeTombstones(before);
  }
}

/** Reminders purging its own, on request. */
@Injectable()
export class RemindersTombstonePurge extends TombstonePurgePort {
  constructor(private readonly reminders: ReminderLifecycleHandler) {
    super();
  }

  async purgeBefore(before: Date): Promise<number> {
    return this.reminders.purgeTombstones(before);
  }
}
