import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import { MeetingNotFound } from '../update-meeting/update-meeting.handler.js';

/**
 * It happened (FR-013).
 *
 * The whole meeting, series included. There is deliberately no
 * `complete-occurrence` command anywhere in this context: "this meeting
 * happened" is a statement about the meeting, and within a series the member's
 * two statements about one *date* are "not this one" (skip) and "this one,
 * later" (move). A per-occurrence status would be a fourth representation of a
 * series' state, disagreeing with the other three the first time a rule
 * changed.
 *
 * A meeting in the past can still be completed, because the record is the whole
 * point of the verb.
 *
 * A completed meeting expands to no occurrences, which is how its reminders
 * stop: the alert saga asks for occurrences and gets none, so nothing here
 * needs to know that `alerts` exists.
 */
@Injectable()
export class CompleteMeetingHandler {
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

    meeting.complete(at);
    await this.uow.run(() => this.meetings.save(meeting));
    return { updatedAt: meeting.updatedAt };
  }
}
