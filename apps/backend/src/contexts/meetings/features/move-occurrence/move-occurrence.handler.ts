import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import { MeetingNotFound } from '../update-meeting/update-meeting.handler.js';

/**
 * "This one, later." (FR-005)
 *
 * An override keyed by `originalStart` — the moment the rule produced — so the
 * move survives a later series edit and moving the same occurrence twice
 * updates one override rather than accumulating two. The rest of the series is
 * untouched, which is the half of recurrence everybody gets wrong.
 *
 * Moving an occurrence the member had skipped clears that skip. That rule lives
 * in `moveInRule` rather than here, deliberately: the REST command and the sync
 * adapter both reach it, and a rule implemented in one door disagrees with the
 * other the first time somebody uses the other door.
 */
@Injectable()
export class MoveMeetingOccurrenceHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    originalStart: Date,
    startAt: Date,
    durationMin: number | null = null,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const meeting = await this.meetings.findById(userId, id);
    if (!meeting) throw new MeetingNotFound(id);

    // A length on the override is optional and means "as the series says". The
    // aggregate validates it when it is given, so a moved occurrence cannot
    // carry a length the series itself would have refused.
    meeting.moveOccurrence(originalStart, startAt, durationMin, at);

    await this.uow.run(() => this.meetings.save(meeting));
    return { updatedAt: meeting.updatedAt };
  }
}
