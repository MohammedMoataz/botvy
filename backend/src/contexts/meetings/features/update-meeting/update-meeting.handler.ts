import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { MeetingPatch } from '../../domain/meeting.aggregate.js';
import { MeetingRepository } from '../../domain/meetings.repositories.js';

export class MeetingNotFound extends Error {
  constructor(id: string) {
    super(`no meeting ${id}`);
  }
}

export interface UpdateMeetingCommand extends MeetingPatch {
  /**
   * Discard the moved occurrences a rule change would orphan.
   *
   * Absent, an edit that would orphan one is refused and carries the moments at
   * stake; the client turns that into "discard them?" and retries with this
   * set. Two requests rather than one flag on the first, because they are two
   * different requests: the second one destroys something.
   */
  force?: boolean;
}

/**
 * A series edit (FR-005).
 *
 * One handler for every field a member can change, because a client sends the
 * editor as one form, the aggregate diffs it as one patch, and one
 * `MeetingChanged` comes out of it. A handler per field would have a member who
 * moved a meeting and renamed it wake the alert saga twice to reconcile the
 * same window.
 *
 * The member's current zone is passed through because the orphan check needs
 * it: which occurrences the new rule produces depends on which clock its wall
 * times are read on, so a member editing a series from another zone must not be
 * told their moved occurrences are about to be discarded when they are not.
 * `Meeting.edit` carries the two-zones note.
 */
@Injectable()
export class UpdateMeetingHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly meetings: MeetingRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    id: string,
    command: UpdateMeetingCommand,
  ): Promise<{ changed: string[]; updatedAt: Date }> {
    const meeting = await this.meetings.findById(userId, id);
    if (!meeting) throw new MeetingNotFound(id);

    const { force, ...patch } = command;
    const { timezone } = await this.member.clock(userId);

    // Throws `MeetingRuleError('orphaned_overrides')` carrying the moments,
    // which the controller turns into a 409. Nothing is saved when it does.
    const changed = meeting.edit(patch, timezone, { force });

    // Nothing moved, nothing saved, nothing announced. A client re-sending the
    // form on every keystroke should not cost a write, or a reconcile, per
    // keystroke.
    if (changed.length > 0) {
      await this.uow.run(() => this.meetings.save(meeting));
    }
    return { changed, updatedAt: meeting.updatedAt };
  }
}
