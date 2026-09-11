import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { wallClockToUtc } from '../../../../shared/time/time.js';
import { addDays } from '../../domain/slot-calendar.js';
import { SessionRepository } from '../../domain/training.repositories.js';

/**
 * One session, to a context that is not allowed to read them.
 *
 * The field names are P5's `AgendaSession` — `id`, `title`, `sport`, `startAt`,
 * `durationMin` — because that shape is the contract Meetings' port already
 * declares and the adapter binding the two must not have to translate. `startAt`
 * rather than `plannedAt` for the same reason: it is an agenda row's word for
 * the moment, and this is the surface, not the aggregate.
 *
 * A separate declaration rather than an import of Meetings' interface, which
 * `no-restricted-imports` refuses in both directions (constitution IX). Two
 * structurally identical shapes is the lesser cost; what keeps them honest is
 * the adapter that binds the port, which will not compile if a field goes
 * missing on either side.
 */
export interface SessionInRange {
  id: string;
  title: string;
  sport: string;
  startAt: Date;
  durationMin: number;
}

/**
 * Training's published surface for the contexts that need to know about
 * sessions without being allowed to read them.
 *
 * ## Two callers, and both have been waiting for this file
 *
 * - **P5's agenda** holds `TrainingSessionsPort`, bound to an empty-list stub
 *   since it was written, so the calendar has been rendering days with no
 *   training on them. `between` is what replaces it — a window rather than a day
 *   at a time, because an agenda spans a month and asking day by day would be
 *   thirty round trips.
 * - **P3's rhythm** holds `NextSessionPort`, bound to a null-returning stub, so
 *   the evening proposal and the morning briefing have never named a session.
 *   `onDate` is what replaces that one.
 *
 * Both stubs carry the same note in their own comments: *P6 replaces one line in
 * the module and every call site is already correct.* This is that one line's
 * other end, and it is written here — in the context that owns the collection —
 * rather than as a port each of them binds to its own query, because CLAUDE.md
 * names the failure outright: **a capability three phases each credit to another
 * phase is a capability nobody builds.** The pinned `coach` and `planner`
 * conversations were "created in P1" per two phases and built in a third, and
 * nothing created them. So the callers are named above rather than left to be
 * discovered, and this handler exists before either module is changed.
 *
 * ## Why `onDate` takes a date string and `between` takes instants
 *
 * The same split `TasksDueQueryHandler` makes, and for the same reason. A caller
 * asking about *a member's day* must not have to decide whose midnight it meant
 * — that decision is this file's, resolved against the member's own zone through
 * `shared/time`, which is the only way the rhythm's "tomorrow" agrees with the
 * member's tomorrow. A caller drawing a *calendar* genuinely has instants: it
 * knows which month it is showing, down to the hour the grid starts at.
 */
@Injectable()
export class SessionsInRangeQueryHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly member: MemberContextPort,
  ) {}

  /**
   * Every live session overlapping the window, soonest first — **every status**.
   *
   * A skipped or cancelled session stays on the calendar, for the reason the
   * week view carries it and the reason Meetings keeps a cancelled meeting in
   * the diary: it is a fact about a day the member may well be looking for, and
   * a calendar that quietly dropped it would make a skipped week and a quiet
   * week look identical. Tombstoned rows are excluded by the repository, because
   * those the member has actually asked to stop seeing.
   */
  async between(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<SessionInRange[]> {
    const rows = await this.sessions.between(userId, from, to);
    return rows
      .sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime())
      .map((session) => ({
        id: session.id,
        title: session.title,
        sport: session.sport,
        startAt: session.plannedAt,
        durationMin: session.durationMin,
      }));
  }

  /**
   * The sessions on one of the member's own calendar days, `planned` only.
   *
   * The status filter is the one difference from `between`, and it is the
   * caller's requirement rather than a convenience: the rhythm's sentence is a
   * *proposal* — "tomorrow you have gym at six" — and proposing a session the
   * member has already cancelled is worse than saying nothing. The calendar is
   * describing a day and this is planning one.
   *
   * The day's boundaries are computed from the calendar rather than by adding a
   * day's worth of milliseconds, because a day containing a clock change is not
   * twenty-four hours long — 24 hours after a spring-forward midnight is one in
   * the morning of the day after.
   */
  async onDate(userId: string, date: string): Promise<SessionInRange[]> {
    return (await this.everythingOnDate(userId, date)).filter(
      (session) => session.status === 'planned',
    );
  }

  /**
   * The sessions on one of the member's own days, **whatever became of them**.
   *
   * P8's caller, and the difference from `onDate` is the whole reason it is a
   * second method rather than a flag. Nutrition asks *did this member train
   * today* in order to draft food for the day they actually had — so a session
   * finished at seven in the morning is exactly the one it must see, and
   * `onDate`'s `planned` filter hides it. A member who trained at dawn would
   * have been fed a rest day.
   *
   * A boolean on `onDate` would have been shorter and is the shape this codebase
   * has already been bitten by: two callers one typo apart from asking opposite
   * questions, with nothing in either call site saying which it meant.
   * `inConversation`'s ascending-then-limit is the same mistake, and it carried
   * a member's *first* twenty messages into every prompt for a phase.
   *
   * The day's boundaries are computed from the calendar rather than by adding a
   * day's worth of milliseconds, because a day containing a clock change is not
   * twenty-four hours long — 24 hours after a spring-forward midnight is one in
   * the morning of the day after.
   */
  async everythingOnDate(
    userId: string,
    date: string,
  ): Promise<Array<SessionInRange & { status: string }>> {
    const { timezone } = await this.member.clock(userId);
    const from = wallClockToUtc(`${date}T00:00`, timezone);
    const to = wallClockToUtc(`${addDays(date, 1)}T00:00`, timezone);
    if (!from || !to) return [];

    // `between`'s bounds are inclusive, so the day ends a millisecond before
    // tomorrow's midnight — otherwise a session at exactly 00:00 tomorrow
    // appears on both days, and the rhythm would name it twice.
    const rows = await this.sessions.between(
      userId,
      from,
      new Date(to.getTime() - 1),
    );
    return rows
      .sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime())
      .map((session) => ({
        id: session.id,
        title: session.title,
        sport: session.sport,
        startAt: session.plannedAt,
        durationMin: session.durationMin,
        status: session.status,
      }));
  }
}
