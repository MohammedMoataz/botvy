import { Injectable } from '@nestjs/common';
import type {
  Program,
  ProgramSource,
  ProgramStatus,
  ProgramWeek,
} from '../../domain/program.aggregate.js';
import { ProgramRepository } from '../../domain/training.repositories.js';

/**
 * One program, as a list row or a detail screen reads it.
 *
 * ## `sourceLinkIds`, not `sourceLinks`
 *
 * The blueprint's SDL types the field `[Link!]!`, and `Link` is **Knowledge's**
 * type: it does not exist until P7, and a Training file declaring it is exactly
 * what constitution IX and the `no-restricted-imports` rule refuse — P5 hit the
 * same wall with `Task` on the agenda. So the view publishes the ids, which is
 * what the document actually holds. When P7 lands, the resolver that owns
 * `Link` can resolve them; nothing here has to change and nothing here has to
 * know that type exists.
 *
 * `status` and `appliedStartDate` are both carried because a client genuinely
 * needs them: archived against active is what story 4 scenario 3 turns on, and
 * the apply screen has to be able to say which day the plan was started from.
 * They are on the document already, and dropping them on the way out would make
 * the read the one place that cannot answer the question the write recorded.
 */
export interface ProgramView {
  id: string;
  title: string;
  sport: string;
  source: ProgramSource;
  sourceLinkIds: string[];
  status: ProgramStatus;
  /** `YYYY-MM-DD` in the member's zone, or null while it has never been applied. */
  appliedStartDate: string | null;
  weeks: ProgramWeek[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The member's programs (story 4).
 *
 * `includeArchived` rather than a status filter, because the list is one list
 * with a switch on it: the active plan and the ones retired before it belong to
 * the same screen, and a member looking for "the block I did in spring" is
 * looking in their archive. Tombstones are never here — the Deleted view is a
 * different screen, served by the sync channel's tombstones, which is why
 * nothing takes an `includeDeleted`.
 *
 * No limit, and that is on purpose. A member has a handful of programs, not
 * thousands, so the whole list is one read — and a limit applied to a sorted
 * read is the trap `CLAUDE.md` names, which the way not to fall into is to not
 * have a limit until something needs one.
 */
@Injectable()
export class ProgramsQueryHandler {
  constructor(private readonly programs: ProgramRepository) {}

  async list(userId: string, includeArchived = false): Promise<ProgramView[]> {
    const rows = await this.programs.listFor(userId, { includeArchived });
    return rows.map(programView);
  }
}

/**
 * One program, one view, and one place that builds it.
 *
 * Exported and imported by the sibling `program/` slice rather than copied into
 * it. Two copies would be two shapes one typo apart, and the detail screen and
 * the list row are the same program — a field present on one and missing on the
 * other is a bug the type system cannot see, because each side would check
 * against its own copy. Sibling slices within one context reaching for each
 * other is the seam Meetings' `meetingView` already uses; the rule about
 * duplicating helpers is about two *contexts*, and this is one.
 */
export function programView(program: Program): ProgramView {
  return {
    id: program.id,
    title: program.title,
    sport: program.sport,
    source: program.source,
    sourceLinkIds: [...program.sourceLinkIds],
    status: program.status,
    appliedStartDate: program.appliedStartDate,
    weeks: program.weeks,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
  };
}
