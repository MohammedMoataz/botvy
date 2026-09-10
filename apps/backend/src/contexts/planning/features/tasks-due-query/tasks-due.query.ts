import { Inject, Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { localDate, wallClockToUtc } from '../../../../shared/time/time.js';
import {
  TASK_READ_REPOSITORY,
  type TaskReadRepository,
  type TaskView,
} from '../../domain/task-read.repository.js';

/**
 * Planning's published surface for the contexts that need to know about tasks
 * without being allowed to read them.
 *
 * This file is the answer to a specific failure mode, so it is worth stating
 * plainly. P3's evening draft needs "what is due tomorrow" and "what is still
 * open from today"; P5's agenda needs "which tasks carry a time in this
 * window". Each of those is one query against Planning's collection, and the
 * cheapest way to write either is to bind a port straight to that collection —
 * at which point two contexts hold a key to one store, nothing in the code says
 * so, and the shape of `tasks` can never be changed again without breaking a
 * phase nobody was looking at.
 *
 * Declaring the three queries *here*, in the phase that owns the collection,
 * means those phases have something to call instead. The constitution's own
 * words for this: "a capability three phases each credit to another phase is a
 * capability nobody builds", so it is built now, with the callers named in the
 * comments below rather than left to be discovered.
 *
 * **Every one resolves the day in the member's own zone.** These are the
 * queries most likely to be handed a `new Date()` and a naive date arithmetic
 * by a caller in a hurry, which is precisely how a member's day ends up being
 * the server's day. So they take a date *string* or a window, never a
 * pre-computed boundary, and work the instants out themselves.
 */
@Injectable()
export class TasksDueQueryHandler {
  constructor(
    @Inject(TASK_READ_REPOSITORY) private readonly tasks: TaskReadRepository,
    private readonly member: MemberContextPort,
  ) {}

  /**
   * Everything due on one calendar day, that day being the member's.
   *
   * Called by P3's evening draft with tomorrow's date. `date` is a
   * `YYYY-MM-DD` string rather than a Date on purpose: a Date would carry an
   * instant, and the caller would have had to decide which zone's midnight it
   * meant — which is the decision this method exists to make.
   */
  async dueOn(userId: string, date: string): Promise<TaskView[]> {
    const { timezone } = await this.member.clock(userId);
    const from = wallClockToUtc(`${date}T00:00`, timezone);
    const to = wallClockToUtc(`${nextDay(date)}T00:00`, timezone);
    if (!from || !to) return [];
    return this.tasks.dueBetween(userId, from, to, timezone);
  }

  /**
   * Still-open tasks whose moment has passed.
   *
   * The rollover's input: these are what the evening prompt offers to carry
   * over. `before` is an instant here rather than a date, because "still open
   * as of right now" is a genuine instant — the caller is the tick, and it
   * knows what time it is.
   */
  async openBefore(userId: string, before: Date): Promise<TaskView[]> {
    const { timezone } = await this.member.clock(userId);
    return this.tasks.openBefore(userId, before, timezone);
  }

  /**
   * Tasks carrying a time, over a window, for P5's agenda.
   *
   * All-day tasks are excluded by the adapter: an agenda is an hour grid, and
   * "buy milk, some time today" has no hour to sit at. It appears in the day's
   * task list instead, which is a different part of the same screen.
   */
  async timedBetween(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<TaskView[]> {
    const { timezone } = await this.member.clock(userId);
    return this.tasks.timedBetween(userId, from, to, timezone);
  }

  /** Today, in the member's zone. Convenience for a caller with no date to hand. */
  async today(userId: string, now: Date = new Date()): Promise<TaskView[]> {
    const { timezone } = await this.member.clock(userId);
    return this.dueOn(userId, localDate(now, timezone));
  }
}

/**
 * The next calendar date, by calendar rather than by adding a day's worth of
 * milliseconds — a spring-forward day is 23 hours long, and 24 hours after its
 * midnight is one o'clock the following morning.
 */
function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1),
  );
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate(),
  ).padStart(2, '0')}`;
}
