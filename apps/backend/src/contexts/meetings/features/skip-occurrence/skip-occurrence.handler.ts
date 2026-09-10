import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import { MeetingNotFound } from '../update-meeting/update-meeting.handler.js';

/**
 * "Not this one." (FR-005)
 *
 * The date joins the rule's exception list and the series is otherwise
 * untouched: a member who skips next Tuesday still has a meeting every Tuesday,
 * and the rule still says so. Reminders stop for that date because the
 * expander no longer produces it and the alert saga reconciles against what the
 * expander produces (FR-008).
 *
 * The alternative — moving `dtstart` forward — would silently redefine what the
 * member asked for: skip one Tuesday in a weekly series and every future
 * Tuesday has moved, which is not what "skip" means anywhere else in software.
 *
 * `originalStart` is the moment the *rule* produced, which is the key the whole
 * exception model is built on, and it is what the client sends back from the
 * occurrence it is looking at.
 */
@Injectable()
export class SkipMeetingOccurrenceHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    originalStart: Date,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const meeting = await this.meetings.findById(userId, id);
    if (!meeting) throw new MeetingNotFound(id);

    // Throws `MeetingRuleError('no_recurrence')` for a one-off, which the
    // controller turns into a 400: a meeting that does not repeat has no
    // occurrence to leave out, and the member's verb for it is delete.
    meeting.skipOccurrence(originalStart, at);

    await this.uow.run(() => this.meetings.save(meeting));
    return { updatedAt: meeting.updatedAt };
  }
}
