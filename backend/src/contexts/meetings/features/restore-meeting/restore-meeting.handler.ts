import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import { MeetingNotFound } from '../update-meeting/update-meeting.handler.js';

/**
 * Back from the Deleted view, with its status exactly as it was.
 *
 * Restoring a cancelled meeting gives back a cancelled meeting. That reads
 * oddly until you consider the alternative: a restore that reopened everything
 * would make the Deleted view a trap, because recovering a meeting you had
 * called off would silently put it back in your diary — and, through the alert
 * saga, back into your notifications.
 *
 * `Meeting.restore` raises `MeetingChanged` rather than a restore event of its
 * own, because what the alert saga has to do about it is exactly what it does
 * about any other change: rebuild the window from the rule. A row that is no
 * longer a tombstone expands to occurrences again, so the reconcile puts back
 * the reminders the delete had cleared.
 */
@Injectable()
export class RestoreMeetingHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const meeting = await this.meetings.findById(userId, id);
    if (!meeting) throw new MeetingNotFound(id);
    if (!meeting.isDeleted) return { updatedAt: meeting.updatedAt };

    meeting.restore(at);
    await this.uow.run(() => this.meetings.save(meeting));
    return { updatedAt: meeting.updatedAt };
  }
}
