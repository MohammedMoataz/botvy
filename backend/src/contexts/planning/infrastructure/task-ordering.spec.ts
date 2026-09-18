import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import type {
  TaskListFilter,
  TaskView,
} from '../domain/task-read.repository.js';
import type {
  Priority,
  TaskState,
  TaskStatus,
} from '../domain/task.aggregate.js';
import {
  InMemoryLabelRepository,
  InMemoryTaskReadRepository,
  InMemoryTaskRepository,
} from './in-memory-planning.repositories.js';
import {
  DUE_SORT_FIELD,
  NO_DUE_DATE_SORTS_AT,
  TASK_SORT_KEYS,
  dueSortStage,
  withDueSort,
} from './mongo-task-read.repository.js';

/**
 * Where an undated task sorts in the by-label view, and whether a page boundary
 * can lose one (E-007).
 *
 * MongoDB orders `null` below every date, so the one view that carries tasks
 * with no deadline showed "some day" above everything the member has actually
 * committed to. The design answer taken is the other way round — within a
 * status, a task with a deadline comes first — and it is reached with a
 * computed key rather than a stored `hasDueDate` boolean.
 *
 * ## Why this spec exists beside the handler specs
 *
 * Because the two adapters have already disagreed about exactly this question,
 * under a comment claiming they matched, and a handler spec binding the
 * in-memory adapter cannot see it. The sort key list, the sentinel and the
 * field name are one constant each, shared by both halves, and the first group
 * below asserts the *Mongo* half reads them — which is the only part of the
 * store's behaviour that can be checked without a store. The second group walks
 * the in-memory adapter through a mixed page boundary, which is where a cursor
 * that encoded the raw `null` would lose rows.
 */

const MEMBER = 'member-1';
const LABEL = 'label-1';
const CAIRO = 'Africa/Cairo';

