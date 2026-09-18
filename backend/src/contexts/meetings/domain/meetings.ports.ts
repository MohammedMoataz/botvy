/**
 * What the calendar needs and Meetings does not own.
 *
 * Two ports, declared here in `domain/` and bound in this context's own
 * `infrastructure/` to whichever context publishes the answer. That is the one
 * seam constitution IX sanctions: `infrastructure/` is the single layer allowed
 * to know another context exists, because binding a local port to somebody
 * else's published query is its job. Nothing under `domain/` or `features/`
 * here imports anything from another context, and `no-restricted-imports`
 * refuses it if anyone tries.
 *
 * The agenda is the one screen in the product that is genuinely cross-context —
 * a day holds meetings, tasks, training and personal events — so it is also the
 * screen most likely to be built by reaching into three collections. These
 * ports are what it reaches through instead.
 */

/** A task with a time, as the agenda shows it. Planning's `timedBetween`. */
export interface AgendaTask {
  id: string;
  title: string;
  dueAt: Date;
  priority: number;
  /** The label's colour, so the agenda can tint the row as the list does. */
  color: string | null;
}

/**
 * Tasks carrying a time, over a window.
 *
 * Bound to Planning's `TasksDueQueryHandler.timedBetween`, which that phase
 * declared for exactly this caller — a range query rather than a day at a time,
 * because an agenda spans a month and asking day by day would be thirty round
 * trips.
 *
 * All-day tasks are excluded by Planning's adapter and that is right: an agenda
 * is an hour grid, and "buy milk, some time today" has no hour to sit at. It
 * appears in the day's task list instead, which is a different part of the same
 * screen.
 */
export abstract class TimedTasksPort {
  abstract between(userId: string, from: Date, to: Date): Promise<AgendaTask[]>;
}

/** A training session, as the agenda shows it. */
export interface AgendaSession {
  id: string;
  title: string;
  sport: string;
  startAt: Date;
  durationMin: number;
}

/**
 * Training sessions over a window.
 *
 * **Stubbed until P6.** The implementation registered in `meetings.module.ts`
 * returns an empty list, and the agenda renders correctly without a training
 * row — the spec's day view is built from what is present rather than from a
 * template with a hole in it.
 *
 * An empty-list stub rather than an optional dependency, because the
 * alternative is a branch inside the agenda asking whether Training exists yet,
 * and that branch would still be there in P9. P6 replaces one line in the
 * module and every call site is already correct. The same reasoning, and the
 * same shape, as P3's `NextSessionPort`.
 */
export abstract class TrainingSessionsPort {
  abstract between(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<AgendaSession[]>;
}
