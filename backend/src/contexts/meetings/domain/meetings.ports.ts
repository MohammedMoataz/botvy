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

/**
 * The member's own default meeting length.
 *
 * ## Why this is a third port rather than a field on the shared one
 *
 * Constitution XII: anything a member might want different is a
 * `user_preferences` field seeded from `settings.defaults.*`, and
 * `meetingDurationMin` is one — a member who works in half-hour blocks and one
 * who works in hours both have the preference, and reading the installation
 * default instead means the editor silently ignores what they set. A
 * hard-coded default is a bug, and so is a *shared* default standing in for a
 * member's.
 *
 * The obvious alternative was `MemberContextPort` in `shared/`, which already
 * carries the time zone and the lead times for exactly this kind of reason.
 * Rejected because that port's own comment asks for a decision rather than a
 * convenience: it is the *scheduling-relevant* slice of a profile that
 * **three** contexts need, and every field on it widens what all three can see
 * of a fourth. This one is wanted by one context. The constitution's rule for
 * a helper is the same shape — duplicate over share until the third caller —
 * and a port declared here, bound in this context's own `infrastructure/`, is
 * the seam that already exists for the purpose.
 *
 * Never null: a member with no preferences row is a member mid-bootstrap, and
 * the honest answer is the installation default the bootstrap is about to
 * write. The adapter falls back so the caller stays simple, which is the same
 * decision `MemberContextPort` documents.
 */
export abstract class MeetingDefaultsPort {
  abstract durationMinFor(userId: string): Promise<number>;
}
