import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
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

  /**
   * The six lists, each as its own filter.
   *
   * Two of them are worth reading twice:
   *
   * **Today is not one day.** It is today's tasks *plus* everything still open
   * whose moment has passed, because a member opening the app at 09:00 needs to
   * see yesterday's unfinished work more than they need a tidy definition of
   * "today". A list that hid overdue tasks behind a second tab is a list that
   * loses them.
   *
   * **Every view except `deleted` excludes tombstones**, and `deleted` shows
   * only tombstones. Those are the same field read two ways, which is why the
   * Deleted view can report that a removed task had been completed: the delete
   * never touched the status.
   */
  async page(userId: string, filter: TaskListFilter): Promise<TaskPage> {
    const query: Record<string, unknown> = { userId };
    let sort: Record<string, 1 | -1>;

    switch (filter.view) {
      case 'today':
        query.deletedAt = null;
        query.status = 'open';
        query.dueAt = { $ne: null, $lt: filter.dayEnd };
        // Overdue first, then the rest of today, then by priority. The member's
        // eye should land on what is late.
        sort = { dueAt: 1, priority: 1 };
        break;

      case 'upcoming':
        query.deletedAt = null;
        query.status = 'open';
        query.dueAt = { $gte: filter.dayEnd };
        sort = { dueAt: 1, priority: 1 };
        break;

      case 'overdue':
        query.deletedAt = null;
        query.status = 'open';
        query.dueAt = { $ne: null, $lt: filter.dayStart };
        sort = { dueAt: 1, priority: 1 };
        break;

      case 'label':
        query.deletedAt = null;
        query.labelId = filter.labelId ?? null;
        // Undated tasks sort last rather than first: a `null` dueAt is "some
        // day", and Mongo's own null-sorts-low ordering would put every
        // someday task above the ones with a deadline.
        sort = { status: 1, dueAt: 1, priority: 1 };
        break;

      case 'completed':
        query.deletedAt = null;
        query.status = 'completed';
        sort = { completedAt: -1 };
        break;

      case 'deleted':
        query.deletedAt = { $ne: null };
        sort = { deletedAt: -1 };
        break;
    }

    // Cursor pagination on `updatedAt` rather than a skip: a skip re-reads
    // everything before the page and shifts under an edit, so a member
    // scrolling while the phone syncs sees a row twice or not at all.
    if (filter.cursor) {
      const after = decodeCursor(filter.cursor);
      if (after) query.updatedAt = { $gt: after };
    }

    const docs = await this.taskModel
      .find(query)
      .sort(sort)
      .limit(filter.limit + 1)
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();

    // One more than asked for, so "is there another page" is answered without a
    // second count query against a collection that is being written to.
    const hasMore = docs.length > filter.limit;
    const page = hasMore ? docs.slice(0, filter.limit) : docs;

    return {
      nodes: page.map((doc) => toView(doc, filter.timezone)),
      nextCursor: hasMore
        ? encodeCursor(page[page.length - 1]!.updatedAt)
        : null,
    };
  }

  async byId(
    userId: string,
    id: string,
    timezone: string,
  ): Promise<TaskView | null> {
    const doc = await this.taskModel
      .findOne({ userId, _id: id })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc>()
      .exec();
    return doc ? toView(doc, timezone) : null;
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
          {
            $match: {
              userId,
              deletedAt: null,
              status: 'open',
              labelId: { $ne: null },
            },
          },
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

  async dueBetween(
    userId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<TaskView[]> {
    const docs = await this.taskModel
      .find({
        userId,
        deletedAt: null,
        status: 'open',
        dueAt: { $gte: from, $lt: to },
      })
      .sort({ priority: 1, dueAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();
    return docs.map((doc) => toView(doc, timezone));
  }

  async openBefore(
    userId: string,
    before: Date,
    timezone: string,
  ): Promise<TaskView[]> {
    const docs = await this.taskModel
      .find({
        userId,
        deletedAt: null,
        status: 'open',
        dueAt: { $ne: null, $lt: before },
      })
      .sort({ dueAt: 1, priority: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc[]>()
      .exec();
    return docs.map((doc) => toView(doc, timezone));
  }

  /** `allDay: false` only — an all-day task has no place on an hour grid. */
  async timedBetween(
    userId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<TaskView[]> {
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
    return docs.map((doc) => toView(doc, timezone));
  }
}

/**
 * `updatedAt` as the cursor, base64'd so a client cannot read a timestamp out of
 * it and start doing arithmetic on it. Opaque by construction: the only correct
 * thing to do with a cursor is hand it back.
 */
function encodeCursor(updatedAt: Date): string {
  return Buffer.from(String(updatedAt.getTime()), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): Date | null {
  const millis = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  return Number.isFinite(millis) ? new Date(millis) : null;
}

function toView(doc: TaskDoc, timezone: string): TaskView {
  const recurrence = doc.recurrence ?? null;
  const rule = recurrence
    ? Recurrence.parse(
        { ...recurrence, exdates: recurrence.exdates ?? [] },
        timezone,
      )
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
