import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';
import { MeetingNotFound } from '../update-meeting/update-meeting.handler.js';

/**
 * Off the member's screen, and **nothing else** (FR-013).
 *
 * A tombstone rather than a row removal, for two independent reasons that want
 * the same thing:
 *
 * - *Sync.* A delta pull lists what changed; a row that simply vanished would
 *   never appear in one, so the deletion would reach no other device. The
 *   tombstone is how a delete travels.
 * - *The member.* Deletion is undoable like everything else, and the undo
 *   window is the platform's `reminders.tombstoneDays`.
 *
 * Which is why **the status is untouched**. It is the only record of whether the
 * meeting happened, was called off, or was simply removed from the diary, and a
 * delete that "tidied" it would destroy the only copy of that fact — the
 * Deleted view would be a list of meetings with nothing to say about any of
 * them. The same rule as Planning's, for the same reason, and it is asserted in
 * `meetings-write.spec.ts` because this is a rule this codebase has broken
 * twice.
 */
@Injectable()
export class DeleteMeetingHandler {
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

    // Already a tombstone: answer with what is there rather than moving the
    // deletion time. A repeated delete from a retrying client must not keep
    // pushing the purge horizon further out.
    if (meeting.isDeleted) return { updatedAt: meeting.updatedAt };

    meeting.tombstone(at);
    await this.uow.run(() => this.meetings.save(meeting));
    return { updatedAt: meeting.updatedAt };
  }
}
