import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import {
  compareRows,
  decodeCursor,
  encodeCursor,
  isAfter,
  positionOf,
} from '../../../shared/persistence/keyset-cursor.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
import { Label, type LabelState } from '../domain/label.aggregate.js';
import { LabelRepository } from '../domain/label.repository.js';
import { Recurrence } from '../domain/recurrence.js';
import type {
  LabelView,
  TaskListFilter,
  TaskPage,
  TaskReadRepository,
  TaskView,
} from '../domain/task-read.repository.js';
import {
  Task,
  type LabelSnapshot,
  type TaskState,
} from '../domain/task.aggregate.js';
import { TaskRepository } from '../domain/task.repository.js';
import {
  TASK_SORT_KEYS,
  taskPredicateFor,
} from './mongo-task-read.repository.js';

/**
 * The adapters every Planning handler spec binds.
 *
 * They are held to the same three promises the Mongo ones make, because a
 * handler that passes here and misbehaves against a real database is worse than
 * no test at all:
 *
 * 1. **Events are pulled on save**, so a spec asserting an event means
 *    something. An adapter that left them on the aggregate would let every
 *    "raises TaskScheduled" assertion pass vacuously.
 * 2. **`StaleWriteError` on an older copy**, the same refusal the optimistic
 *    filter gives.
 * 3. **The label name rule**, including that tombstones do not take part in it.
 *    In production that is a partial unique index; here it is the check below.
 *    The mimicry is what makes T204's spec meaningful — but it is mimicry, and
 *    the index itself is proved by the migration running and the gate creating
 *    a duplicate against a real Mongo. Neither test replaces the other.
 */
@Injectable()
export class InMemoryTaskRepository extends TaskRepository {
  readonly rows = new Map<string, TaskState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Task | null> {
    const row = this.rows.get(id);
    // Scoped by owner, not merely by id — a spec that forgets the scope should
    // fail here rather than in production.
    if (!row || row.userId !== userId) return null;
    return Task.rehydrate(clone(row));
  }

  async save(task: Task): Promise<void> {
    const existing = this.rows.get(task.id);
    if (existing && existing.updatedAt > task.updatedAt) {
      throw new StaleWriteError(task.id);
    }
    this.#raise(task.pullEvents());
    this.rows.set(task.id, stateOf(task));
  }

  async remove(task: Task): Promise<void> {
    this.#raise(task.pullEvents());
    this.rows.delete(task.id);
  }

  async findMany(userId: string, ids: string[]): Promise<Task[]> {
    return ids
      .map((id) => this.rows.get(id))
      .filter(
        (row): row is TaskState => row !== undefined && row.userId === userId,
      )
      .map((row) => Task.rehydrate(clone(row)));
  }

