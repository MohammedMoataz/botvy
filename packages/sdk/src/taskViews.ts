import type { TaskListView, TaskRow, TaskViewFilter } from './tasks-store.js';

/**
 * What each of the member's six lists *is*, as one predicate and one order.
 *
 * ## Why this is not on `TasksStore`
 *
 * It was, and the extension could not reach it: `TasksStore` holds its rows in
 * a `MemorySyncTable` it constructs itself, its reads are synchronous, and the
 * panel's rows live in Dexie. So the panel restated Today in its own code —
 * the fourth copy of the member's-day rule after the two server adapters and
 * the store, and the expensive kind of duplication, because Today is a *rule*
 * rather than a filter anyone can re-derive by looking at it (E-011).
 *
 * The definitions live here instead, as functions over rows a caller already
 * has. No storage, no async, no store: the portal keeps `TasksStore.view` for
 * its synchronous convenience, the panel applies the same predicate to whatever
 * Dexie handed it, and there is one copy of the rule on this side of the wire.
 *
 * ## It still mirrors the server, and that is priced deliberately
 *
 * `backend/.../mongo-task-read.repository.ts` holds `taskPredicateFor`, and the
 * in-memory adapter applies it rather than paraphrasing it — the two were
 * reconciled precisely because a paraphrase had let them disagree about null
 * ordering under a comment claiming they matched. That is another *runtime*;
 * the constitution prices a copy across runtimes rather than sharing one, so
 * this file is a third implementation on purpose. What it is not allowed to be
 * is a *different* one, which is why `taskViews.spec.ts` reproduces the
 * server's predicate table case for case rather than testing what this file
 * happens to do.
 *
 * ## The two rules that must never drift
 *
 * **Today is not one day.** It is today's tasks plus everything still open
 * whose moment has passed, because a member opening the panel at 09:00 needs
 * yesterday's unfinished work more than they need a tidy definition. A list
 * that hid overdue tasks behind a second tab is a list that loses them.
 *
 * **Every view except `deleted` excludes tombstones**, and `deleted` shows only
 * tombstones — the same field read two ways, which is what lets the Deleted
 * view report that a removed task had been completed. Deleting never touched
 * the status.
 *
 * Nothing here compares instants across a day boundary: `localDay` turns both
 * sides into `YYYY-MM-DD` first, so a 23-hour spring-forward day needs no
 * arithmetic and cannot be got wrong.
 */

/**
 * The calendar date an instant falls on, where the member is.
 *
 * **Times belong to the member, not to the machine.** `timeZone` is a required
 * argument and there is no default: reading the host's own zone here is the
 * mistake that once shifted every extracted reminder by three hours, and a
 * browser in a hotel is no more authoritative than a server in Frankfurt. The
 * caller passes `profile.timezone`.
 *
 * Comparing *calendar dates* is also why this returns a string rather than a
 * pair of instants. The server computes `dayStart`/`dayEnd` with a
 * daylight-saving-aware helper because it filters in Mongo; a client comparing
 * `YYYY-MM-DD` needs no boundary arithmetic at all, and `dueAt < dayEnd` is
 * exactly `localDay(dueAt) <= localDay(now)`. No arithmetic is no chance to get
 * a 23-hour spring-forward day wrong.
 *
 * It lives here rather than in `tasks-store.ts`, where it was, because the
 * predicates below are its principal caller and a store importing a view
 * module that imports the store back is a cycle waiting to be tripped over.
 * `@botvy/sdk` exports it under the same name, so no caller changed.
 */
export function localDay(instant: string | Date, timeZone: string): string {
  // `en-CA` because its short date format is already `YYYY-MM-DD`, so the parts
  // need no reassembly and no locale can reorder them.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant instanceof Date ? instant : new Date(instant));
}

/**
 * The member's day, resolved once, plus what `label` needs to know.
 *
 * Resolved once rather than per row: `localDay` builds an `Intl` formatter, and
 * a Today list over a few hundred rows would otherwise build a few hundred of
 * them to answer the same question.
 */
export interface TaskViewDay {
  /** The member's own zone, from their profile. Never the host's. */
  timezone: string;
  /** Their calendar day, `YYYY-MM-DD`, as `localDay` writes it. */
  today: string;
  /** Required for `label`, ignored otherwise. */
  labelId?: string | null;
}

/** The member's day from a filter — `now` defaults to this instant. */
export function taskViewDay(filter: TaskViewFilter): TaskViewDay {
  return {
    timezone: filter.timezone,
    today: localDay(filter.now ?? new Date(), filter.timezone),
    labelId: filter.labelId ?? null,
  };
}

/**
 * Whether a row belongs in a view — the client's copy of `taskPredicateFor`.
 *
 * The server's clauses translate one for one. `dueAt: { $ne: null, $lt: dayEnd }`
 * is `due !== null && due <= today`, because `dayEnd` is the last instant of
 * the member's today and a calendar-date comparison needs no boundary. `$gte:
 * dayEnd` is `due > today`, and it carries no `$ne: null` because Mongo sorts
 * null below every date and so never matches it — which a client has to say out
 * loud.
 */
export function matchesTaskView(
  view: TaskListView,
  row: TaskRow,
  day: TaskViewDay,
): boolean {
  const due = row.dueAt ? localDay(row.dueAt, day.timezone) : null;

  switch (view) {
    case 'today':
      return (
        row.deletedAt === null &&
        row.status === 'open' &&
        due !== null &&
        due <= day.today
      );
    case 'upcoming':
      return (
        row.deletedAt === null &&
        row.status === 'open' &&
        due !== null &&
        due > day.today
      );
    case 'overdue':
      return (
        row.deletedAt === null &&
        row.status === 'open' &&
        due !== null &&
        due < day.today
      );
    case 'label':
      return row.deletedAt === null && row.labelId === (day.labelId ?? null);
    case 'completed':
      return row.deletedAt === null && row.status === 'completed';
    case 'deleted':
      return row.deletedAt !== null;
  }
}

/**
 * The order a view is read in, mirroring the server's `TASK_SORT_KEYS`.
 *
 * A null date sorts **first** — deliberately, and not because it is nicer.
 * MongoDB orders null below every date, so both server adapters put an undated
 * task above everything with a deadline; `label` is the only view that carries
 * one, and `E-007` records that ordering as a known cost rather
 * than a defect. A client that quietly sorted nulls last would put the panel's
 * by-label list in a different order from the phone's, which is exactly the
 * silent disagreement the server's two adapters were reconciled to end. If
 * E-007 is ever taken, this line changes with it.
 */
export function compareTasksIn(
  view: TaskListView,
  left: TaskRow,
  right: TaskRow,
): number {
  if (view === 'completed')
    return time(right.completedAt) - time(left.completedAt);
  if (view === 'deleted') return time(right.deletedAt) - time(left.deletedAt);
  return time(left.dueAt) - time(right.dueAt) || left.priority - right.priority;
}

/**
 * One of the six lists, out of rows the caller already holds.
 *
 * Generic over the row so a surface keeps its own name for it — the panel's
 * `PanelTaskRow` comes back as `PanelTaskRow[]` rather than widening to
 * `TaskRow[]` on the way through.
 */
export function taskView<T extends TaskRow>(
  view: TaskListView,
  rows: readonly T[],
  filter: TaskViewFilter,
): T[] {
  const day = taskViewDay(filter);
  return rows
    .filter((row) => matchesTaskView(view, row, day))
    .sort((left, right) => compareTasksIn(view, left, right));
}

/** Milliseconds, with a null sorting first. See `compareTasksIn`. */
function time(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}
