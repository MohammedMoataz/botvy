import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
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
    const mine = [...this.taskStore.rows.values()].filter(
      (row) => row.userId === userId,
    );

    // The same predicates as the Mongo adapter, in the same order, because a
    // view whose definition differs between the two is a view whose spec proves
    // nothing about production.
    const matches = mine.filter((row) => {
      switch (filter.view) {
        case 'today':
          return (
            row.deletedAt === null &&
            row.status === 'open' &&
            row.dueAt !== null &&
            row.dueAt < filter.dayEnd
          );
        case 'upcoming':
          return (
            row.deletedAt === null &&
            row.status === 'open' &&
            row.dueAt !== null &&
            row.dueAt >= filter.dayEnd
          );
        case 'overdue':
          return (
            row.deletedAt === null &&
            row.status === 'open' &&
            row.dueAt !== null &&
            row.dueAt < filter.dayStart
          );
        case 'label':
          return (
            row.deletedAt === null && row.labelId === (filter.labelId ?? null)
          );
        case 'completed':
          return row.deletedAt === null && row.status === 'completed';
        case 'deleted':
          return row.deletedAt !== null;
      }
    });

    const sorted = matches.sort((a, b) => {
      if (filter.view === 'completed')
        return time(b.completedAt) - time(a.completedAt);
      if (filter.view === 'deleted')
        return time(b.deletedAt) - time(a.deletedAt);
      return time(a.dueAt) - time(b.dueAt) || a.priority - b.priority;
    });

    const after = filter.cursor
      ? Number(Buffer.from(filter.cursor, 'base64url').toString('utf8'))
      : null;
    const paged =
      after === null
        ? sorted
        : sorted.filter((row) => row.updatedAt.getTime() > after);

    const hasMore = paged.length > filter.limit;
    const nodes = (hasMore ? paged.slice(0, filter.limit) : paged).map((row) =>
      viewOf(row, filter.timezone),
    );

    return {
      nodes,
      nextCursor: hasMore
        ? Buffer.from(
            String(nodes[nodes.length - 1]!.updatedAt.getTime()),
            'utf8',
          ).toString('base64url')
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

function time(at: Date | null): number {
  // Undated sorts last, matching the Mongo adapter's comment about `null`
  // dueAt meaning "some day" rather than "right now".
  return at ? at.getTime() : Number.MAX_SAFE_INTEGER;
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