  async pullSince(userId: string, since: Date | null): Promise<Task[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => Task.rehydrate(clone(row)));
  }

  async refreshLabelSnapshots(
    userId: string,
    labelId: string,
    snapshot: LabelSnapshot | null,
    at: Date,
  ): Promise<number> {
    let touched = 0;
    for (const row of this.rows.values()) {
      if (row.userId !== userId || row.labelId !== labelId) continue;
      if (
        row.label?.name === snapshot?.name &&
        row.label?.color === snapshot?.color
      )
        continue;
      row.label = snapshot;
      if (snapshot === null) row.labelId = null;
      row.updatedAt = at;
      touched += 1;
    }
    return touched;
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    let purged = 0;
    // Deleting from a Map while iterating it is defined behaviour — the
    // iterator tolerates removal of the current entry — so no snapshot copy is
    // needed here or in the three loops like it below.
    for (const [id, row] of this.rows) {
      if (userId && row.userId !== userId) continue;
      if (row.deletedAt && row.deletedAt < before) {
        this.rows.delete(id);
        purged += 1;
      }
    }
    return purged;
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

/** Raised where Mongo would raise a duplicate-key error, so a handler's translation is exercised. */
export class InMemoryDuplicateKeyError extends Error {
  readonly code = 11_000;

  constructor(readonly index: string) {
    super(`E11000 duplicate key error collection: index: ${index}`);
    this.name = 'MongoServerError';
  }
}

@Injectable()
export class InMemoryLabelRepository extends LabelRepository {
  readonly rows = new Map<string, LabelState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Label | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Label.rehydrate(clone(row));
  }

  /**
   * The unique-name rule, enforced where the index enforces it: at the write.
   *
   * A tombstone has no `nameLower` in production and takes no part in the
   * index, so it takes no part here either — which is what lets a member delete
   * "Work" and immediately create "Work" again. Getting this wrong in the
   * adapter would make the spec for that behaviour pass against a rule the
   * database does not have.
   */
  async save(label: Label): Promise<void> {
    const existing = this.rows.get(label.id);
    if (existing && existing.updatedAt > label.updatedAt) {
      throw new StaleWriteError(label.id);
    }

    const nameLower = label.nameLower;
    if (nameLower !== undefined) {
      for (const [id, row] of this.rows) {
        if (id === label.id || row.userId !== label.userId) continue;
        if (row.deletedAt !== null) continue; // no nameLower, so not in the index
        if (row.name.toLowerCase() === nameLower) {
          throw new InMemoryDuplicateKeyError('labels_user_name_unique');
        }
      }
    }

    this.#raise(label.pullEvents());
    this.rows.set(label.id, {
      id: label.id,
      userId: label.userId,
      name: label.name,
      color: label.color,
      sortOrder: label.sortOrder,
      createdAt: label.createdAt,
      updatedAt: label.updatedAt,
      deletedAt: label.deletedAt,
    });
  }

  async remove(label: Label): Promise<void> {
    this.#raise(label.pullEvents());
    this.rows.delete(label.id);
  }

  async findByName(userId: string, name: string): Promise<Label | null> {
    const wanted = name.trim().toLowerCase();
    for (const row of this.rows.values()) {
      if (row.userId !== userId || row.deletedAt !== null) continue;
      if (row.name.toLowerCase() === wanted) return Label.rehydrate(clone(row));
    }
    return null;
  }

  async findAll(userId: string, includeDeleted = false): Promise<Label[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId && (includeDeleted || row.deletedAt === null),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((row) => Label.rehydrate(clone(row)));
  }

  async pullSince(userId: string, since: Date | null): Promise<Label[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => Label.rehydrate(clone(row)));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    let purged = 0;
    for (const [id, row] of this.rows) {
      if (userId && row.userId !== userId) continue;
      if (row.deletedAt && row.deletedAt < before) {
        this.rows.delete(id);
        purged += 1;
      }
    }
    return purged;
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

/**
 * The read side over the same two Maps the write adapters hold.
 *
 * Sharing the storage rather than keeping a projection of its own is the point:
 * a spec writes through a handler and reads through a query, and if those two
 * talked to different copies the spec would be testing the copy.
 */
@Injectable()
export class InMemoryTaskReadRepository implements TaskReadRepository {
  constructor(
    private readonly taskStore: InMemoryTaskRepository,
    private readonly labelStore: InMemoryLabelRepository,
  ) {}

  async page(userId: string, filter: TaskListFilter): Promise<TaskPage> {
    const keys = TASK_SORT_KEYS[filter.view];
    const predicate = taskPredicateFor(filter);

    // The Mongo adapter's own predicate table and sort keys, applied here
    // rather than paraphrased. Paraphrasing is what made this adapter and the
    // store disagree about where a null `dueAt` sorts, under a comment claiming
    // they matched.
    const matches = [...this.taskStore.rows.values()].filter(
      (row) => row.userId === userId && matchesPredicate(row, predicate),
    );

    const sorted = matches.sort((a, b) =>
      compareRows(keys, docOf(a), a.id, docOf(b), b.id),
    );

    const position = filter.cursor ? decodeCursor(filter.cursor) : null;
    const paged = position
      ? sorted.filter((row) => isAfter(keys, position, docOf(row), row.id))
      : sorted;

    const hasMore = paged.length > filter.limit;
    const page = hasMore ? paged.slice(0, filter.limit) : paged;
    const last = page.at(-1);

    return {
      nodes: page.map((row) => viewOf(row, filter.timezone)),
      nextCursor:
        hasMore && last
          ? encodeCursor(positionOf(keys, docOf(last), last.id))
          : null,
    };
  }

  async byId(
    userId: string,
    id: string,
    timezone: string,
  ): Promise<TaskView | null> {
    const row = this.taskStore.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return viewOf(row, timezone);
  }

  async labels(userId: string, includeDeleted: boolean): Promise<LabelView[]> {
    const counts = new Map<string, number>();
    for (const row of this.taskStore.rows.values()) {
      if (
        row.userId !== userId ||
        row.deletedAt !== null ||
        row.status !== 'open' ||
        !row.labelId
      )
        continue;
      counts.set(row.labelId, (counts.get(row.labelId) ?? 0) + 1);
    }

    return [...this.labelStore.rows.values()]
      .filter(
        (row) =>
          row.userId === userId && (includeDeleted || row.deletedAt === null),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        sortOrder: row.sortOrder,
        openTaskCount: counts.get(row.id) ?? 0,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
      }));
  }

  async dueBetween(
    userId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<TaskView[]> {
    return this.#open(userId)
      .filter(
        (row) => row.dueAt !== null && row.dueAt >= from && row.dueAt < to,
      )
      .sort((a, b) => a.priority - b.priority || time(a.dueAt) - time(b.dueAt))
      .map((row) => viewOf(row, timezone));
  }

  async openBefore(
    userId: string,
    before: Date,
    timezone: string,
  ): Promise<TaskView[]> {
    return this.#open(userId)
      .filter((row) => row.dueAt !== null && row.dueAt < before)
      .sort((a, b) => time(a.dueAt) - time(b.dueAt) || a.priority - b.priority)
      .map((row) => viewOf(row, timezone));
  }

  async timedBetween(
    userId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<TaskView[]> {
    return this.#open(userId)
      .filter(
        (row) =>
          !row.allDay &&
          row.dueAt !== null &&
          row.dueAt >= from &&
          row.dueAt < to,
      )
      .sort((a, b) => time(a.dueAt) - time(b.dueAt))
      .map((row) => viewOf(row, timezone));
  }

  #open(userId: string): TaskState[] {
    return [...this.taskStore.rows.values()].filter(
      (row) =>
        row.userId === userId &&
        row.deletedAt === null &&
        row.status === 'open',
    );
  }
}

