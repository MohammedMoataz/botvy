import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import { MeetingNotFound } from '../update-meeting/update-meeting.handler.js';

/**
 * It is off (FR-013).
 *
 * Distinct from completed and distinct from deleted, and all three are worth
 * keeping apart: completed says it happened, cancelled says it did not and will
 * not, deleted says it is off the member's screen. The Deleted view shows a
 * cancelled meeting *as cancelled*, which is only possible because deleting
 * never touches the status.
 *
 * Cancelling a repeating meeting cancels the series — "when future dates
 * arrive, nothing is shown or sent" (story 2, scenario 4) — and one unwanted
 * date is a skip instead.
 */
@Injectable()
export class CancelMeetingHandler {
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

    meeting.cancel(at);
    await this.uow.run(() => this.meetings.save(meeting));
    return { updatedAt: meeting.updatedAt };
  }
}
