import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { formatInTz } from '../../../../shared/time/time.js';
import type { Session } from '../../domain/session.aggregate.js';
import {
  AthleteProfileRepository,
  SessionRepository,
} from '../../domain/training.repositories.js';

/**
 * How far back the streak read is willing to look.
 *
 * The streak is a run of *sessions*, not of days, so a member training four
 * times a week reaches sixty sessions in about four months — long past the point
 * where "how consistently have they been training" is a useful thing to tell a
 * model. A cap rather than an unbounded scan because this read is on the path of
 * every chat turn.
 */
const STREAK_SCAN = 60;

/**
 * The member's training week, in one line, for a prompt (FR-017).
 *
 * `ProfileQueryHandler.summary`'s sibling, and the same argument for existing:
 * it lives in the context that owns the facts so that the coach, and whatever
 * later phase wants the same sentence, describe a training week identically. A
 * second copy is how one of them starts telling the model about a streak the
 * other omits.
 *
 * ## It answers a sentence, never null
 *
 * `ProfileQueryHandler.summary` returns null for a member with no profile row,
 * because "we know nothing about this person" is a real state the prompt
 * renders as its own line. This one does not, and the difference is the
 * requirement: a member with no slots must yield a line **saying so**. An empty
 * answer would leave the model to infer whether they train at all, and the
 * inference it makes is that they do — the coach's whole prompt is about
 * training, so silence about the week reads as an omission rather than as an
 * absence. Telling it plainly is also what lets the coach do the useful thing
 * and offer to set the week up.
 *
 * ## The next session is the next *planned* one, not the next-practice card's
 *
 * `nextPractice` applies the member's cut-off hour, which before the cut-off
 * answers with **today's** session whatever its status — deliberately, because
 * that is what the Athlete screen should show somebody at eleven in the
 * morning. That is a rendering decision about one card, and it is the wrong
 * fact for a prompt: a coach asked "what should I do today" at 14:00, whose
 * session finished at 09:00, needs to know the next one is Friday. Today's
 * finished session is already in the prompt twice over — the rhythm's day block
 * names it and the streak counts it.
 *
 * ## It carries no label of its own
 *
 * The clause is unprefixed — no leading "Training:" — because the block that
 * renders it into the prompt already labels its lines, exactly as
 * `ProfileQueryHandler.summary` returns `Name: …` with no "Profile:" over it. A
 * label here would arrive doubled in the one place this string is read.
 *
 * ## English, and that is the existing gap rather than a new one
 *
 * This is prompt context, never a stored member-facing message, so it does not
 * widen `enhancements/E-012`: the coach's own reply is written by the model,
 * which is under instruction to answer in the member's language, exactly as it
 * already is for `ProfileQueryHandler.summary`'s English "Allergies: …". A
 * sentence that reached the member would belong in E-012's fix; this one never
 * does.
 */
@Injectable()
export class TrainingSummaryQueryHandler {
  constructor(
    private readonly profiles: AthleteProfileRepository,
    private readonly sessions: SessionRepository,
    private readonly member: MemberContextPort,
  ) {}

  async summary(userId: string, now: Date = new Date()): Promise<string> {
    const [profile, { timezone }, upcoming, recent] = await Promise.all([
      this.profiles.find(userId),
      this.member.clock(userId),
      this.sessions.plannedAfter(userId, now, 1),
      this.sessions.recentByStatus(userId, now, STREAK_SCAN),
    ]);

    const sports = profile?.sports ?? [];
    const slots = profile?.slots ?? [];

    /*
     * Nothing set up at all — which includes the member whose profile row the
     * registration bootstrap has not written yet, because the relay is eventual
     * and the honest answer in that window is the same one.
     */
    if (sports.length === 0 && slots.length === 0) {
      return 'they have not set up any sports or a weekly training schedule yet';
    }

    const parts: string[] = [
      `Sports: ${sports.length > 0 ? sports.join(', ') : 'none chosen yet'}`,
    ];

    if (slots.length === 0) {
      parts.push('no weekly training slots set yet');
    }

    const next = upcoming[0];
    parts.push(
      next
        ? `next session ${formatInTz(next.plannedAt, timezone)} — ${describe(next)}`
        : 'nothing scheduled next',
    );

    const streak = completedRun(recent);
    parts.push(
      streak > 0
        ? `${streak} session(s) completed in a row`
        : 'no completed sessions in a row right now',
    );

    return parts.join('; ');
  }
}

/** The session, as a coach would name it: what it is, and what it is for. */
function describe(session: Session): string {
  const head = `${session.title} (${session.sport}, ${session.durationMin}m)`;
  return session.focus ? `${head}, focus: ${session.focus}` : head;
}

/**
 * How many of the member's most recent sessions were completed, consecutively.
 *
 * **Sessions and not days**, which is `recentByStatus`'s own reason for
 * existing: a member who trains three times a week has a streak of three after
 * a week, and counting days would make every rest day a break.
 *
 * Anything that is not `completed` ends the run, and that includes a `planned`
 * session whose moment has passed — a missed one. Which is why the run is
 * counted here from the rows rather than folded into a stored counter: `missed`
 * is a reading of the clock that nothing ever writes, so the only place the
 * answer can be correct is a read.
 */
function completedRun(recent: Session[]): number {
  let run = 0;
  for (const session of recent) {
    if (session.status !== 'completed') break;
    run += 1;
  }
  return run;
}