/**
 * For the three cross-context queries, which all filter to a non-null `dueAt`
 * before sorting — so where null would sort is moot there, and this stays a
 * plain numeric comparison rather than borrowing the cursor helper's ordering.
 */
function time(at: Date | null): number {
  return at ? at.getTime() : 0;
}

/**
 * A stored row as the document shape the shared cursor helper reads.
 *
 * The in-memory rows carry `id`; Mongo documents carry `_id`. Everything else
 * has the same name, which is why one comparator can serve both.
 */
function docOf(row: TaskState): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

/**
 * The Mongo predicate objects, evaluated in memory.
 *
 * Only the handful of operators the view predicates actually use — `$ne`,
 * `$lt`, `$gte` — and an unknown operator throws rather than being ignored.
 * Silently skipping one would make this adapter *more* permissive than the
 * store, so a spec would pass against rows production would not return, which
 * is the failure mode this whole exercise is about.
 */
function matchesPredicate(
  row: TaskState,
  predicate: Record<string, unknown>,
): boolean {
  for (const [field, expected] of Object.entries(predicate)) {
    const actual = docOf(row)[field] ?? null;
    if (
      expected === null ||
      expected instanceof Date ||
      typeof expected !== 'object'
    ) {
      if (compare(actual, expected ?? null) !== 0) return false;
      continue;
    }
    for (const [operator, operand] of Object.entries(
      expected as Record<string, unknown>,
    )) {
      const order = compare(actual, operand ?? null);
      switch (operator) {
        case '$ne':
          if (order === 0) return false;
          break;
        case '$lt':
          if (!(order < 0)) return false;
          break;
        case '$gte':
          if (!(order >= 0)) return false;
          break;
        default:
          throw new Error(
            `in-memory adapter cannot evaluate "${operator}"; teach it the operator rather than ignoring it`,
          );
      }
    }
  }
  return true;
}

/** Mongo's own ordering: null below everything, then dates and numbers. */
function compare(a: unknown, b: unknown): number {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  if (typeof left === 'number' && typeof right === 'number')
    return left - right;
  return String(left) < String(right)
    ? -1
    : String(left) > String(right)
      ? 1
      : 0;
}

function viewOf(row: TaskState, timezone: string): TaskView {
  const rule = row.recurrence
    ? Recurrence.parse(row.recurrence, timezone)
    : null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: row.dueAt,
    allDay: row.allDay,
    priority: row.priority,
    labelId: row.labelId,
    label: row.label,
    status: row.status,
    completedAt: row.completedAt,
    repeats: row.recurrence !== null,
    recurrenceMode: row.recurrence?.mode ?? null,
    recurrenceText: rule ? rule.humanText() : (row.recurrence?.rrule ?? null),
    estimatedMinutes: row.estimatedMinutes,
    deferCount: row.deferCount,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function stateOf(task: Task): TaskState {
  return {
    id: task.id,
    userId: task.userId,
    title: task.title,
    notes: task.notes,
    dueAt: task.dueAt,
    allDay: task.allDay,
    priority: task.priority,
    labelId: task.labelId,
    label: task.label,
    status: task.status,
    completedAt: task.completedAt,
    recurrence: task.recurrence,
    estimatedMinutes: task.estimatedMinutes,
    deferCount: task.deferCount,
    deferredFrom: task.deferredFrom,
    source: task.source,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}

/**
 * A deep copy on the way out, so a handler that mutates what it read cannot
 * change the stored row without saving. `structuredClone` keeps Dates as Dates,
 * which a JSON round trip would not.
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}
