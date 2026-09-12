import { Injectable } from '@nestjs/common';
import { SessionsInRangeQueryHandler } from '../../training/features/sessions/sessions-in-range.query.js';
import type { PlanTraining } from '../domain/daily-plan.aggregate.js';
import { NextSessionPort } from '../domain/rhythm.ports.js';

/**
 * Tomorrow's training session — **bound to Training as of P6 (T640)**.
 *
 * This file held a null-returning stub from P3 to P6, whose comment promised
 * that closing it would be "one line in `rhythm.module.ts`, and every call site
 * here is already correct". Both halves held: `DraftBuilder` is unchanged, the
 * tick is unchanged, and `touch-message.ts` already renders the line — so the
 * evening proposal and the morning briefing name the session because the
 * sentence was always written to include one and there was never a session to
 * include. The class name is the only thing about the file that had to become a
 * lie, and it is renamed rather than kept: `NoTrainingYet` describing an adapter
 * that returns a session is the kind of comment a reader stops trusting.
 *
 * ## Through Training's `onDate`, not through its collection or its range read
 *
 * `SessionsInRangeQueryHandler` is a `*.query.ts` handler — the published
 * surface constitution IX sanctions — and `infrastructure/` is the one layer
 * allowed to know Training exists. Two things follow from asking `onDate` rather
 * than `between`:
 *
 * **The member's midnight stays Training's to resolve.** The rhythm asks about a
 * *local date* because that is what the tick has: `forDate(userId, 'tomorrow's
 * date')`. Resolving that to instants here would put a second definition of
 * "the member's day" in a second context, and the two would eventually disagree
 * about a day containing a clock change. `onDate` does it against the member's
 * own zone through `shared/time`, which is the same resolution the Athlete
 * screen uses, so the proposal and the week cannot name different sessions.
 *
 * **`planned` only, which the range read deliberately is not.** A calendar shows
 * a cancelled session because it is a fact about a day; a *proposal* must not
 * name one the member has already said is not happening. That filter lives in
 * `onDate` rather than here, because it is a property of the question — and a
 * filter written here would be invisible to the next caller that asked the same
 * question.
 *
 * ## One session, when the member may have two
 *
 * `PlanTraining` holds a single session and the spec's assumptions allow two
 * slots in a day. `onDate` answers soonest-first, so this takes the earliest —
 * which is the one a proposal read at 22:00 the night before should lead with,
 * and the same choice the next-practice card makes for a day that has not
 * started. Widening `PlanTraining` to a list would change the plan aggregate,
 * the sentence, the snapshot and the phone's table for a case the assumptions
 * explicitly call unusual.
 */
@Injectable()
export class TrainingNextSession extends NextSessionPort {
  constructor(private readonly sessions: SessionsInRangeQueryHandler) {
    super();
  }

  async forDate(userId: string, date: string): Promise<PlanTraining | null> {
    const [session] = await this.sessions.onDate(userId, date);
    if (!session) return null;

    return {
      sessionId: session.id,
      title: session.title,
      sport: session.sport,
      startAt: session.startAt,
    };
  }
}
