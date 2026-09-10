import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  decodeCursor,
  encodeCursor,
  mongoAfter,
  mongoSort,
  positionOf,
  type SortKey,
} from '../../../shared/persistence/keyset-cursor.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import { Recurrence } from '../domain/recurrence.js';
import type {
  LabelView,
  TaskListFilter,
  TaskPage,
  TaskReadRepository,
  TaskView,
} from '../domain/task-read.repository.js';
import type { LabelDoc, TaskDoc } from './mongo-planning.repositories.js';

/**
 * The order each view is read in, and therefore the order its cursor walks.
 *
 * `mongoSort` appends `_id`, so every one of these is a *total* order — which
 * is what makes a page boundary unambiguous even when two tasks share a due
 * date to the millisecond.
 */
export const TASK_SORT_KEYS: Record<TaskListFilter['view'], SortKey[]> = {
  // Overdue first, then the rest of today, then by priority: the member's eye
  // should land on what is late.
  today: [
    { field: 'dueAt', direction: 'asc' },
    { field: 'priority', direction: 'asc' },
  ],
  upcoming: [
    { field: 'dueAt', direction: 'asc' },
    { field: 'priority', direction: 'asc' },
  ],
  overdue: [
    { field: 'dueAt', direction: 'asc' },
    { field: 'priority', direction: 'asc' },
  ],
  // The one view that carries undated tasks, and `null` sorts *first* here
  // because that is how Mongo orders it. Sorting them last would need an
  // aggregation with `$ifNull`, and the in-memory adapter would then have to
  // reproduce that rather than the store's own ordering — so the ordering
  // preference is recorded in `enhancements/` and the two adapters agree.
  label: [
    { field: 'status', direction: 'asc' },
    { field: 'dueAt', direction: 'asc' },
    { field: 'priority', direction: 'asc' },
  ],
  completed: [{ field: 'completedAt', direction: 'desc' }],
  deleted: [{ field: 'deletedAt', direction: 'desc' }],
};

/**
 * What each view *is*, as a filter. Exported so the in-memory adapter applies
 * the same predicates rather than its own paraphrase of them — a view whose
 * definition differs between the two is a view whose spec proves nothing about
 * production.
 *
 * **Today is not one day.** It is today's tasks *plus* everything still open
 * whose moment has passed, because a member opening the app at 09:00 needs to
 * see yesterday's unfinished work more than they need a tidy definition of
 * "today". A list that hid overdue tasks behind a second tab is a list that
 * loses them.
 *
 * **Every view except `deleted` excludes tombstones**, and `deleted` shows only
 * tombstones. Those are the same field read two ways, which is why the Deleted
 * view can report that a removed task had been completed: the delete never
 * touched the status.
 */
export function taskPredicateFor(filter: TaskListFilter): Record<string, unknown> {
  switch (filter.view) {
    case 'today':
      return { deletedAt: null, status: 'open', dueAt: { $ne: null, $lt: filter.dayEnd } };
    case 'upcoming':
      return { deletedAt: null, status: 'open', dueAt: { $gte: filter.dayEnd } };
    case 'overdue':
      return { deletedAt: null, status: 'open', dueAt: { $ne: null, $lt: filter.dayStart } };
    case 'label':
      return { deletedAt: null, labelId: filter.labelId ?? null };
    case 'completed':
      return { deletedAt: null, status: 'completed' };
    case 'deleted':
      return { deletedAt: { $ne: null } };
  }
}

/**
 * The read side against Mongo.
 *
 * Every query starts `{ userId }` and there is no method that does not. That is
 * not defensive style: a read port is the one place where forgetting the scope
 * produces no error, no exception and no failing test — just another member's
 * tasks on somebody's screen.
 */
@Injectable()
export class MongoTaskReadRepository implements TaskReadRepository {
  constructor(
    private readonly taskModel: Model<TaskDoc>,
    private readonly labelModel: Model<LabelDoc>,
  ) {}

  async page(userId: string, filter: TaskListFilter): Promise<TaskPage> {
    const query: Record<string, unknown> = { userId, ...taskPredicateFor(filter) };
    const keys = TASK_SORT_KEYS[filter.view];

    // The cursor is a position in *this* order, not a value in some unrelated
    // field. `keyset-cursor.ts` records what was wrong before and why it
    // survived a green suite.
    if (filter.cursor) {
      const position = decodeCursor(filter.cursor);
      if (position) Object.assign(query, mongoAfter(keys, position));
    }

    const docs = await this.taskModel
      .find(query)
      .sort(mongoSort(keys))
      .limit(filter.limit + 1)
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();

    // One more than asked for, so "is there another page" is answered without a
    // second count query against a collection that is being written to.
    const hasMore = docs.length > filter.limit;
    const page = hasMore ? docs.slice(0, filter.limit) : docs;
    const last = page.at(-1);

    return {
      nodes: page.map((doc) => toTaskView(doc, filter.timezone)),
      nextCursor:
        hasMore && last
          ? encodeCursor(positionOf(keys, last as unknown as Record<string, unknown>, last._id))
          : null,
    };
  }

