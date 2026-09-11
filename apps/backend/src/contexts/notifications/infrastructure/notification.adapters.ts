import { Injectable } from '@nestjs/common';
import { DevicesQueryHandler } from '../../identity/features/devices/devices.query.js';
import { ReapPushTokenHandler } from '../../identity/features/register-device/reap-push-token.handler.js';
import { MeetingRepository } from '../../meetings/domain/meetings.repositories.js';
import { MeetingOccurrencesQueryHandler } from '../../meetings/features/meeting-occurrences/meeting-occurrences.query.js';
import { PurgeMeetingHandler } from '../../meetings/features/purge-meeting/purge-meeting.handler.js';
import { PurgeTrainingTombstonesHandler } from '../../training/features/purge-tombstones/purge-tombstones.handler.js';
import { PurgeTaskHandler } from '../../planning/features/purge-task/purge-task.handler.js';
import { ReminderLifecycleHandler } from '../../reminders/features/reminder-lifecycle/reminder-lifecycle.handler.js';
import {
  DeviceLookupPort,
  DeviceRemovalPort,
  MeetingMembersPort,
  MeetingOccurrencesPort,
  TombstonePurgePort,
  type MeetingOccurrence,
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

/**
 * Meetings purging its own two collections, on request.
 *
 * The third owner, and the reason `TOMBSTONE_PURGES` is a multi-provider array
 * rather than two named dependencies: joining the sweep is adding a provider,
 * not editing the sweep. The sweep's job is to run on a timer and add up what
 * the owners report; which owners exist is not its business.
 *
 * One handler covers `meetings` and `calendar_events` both, because
 * `PurgeMeetingHandler.purgeTombstones` runs the pair inside one unit of work
 * and returns the total — two ports would report two numbers the sweep would
 * only add together again.
 */
@Injectable()
export class MeetingsTombstonePurge extends TombstonePurgePort {
  constructor(private readonly meetings: PurgeMeetingHandler) {
    super();
  }

  async purgeBefore(before: Date): Promise<number> {
    return this.meetings.purgeTombstones(before);
  }
}

/**
 * Training purging its own three syncable collections, on request.
 *
 * The fourth owner. `athlete_profiles` is not among them and has nothing to
 * sweep — one document per member, no tombstone — which is why the count comes
 * back from three collections and not four.
 */
@Injectable()
export class TrainingTombstonePurge extends TombstonePurgePort {
  constructor(private readonly training: PurgeTrainingTombstonesHandler) {
    super();
  }

  async purgeBefore(before: Date): Promise<number> {
    return this.training.purgeTombstones(before);
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

/**
 * Where a meeting's occurrences come from: Meetings' own query handler, which
 * runs the same expander every calendar screen does.
 *
 * Bound to the `*.query.ts` handler and never to a feature service, because
 * the query handler is the published surface — the same distinction the two
 * Identity adapters above observe.
 */
@Injectable()
export class MeetingsOccurrenceLookup extends MeetingOccurrencesPort {
  constructor(private readonly occurrences: MeetingOccurrencesQueryHandler) {
    super();
  }

  /**
   * Narrowed to the scheduling fields. The view also carries a location and a
   * `moved` flag; a warning has nothing to do with either, and copying them
   * across would be this context taking an interest it does not have.
   */
  async forMember(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<MeetingOccurrence[]> {
    const views = await this.occurrences.forMember(userId, from, to);
    return views.map((view) => ({
      meetingId: view.meetingId,
      title: view.title,
      originalStart: view.originalStart,
      startAt: view.startAt,
      durationMin: view.durationMin,
      prepMinutes: view.prepMinutes,
      reminderOffsets: view.reminderOffsets,
    }));
  }
}

/**
 * Who has a diary at all, for the nightly pass.
 *
 * The repository port rather than a query handler, and that is deliberate:
 * there is no read *screen* for "every member with a meeting", so there is no
 * query slice to bind to — the method exists on Meetings' own repository port
 * precisely for this caller, and it is the collection's owner that answers.
 */
@Injectable()
export class MeetingsMemberLookup extends MeetingMembersPort {
  constructor(private readonly meetings: MeetingRepository) {
    super();
  }

  async withMeetings(): Promise<string[]> {
    return this.meetings.memberIdsWithMeetings();
  }
}
