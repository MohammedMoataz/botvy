import { describe, expect, it } from 'vitest';
import {
  compareTasksIn,
  matchesTaskView,
  taskView,
  taskViewDay,
} from './taskViews.js';
import type { TaskListView, TaskRow } from './tasks-store.js';

/**
 * The client's six lists, held to the server's predicate table.
 *
 * `backend/src/contexts/planning/infrastructure/mongo-task-read.repository.ts`
 * holds `taskPredicateFor`, and the in-memory adapter *applies* it rather than
 * paraphrasing it — the two were reconciled because a paraphrase had already
 * let them disagree. This file is the third implementation, in another runtime,
 * and the only thing keeping it from being a *different* one is the table
 * below: each row is a clause of the server's, transcribed, and the cases are
 * chosen to sit on the boundaries those clauses turn on.
 *
 * The server's clauses, for whoever has to check this against it again:
 *
 * | view      | server                                              |
 * |-----------|-----------------------------------------------------|
 * | today     | `deletedAt: null, status: 'open', dueAt: { $ne: null, $lt: dayEnd }`   |
 * | upcoming  | `deletedAt: null, status: 'open', dueAt: { $gte: dayEnd }`             |
 * | overdue   | `deletedAt: null, status: 'open', dueAt: { $ne: null, $lt: dayStart }` |
 * | label     | `deletedAt: null, labelId: filter.labelId ?? null`                     |
 * | completed | `deletedAt: null, status: 'completed'`                                 |
 * | deleted   | `deletedAt: { $ne: null }`                                             |
 *
 * Two translations are worth saying out loud, because they are where a
 * paraphrase would go wrong. `$lt: dayEnd` over instants is `<= today` over
 * calendar dates, since `dayEnd` is the last instant of the member's own day —
 * which is also why nothing here does boundary arithmetic and a 23-hour
 * spring-forward day cannot be got wrong. And `upcoming` carries no `$ne: null`
 * because Mongo sorts null below every date and so never matches `$gte` on one;
 * a client has to say it, and the `no-date` case is what would catch a client
 * that forgot.
 *
 * Dates are fixed and `now` is passed in, so none of this reads the clock and
 * none of it is a time bomb.
 */

const NOW = new Date('2026-09-10T09:00:00.000Z');
/** 09:00 UTC on the 10th is noon on the 10th in Cairo. */
const ZONE = 'Africa/Cairo';
const DAY = taskViewDay({ timezone: ZONE, now: NOW, labelId: 'work' });

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'id',
    title: 'A thing',
    notes: null,
    dueAt: null,
    allDay: false,
    priority: 4,
    labelId: null,
    label: null,
    status: 'open',
    completedAt: null,
    recurrence: null,
    estimatedMinutes: null,
    deferCount: 0,
    deferredFrom: null,
    source: 'app',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    deletedAt: null,
    baseUpdatedAt: null,
    pendingOp: null,
    ...over,
  };
}

/** The rows, each one sitting on a boundary the server's clauses turn on. */
const ROWS = {
  /** Yesterday, still open: the case the whole "Today is not one day" rule is about. */
  yesterday: task({ id: 'yesterday', dueAt: '2026-09-09T09:00:00.000Z' }),
  /** Later today in Cairo — 21:00 local, which is still the 10th. */
  today: task({ id: 'today', dueAt: '2026-09-10T18:00:00.000Z' }),
  /** 23:30 UTC on the 10th is 02:30 on the *11th* in Cairo: upcoming, not today. */
  midnight: task({ id: 'midnight', dueAt: '2026-09-10T23:30:00.000Z' }),
  tomorrow: task({ id: 'tomorrow', dueAt: '2026-09-11T09:00:00.000Z' }),
  /** No date at all — the row `$gte: dayEnd` silently never matches. */
  noDate: task({ id: 'no-date' }),
  done: task({
    id: 'done',
    dueAt: '2026-09-10T07:00:00.000Z',
    status: 'completed',
    completedAt: '2026-09-10T08:00:00.000Z',
  }),
  /** Cancelled is neither open nor completed, so it is in no list but `label`. */
  cancelled: task({
    id: 'cancelled',
    dueAt: '2026-09-10T07:00:00.000Z',
    status: 'cancelled',
  }),
  /** A tombstone that was completed — the Deleted view has to still say so. */
  binned: task({
    id: 'binned',
    dueAt: '2026-09-10T07:00:00.000Z',
    status: 'completed',
    completedAt: '2026-09-10T08:00:00.000Z',
    deletedAt: '2026-09-10T08:30:00.000Z',
  }),
  labelled: task({ id: 'labelled', labelId: 'work' }),
  /** Labelled and deleted: excluded from `label`, because `deleted` is a filter on every view but its own. */
  labelledBinned: task({
    id: 'labelled-binned',
    labelId: 'work',
    deletedAt: '2026-09-10T08:30:00.000Z',
  }),
  otherLabel: task({ id: 'other-label', labelId: 'home' }),
} satisfies Record<string, TaskRow>;