  async byId(userId: string, id: string, timezone: string): Promise<TaskView | null> {
    const doc = await this.taskModel
      .findOne({ userId, _id: id })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc>()
      .exec();
    return doc ? toTaskView(doc, timezone) : null;
  }

  /**
   * Labels with their open-task counts, in two queries rather than one
   * `$lookup`.
   *
   * An aggregation would be one round trip and would also be a join, which
   * MongoDB will happily do and which this schema is not built for: the counts
   * come from a covered index on `{ userId, labelId }` and the labels from a
   * collection with a handful of rows per member. Two cheap reads beat one that
   * scans.
   */
  async labels(userId: string, includeDeleted: boolean): Promise<LabelView[]> {
    const filter: Record<string, unknown> = { userId };
    if (!includeDeleted) filter.deletedAt = null;

    const session = MongoUnitOfWork.currentSession();
    const [docs, counts] = await Promise.all([
      this.labelModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .session(session)
        .lean<LabelDoc[]>()
        .exec(),
      this.taskModel
        .aggregate<{ _id: string | null; count: number }>([
          { $match: { userId, deletedAt: null, status: 'open', labelId: { $ne: null } } },
          { $group: { _id: '$labelId', count: { $sum: 1 } } },
        ])
        .session(session)
        .exec(),
    ]);

    const byLabel = new Map(counts.map((row) => [row._id, row.count]));
    return docs.map((doc) => ({
      id: doc._id,
      name: doc.name,
      color: doc.color,
      sortOrder: doc.sortOrder ?? 0,
      openTaskCount: byLabel.get(doc._id) ?? 0,
      updatedAt: doc.updatedAt,
      deletedAt: doc.deletedAt ?? null,
    }));
  }

  async dueBetween(userId: string, from: Date, to: Date, timezone: string): Promise<TaskView[]> {
    const docs = await this.taskModel
      .find({ userId, deletedAt: null, status: 'open', dueAt: { $gte: from, $lt: to } })
      .sort({ priority: 1, dueAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();
    return docs.map((doc) => toTaskView(doc, timezone));
  }

  async openBefore(userId: string, before: Date, timezone: string): Promise<TaskView[]> {
    const docs = await this.taskModel
      .find({ userId, deletedAt: null, status: 'open', dueAt: { $ne: null, $lt: before } })
      .sort({ dueAt: 1, priority: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();
    return docs.map((doc) => toTaskView(doc, timezone));
  }

  /** `allDay: false` only — an all-day task has no place on an hour grid. */
  async timedBetween(userId: string, from: Date, to: Date, timezone: string): Promise<TaskView[]> {
    const docs = await this.taskModel
      .find({
        userId,
        deletedAt: null,
        status: 'open',
        allDay: false,
        dueAt: { $gte: from, $lt: to },
      })
      .sort({ dueAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();
    return docs.map((doc) => toTaskView(doc, timezone));
  }
}

/** Exported so the in-memory adapter renders a view identically. */
export function toTaskView(doc: TaskDoc, timezone: string): TaskView {
  const recurrence = doc.recurrence ?? null;
  const rule = recurrence
    ? Recurrence.parse({ ...recurrence, exdates: recurrence.exdates ?? [] }, timezone)
    : null;

  return {
    id: doc._id,
    title: doc.title,
    notes: doc.notes ?? null,
    dueAt: doc.dueAt ?? null,
    allDay: doc.allDay ?? true,
    priority: doc.priority ?? 4,
    labelId: doc.labelId ?? null,
    label: doc.label ?? null,
    status: doc.status ?? 'open',
    completedAt: doc.completedAt ?? null,
    repeats: recurrence !== null,
    recurrenceMode: recurrence?.mode ?? null,
    // A rule the library cannot read still renders its own string rather than
    // nothing, so a member with a rule from somewhere else at least sees it.
    recurrenceText: rule ? rule.humanText() : (recurrence?.rrule ?? null),
    estimatedMinutes: doc.estimatedMinutes ?? null,
    deferCount: doc.deferCount ?? 0,
    source: doc.source ?? 'app',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt ?? null,
  };
}
