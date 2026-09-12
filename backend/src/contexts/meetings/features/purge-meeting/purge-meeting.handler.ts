import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  CalendarEventRepository,
  MeetingRepository,
} from '../../domain/meetings.repositories.js';
import { MeetingNotFound } from '../update-meeting/update-meeting.handler.js';

/**
 * Erased. Two ways in, and they are different operations wearing one name.
 *
 * `handle` is the member emptying their own Deleted view, one row at a time. It
 * is guarded: a purge of something that is not a tombstone is refused, because
 * erasing a live row is data loss dressed as housekeeping and a client asking
 * for it has a bug. The refusal is `MeetingRuleError('not_deleted')`, which the
 * controller turns into a 409 and the sync facade into a `not_deleted`
 * rejection — one rule and one vocabulary, whichever door the request came
 * through.
 *
 * `purgeTombstones` is the horizon sweep's half, covering **both** of this
 * context's collections. It is here rather than in the sweep because the sweep
 * used to reach into other contexts' collections to do this and now asks
 * instead; the count it reports is a number about rows this context deleted,
 * reported by the context that deleted them. The shape mirrors Planning's
 * `PurgeTaskHandler.purgeTombstones` exactly, so whoever binds it has one
 * pattern to follow rather than two.
 */
@Injectable()
export class PurgeMeetingHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
    private readonly events: CalendarEventRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const meeting = await this.meetings.findById(userId, id);
    if (!meeting) throw new MeetingNotFound(id);

    meeting.assertPurgeable();
    await this.uow.run(() => this.meetings.remove(meeting));
  }

  /**
   * Everything tombstoned before the horizon, across both collections.
   * Unscoped for the nightly pass; scoped when one member is being cleaned up.
   */
  async purgeTombstones(before: Date, userId?: string): Promise<number> {
    return this.uow.run(async () => {
      const meetings = await this.meetings.purgeTombstonesBefore(before, userId);
      const events = await this.events.purgeTombstonesBefore(before, userId);
      return meetings + events;
    });
  }
}