/** Which rows each view takes. Everything not named is asserted to be refused. */
const TABLE: Record<TaskListView, (keyof typeof ROWS)[]> = {
  today: ['yesterday', 'today'],
  upcoming: ['midnight', 'tomorrow'],
  overdue: ['yesterday'],
  label: ['labelled'],
  completed: ['done'],
  deleted: ['binned', 'labelledBinned'],
};

describe('the six views, against the server’s predicate table', () => {
  for (const [view, taken] of Object.entries(TABLE) as [
    TaskListView,
    (keyof typeof ROWS)[],
  ][]) {
    for (const [name, row] of Object.entries(ROWS) as [
      keyof typeof ROWS,
      TaskRow,
    ][]) {
      const wanted = taken.includes(name);
      it(`${view} ${wanted ? 'takes' : 'refuses'} ${name}`, () => {
        expect(matchesTaskView(view, row, DAY)).toBe(wanted);
      });
    }
  }

  /**
   * The rule the whole table exists for, stated once on its own so that a
   * reader who skips the table still meets it: a task the member has not dealt
   * with is still theirs to deal with today, so Today carries the overdue ones
   * and Overdue is a second view onto the same rows rather than a tab that
   * takes them away.
   */
  it('keeps an overdue task in Today as well as in Overdue', () => {
    expect(matchesTaskView('today', ROWS.yesterday, DAY)).toBe(true);
    expect(matchesTaskView('overdue', ROWS.yesterday, DAY)).toBe(true);
  });

  /** Deleting never touched the status, which is what the Deleted view shows. */
  it('reports a deleted task’s original status', () => {
    expect(matchesTaskView('deleted', ROWS.binned, DAY)).toBe(true);
    expect(ROWS.binned.status).toBe('completed');
  });

  /** `label` with no label named is the member's unlabelled tasks, as `?? null` says. */
  it('reads a label filter of null as the unlabelled ones', () => {
    const unlabelled = taskViewDay({ timezone: ZONE, now: NOW });
    expect(matchesTaskView('label', ROWS.noDate, unlabelled)).toBe(true);
    expect(matchesTaskView('label', ROWS.labelled, unlabelled)).toBe(false);
  });
});

describe('the day is the member’s, not the machine’s', () => {
  /**
   * One instant, two zones, two right answers — and the only thing deciding
   * between them is the zone passed in. This is the assertion that fails
   * against an implementation reading the host's own zone, which is the mistake
   * that once shifted every extracted reminder by three hours.
   */
  it('puts one task on Today in Cairo and on Upcoming in Los Angeles', () => {
    // 01:00 UTC on the 11th: the 11th in Cairo (+03), still the 10th in LA.
    const now = new Date('2026-09-11T01:00:00.000Z');
    const row = task({ id: 'due-11th', dueAt: '2026-09-11T18:00:00.000Z' });

    const cairo = taskViewDay({ timezone: 'Africa/Cairo', now });
    const la = taskViewDay({ timezone: 'America/Los_Angeles', now });

    expect(matchesTaskView('today', row, cairo)).toBe(true);
    expect(matchesTaskView('today', row, la)).toBe(false);
    expect(matchesTaskView('upcoming', row, la)).toBe(true);
  });
});

describe('the order each view is read in', () => {
  it('sorts by due date, then priority', () => {
    const early = task({ id: 'early', dueAt: '2026-09-10T08:00:00.000Z' });
    const lateHigh = task({
      id: 'late-high',
      dueAt: '2026-09-10T18:00:00.000Z',
      priority: 1,
    });
    const lateLow = task({
      id: 'late-low',
      dueAt: '2026-09-10T18:00:00.000Z',
      priority: 3,
    });

    expect(
      taskView('today', [lateLow, lateHigh, early], {
        timezone: ZONE,
        now: NOW,
      }).map((row) => row.id),
    ).toEqual(['early', 'late-high', 'late-low']);
  });

  /**
   * Null first, which is Mongo's ordering and therefore both server adapters'.
   * A client sorting nulls last would put this list in a different order from
   * the phone's — the exact silent disagreement the two adapters were
   * reconciled to end. `enhancements/E-007` records the preference; if it is
   * ever taken, this changes with it.
   */
  it('sorts an undated task above a dated one in the label view', () => {
    const dated = task({
      id: 'dated',
      labelId: 'work',
      dueAt: '2026-09-10T08:00:00.000Z',
    });
    const undated = task({ id: 'undated', labelId: 'work' });

    expect(
      taskView('label', [dated, undated], {
        timezone: ZONE,
        now: NOW,
        labelId: 'work',
      }).map((row) => row.id),
    ).toEqual(['undated', 'dated']);
  });

  it('sorts completed and deleted newest first', () => {
    const older = task({
      id: 'older',
      status: 'completed',
      completedAt: '2026-09-08T08:00:00.000Z',
      deletedAt: '2026-09-08T09:00:00.000Z',
    });
    const newer = task({
      id: 'newer',
      status: 'completed',
      completedAt: '2026-09-09T08:00:00.000Z',
      deletedAt: '2026-09-09T09:00:00.000Z',
    });

    expect(compareTasksIn('completed', newer, older)).toBeLessThan(0);
    expect(compareTasksIn('deleted', newer, older)).toBeLessThan(0);
  });
});