function taskRow(id: string, overrides: Partial<TaskState> = {}): TaskState {
  const at = new Date('2026-01-01T00:00:00Z');
  return {
    id,
    userId: MEMBER,
    title: id,
    notes: null,
    dueAt: null,
    allDay: true,
    priority: 4 as Priority,
    labelId: LABEL,
    label: null,
    status: 'open' as TaskStatus,
    completedAt: null,
    recurrence: null,
    estimatedMinutes: null,
    deferCount: 0,
    deferredFrom: null,
    source: 'app',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
}

function labelFilter(overrides: Partial<TaskListFilter> = {}): TaskListFilter {
  return {
    view: 'label',
    labelId: LABEL,
    dayStart: new Date('2026-03-01T22:00:00Z'),
    dayEnd: new Date('2026-03-02T22:00:00Z'),
    now: new Date('2026-03-02T09:00:00Z'),
    timezone: CAIRO,
    locale: 'en',
    limit: 50,
    ...overrides,
  };
}

describe('the label view names one ordering, and both adapters read it', () => {
  it('sorts on the computed key, not on the raw due date', () => {
    expect(TASK_SORT_KEYS.label).toEqual([
      { field: 'status', direction: 'asc' },
      { field: DUE_SORT_FIELD, direction: 'asc' },
      { field: 'priority', direction: 'asc' },
    ]);
  });

  /**
   * The store's `$ifNull` and the in-memory `withDueSort` have to agree on one
   * instant. Two sentinels written out separately is how the adapters drifted
   * the first time; asserting the stage is built from the same constant is what
   * turns a future divergence into a red test.
   */
  it('projects the same sentinel the in-memory comparator uses', () => {
    expect(dueSortStage()).toEqual({
      $addFields: {
        [DUE_SORT_FIELD]: { $ifNull: ['$dueAt', NO_DUE_DATE_SORTS_AT] },
      },
    });

    const undated = withDueSort({ dueAt: null });
    expect(undated[DUE_SORT_FIELD]).toBe(NO_DUE_DATE_SORTS_AT);

    const due = new Date('2026-03-05T10:00:00Z');
    expect(withDueSort({ dueAt: due })[DUE_SORT_FIELD]).toBe(due);
  });

  /** Far enough out that no member reaches it, and after every real deadline. */
  it('puts the sentinel beyond any date a member can set', () => {
    expect(NO_DUE_DATE_SORTS_AT.getTime()).toBeGreaterThan(
      new Date('2200-01-01T00:00:00Z').getTime(),
    );
  });
});

describe('the by-label list, in order and across pages', () => {
  let tasks: InMemoryTaskRepository;
  let reads: InMemoryTaskReadRepository;

  beforeEach(() => {
    const uow = new InMemoryUnitOfWork();
    tasks = new InMemoryTaskRepository(uow);
    reads = new InMemoryTaskReadRepository(
      tasks,
      new InMemoryLabelRepository(uow),
    );
  });

  function seed(rows: TaskState[]): void {
    for (const row of rows) tasks.rows.set(row.id, row);
  }

  it('puts a task with a deadline above one without, inside each status', async () => {
    seed([
      taskRow('undated-open'),
      taskRow('due-later', { dueAt: new Date('2026-06-01T09:00:00Z') }),
      taskRow('due-soon', { dueAt: new Date('2026-03-04T09:00:00Z') }),
      taskRow('undated-done', {
        status: 'completed',
        completedAt: new Date('2026-02-01T09:00:00Z'),
      }),
      taskRow('done-with-date', {
        status: 'completed',
        completedAt: new Date('2026-02-01T09:00:00Z'),
        dueAt: new Date('2026-01-15T09:00:00Z'),
      }),
    ]);

    const page = await reads.page(MEMBER, labelFilter());

    // `status` is the first key and is unchanged — it is compared as a string,
    // so `completed` precedes `open`. What this change settles is the ordering
    // *within* each of those groups, and it is the same answer in both.
    expect(page.nodes.map((node) => node.id)).toEqual([
      'done-with-date',
      'undated-done',
      'due-soon',
      'due-later',
      'undated-open',
    ]);
  });

  /**
   * The failure this guards against is a cursor that encoded the raw `null`.
   * `mongoAfter` would then compare `null > null` — false on every branch but
   * the id tiebreak — and the second page would either repeat the dated rows or
   * drop every undated one. Five pages of two over a mixed set is the smallest
   * walk that crosses the boundary *inside* the undated group and again at the
   * seam between the two groups.
   */
  it('pages through a mixed set and returns every row exactly once', async () => {
    const dated = [0, 1, 2, 3, 4].map((n) =>
      taskRow(`dated-${n}`, {
        dueAt: new Date(`2026-04-0${n + 1}T09:00:00Z`),
      }),
    );
    const undated = [0, 1, 2, 3, 4].map((n) => taskRow(`undated-${n}`));
    seed([...undated, ...dated]);

    const seen: TaskView[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const page: { nodes: TaskView[]; nextCursor: string | null } =
        await reads.page(MEMBER, labelFilter({ limit: 2, cursor }));
      seen.push(...page.nodes);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen.map((node) => node.id)).toEqual([
      'dated-0',
      'dated-1',
      'dated-2',
      'dated-3',
      'dated-4',
      'undated-0',
      'undated-1',
      'undated-2',
      'undated-3',
      'undated-4',
    ]);
    expect(new Set(seen.map((node) => node.id)).size).toBe(10);
  });

  /**
   * The undated group has no date to break ties with, so the whole of its order
   * rests on the keys after `dueSort` — priority, then the id. A cursor that
   * stopped inside it must still advance.
   */
  it('keeps a stable order among undated tasks across a page boundary', async () => {
    seed([
      taskRow('c', { priority: 1 as Priority }),
      taskRow('a', { priority: 2 as Priority }),
      taskRow('b', { priority: 2 as Priority }),
    ]);

    const first = await reads.page(MEMBER, labelFilter({ limit: 1 }));
    expect(first.nodes.map((node) => node.id)).toEqual(['c']);
    expect(first.nextCursor).not.toBeNull();

    const rest = await reads.page(
      MEMBER,
      labelFilter({ limit: 10, cursor: first.nextCursor ?? undefined }),
    );
    expect(rest.nodes.map((node) => node.id)).toEqual(['a', 'b']);
  });
});
