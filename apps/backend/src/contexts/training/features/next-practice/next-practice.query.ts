import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { wallClockToUtc } from '../../../../shared/time/time.js';
import { NextPracticeCutoffPort } from '../../domain/training.ports.js';
import {
  nextPractice,
  type NextPracticeReason,
} from '../../domain/next-practice.js';
import { addDays, localToday } from '../../domain/slot-calendar.js';
import { SessionRepository } from '../../domain/training.repositories.js';
import { sessionView, type SessionView } from '../sessions/sessions.query.js';


/** The card's answer: the session, why it is that one, and whether it is late. */
export interface NextPracticeView {
  session: SessionView | null;
  reason: NextPracticeReason;
  /**
   * `reason === 'today'`, derived rather than stored beside it.
   *
   * In the published SDL and kept for that reason. Two independent booleans
   * saying one thing is two things that can disagree, so this one is computed
   * from the reason at the edge of the read and nothing carries it around.
   */
  isToday: boolean;
}

/**
 * How many future sessions to fetch when looking past today.
 *
 * The rule wants one, and `nextPractice` filters cancelled, skipped and deleted
 * rows out of what it is given — so asking for a handful means a member whose
 * next three sessions are all called off still gets an answer without a second
 * query. Not the whole future: a member with a materialised fortnight and a
 * program behind it has plenty of rows, and "sort ascending then limit" is only
 * safe here *because* ascending is genuinely the order wanted.
 */
const UPCOMING_LOOKAHEAD = 5;

/**
 * The session to show, and why (FR-006, FR-007, story 2).
 *
 * This handler gathers three things and does no reasoning: today's sessions, the
 * ones after today, and the member's cut-off. The rule itself — including the
 * edge case where a session still to happen today beats the cut-off — lives in
 * `domain/next-practice.ts` and is specced against a clock in
 * `training-clock.spec.ts`. Keeping the two apart is what lets the rule be
 * graded over a fourteen-day fixture without a store, and lets this file be
 * graded on the one thing it can get wrong: which zone and which cut-off it
 * passes in.
 *
 * ## The member's day, not the server's
 *
 * "Today" is resolved as a local date in the member's zone and then turned back
 * into the pair of instants that bound it, through `shared/time`. The API never
 * reads its own `TZ` for this — doing it once shifted every extracted reminder
 * by three hours — and the two boundaries are computed from the *calendar*
 * rather than by adding 86,400,000 ms, because a day containing a clock change
 * is not twenty-four hours long and the end of it would land an hour into the
 * next day or an hour short of the end of this one.
 *
 * Both reads are issued in parallel: they are independent, and the card is the
 * screen the member opens most.
 */
@Injectable()
export class NextPracticeQueryHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly member: MemberContextPort,
    private readonly cutoffs: NextPracticeCutoffPort,
  ) {}

  async handle(
    userId: string,
    now: Date = new Date(),
  ): Promise<NextPracticeView> {
    const [{ timezone }, cutoff] = await Promise.all([
      this.member.clock(userId),
      this.cutoffs.cutoffFor(userId),
    ]);

    const today = localToday(now, timezone);
    const dayStart = wallClockToUtc(`${today}T00:00`, timezone);
    const dayEnd = wallClockToUtc(`${addDays(today, 1)}T00:00`, timezone);

    // `wallClockToUtc` answers null only for an unparseable string, and both of
    // these are built from `localDate`'s own output — so this is unreachable
    // rather than a case. It is a guard and not a `!` because the alternative is
    // an `Invalid Date` reaching the repository, where it silently matches
    // nothing and the card reads "nothing scheduled" for a member with a week.
    if (!dayStart || !dayEnd) {
      return { session: null, reason: 'none-scheduled', isToday: false };
    }

    /*
     * The last instant of the member's day, and it is `midnight - 1ms` rather
     * than midnight itself.
     *
     * `between`'s bounds are *inclusive* and `plannedAfter`'s is exclusive, so
     * passing tomorrow's midnight to both would put a session at exactly 00:00
     * tomorrow into today's list and leave it out of the upcoming one — the two
     * reads have to meet without overlapping, and this is the only value they
     * meet at. A midnight session is a real thing a member can type.
     */
    const dayLast = new Date(dayEnd.getTime() - 1);

    const [todays, upcoming] = await Promise.all([
      this.sessions.between(userId, dayStart, dayLast),
      this.sessions.plannedAfter(userId, dayLast, UPCOMING_LOOKAHEAD),
    ]);

    const answer = nextPractice(todays, upcoming, now, timezone, cutoff);
    return {
      session: answer.session
        ? sessionView(answer.session, timezone, now)
        : null,
      reason: answer.reason,
      isToday: answer.reason === 'today',
    };
  }
}
