import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import type { Exercise } from '../../domain/set-entry.js';
import type {
  Session,
  SessionStatus,
} from '../../domain/session.aggregate.js';
import { SessionRepository } from '../../domain/training.repositories.js';

/**
 * One session, as a screen reads it.
 *
 * `isMissed` is on the view and is **not** on the row, and that one field is the
 * whole of FR-018. "Missed" is a reading of the clock — `planned`, and finished
 * — so storing it would mean a sweep rewriting rows the member never touched,
 * and then *un*-writing them when they log the session late. Deriving it here,
 * from `Session.isMissed`, means the card, the week view and Today all ask the
 * same object the same question and therefore cannot disagree.
 *
 * `slotId` is deliberately absent, as it is from the blueprint's SDL. Which slot
 * produced a session is this context's bookkeeping — it is what the
 * materialiser's reconcile matches on — and a client that could read it would
 * eventually branch on it, at which point "a hand-made session has no slot"
 * becomes a rule two codebases have to agree about.
 */
export interface SessionView {
  id: string;
  plannedAt: Date;
  durationMin: number;
  sport: string;
  title: string;
  focus: string | null;
  programId: string | null;
  weekIndex: number | null;
  suggestionId: string | null;
  exercises: Exercise[];
  status: SessionStatus;
  completedAt: Date | null;
  notes: string | null;
  /** Derived, never stored. See the interface note and `Session.isMissed`. */
  isMissed: boolean;
}

/**
 * The week view (FR-005, FR-018).
 *
 * ## Every status, and live rows only
 *
 * `SessionRepository.between` promises exactly that, and both halves are the
 * point. A skipped session stays in the week because the record has to be
 * honest — deleting it would make a skipped week and a quiet week look
 * identical — and a completed one *is* the record of the day. A tombstoned
 * session, on the other hand, is off the member's screen by their own request;
 * the Deleted view is served from the sync channel's tombstones, which is the
 * only reader that wants a deleted row.
 *
 * ## The window is the client's and the zone is the member's
 *
 * `from` and `to` are instants the client sends, because the client drew the
 * week and knows which one it is showing. What it does not decide is the zone
 * the missed reading is taken in: that comes from `MemberContextPort`, so a
 * member who has flown gets their own clock rather than the server's.
 */
@Injectable()
export class SessionsQueryHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly member: MemberContextPort,
  ) {}

  async between(
    userId: string,
    from: Date,
    to: Date,
    now: Date = new Date(),
  ): Promise<SessionView[]> {
    const { timezone } = await this.member.clock(userId);
    const rows = await this.sessions.between(userId, from, to);
    return rows
      .sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime())
      .map((session) => sessionView(session, timezone, now));
  }
}

/**
 * One session, one view, and one place that builds it.
 *
 * Exported and imported by the sibling `session/` and `next-practice/` slices
 * rather than copied into them. Three copies of this mapper would be three
 * shapes one typo apart, and the card, the week row and the detail screen are
 * the same session — a field present on one and missing on another is a bug the
 * type system cannot see, because each side would type-check against its own
 * copy. Sibling slices inside *one* context reaching for each other is the seam
 * Meetings' `meetingView` uses; the constitution's rule about duplicating a
 * helper is about two contexts.
 */
export function sessionView(
  session: Session,
  timezone: string,
  now: Date,
): SessionView {
  return {
    id: session.id,
    plannedAt: session.plannedAt,
    durationMin: session.durationMin,
    sport: session.sport,
    title: session.title,
    focus: session.focus,
    programId: session.programId,
    weekIndex: session.weekIndex,
    suggestionId: session.suggestionId,
    exercises: session.exercises,
    status: session.status,
    completedAt: session.completedAt,
    notes: session.notes,
    isMissed: session.isMissed(now, timezone),
  };
}
