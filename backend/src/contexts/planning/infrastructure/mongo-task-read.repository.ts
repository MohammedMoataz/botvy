import { Injectable } from '@nestjs/common';
import type { Model, PipelineStage } from 'mongoose';
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
 * Where a task with **no** deadline sorts, as an instant no member can reach.
 *
 * MongoDB orders `null` below every date, so the one view that carries undated
 * tasks — `label` — showed "some day" above everything with a deadline. The
 * design answer is the other way round: within a status, a task with a deadline
 * comes first. Getting there is `$ifNull` onto a computed key rather than a
 * stored `hasDueDate` boolean, because a derived value kept derived cannot fall
 * out of step with the row it is derived from (E-007).
 *
 * **One constant, read by both halves.** The aggregation stage below and the
 * in-memory `withDueSort` share it, and the field name is a constant for the
 * same reason: the two adapters have already disagreed about exactly this
 * question once, under a comment claiming they matched, and a sentinel written
 * out twice is how that happens again.
 */
export const NO_DUE_DATE_SORTS_AT = new Date('9999-12-31T23:59:59.999Z');

/** The computed key's name — in the sort list, in the pipeline, in the cursor. */
export const DUE_SORT_FIELD = 'dueSort';

/**
 * `$addFields` for the computed key, evaluated by the store.
 *
 * It has to be a real pipeline stage and not a `$sort` expression: Mongo cannot
 * sort on something it has not projected, and the keyset cursor's own filter
 * names the field too — so the stage runs before both.
 */
export function dueSortStage(): PipelineStage.AddFields {
  return {
    $addFields: {
      [DUE_SORT_FIELD]: { $ifNull: ['$dueAt', NO_DUE_DATE_SORTS_AT] },
    },
  };
}

/**
 * The same computation in memory, and the same one used to read a cursor
 * position off the last row of a page.
 *
 * Applied on the Mongo side as well when the cursor is encoded, so that the
 * value the client carries is the computed key whatever the driver projected —
 * a cursor holding the raw `null` would be a position in an order nothing
 * sorts by.
 */
export function withDueSort(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...doc,
    [DUE_SORT_FIELD]:
      (doc.dueAt as Date | null | undefined) ?? NO_DUE_DATE_SORTS_AT,
  };
}

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
  // The one view that carries undated tasks. It orders on the *computed* key
  // rather than on `dueAt`, so that within each status a task with a deadline
  // sorts above one without — see `NO_DUE_DATE_SORTS_AT` (E-007).
  label: [
    { field: 'status', direction: 'asc' },
    { field: DUE_SORT_FIELD, direction: 'asc' },
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
export function taskPredicateFor(
  filter: TaskListFilter,
): Record<string, unknown> {
  switch (filter.view) {
    case 'today':
      return {
        deletedAt: null,
        status: 'open',
        dueAt: { $ne: null, $lt: filter.dayEnd },
      };
    case 'upcoming':
      return {
        deletedAt: null,
        status: 'open',
        dueAt: { $gte: filter.dayEnd },
      };
    case 'overdue':
      return {
        deletedAt: null,
        status: 'open',
        dueAt: { $ne: null, $lt: filter.dayStart },
      };
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
    const query: Record<string, unknown> = {
      userId,
      ...taskPredicateFor(filter),
    };
    const keys = TASK_SORT_KEYS[filter.view];

    // The cursor is a position in *this* order, not a value in some unrelated
    // field. `keyset-cursor.ts` records what was wrong before and why it
    // survived a green suite.
    const position = filter.cursor ? decodeCursor(filter.cursor) : null;
    const after = position ? mongoAfter(keys, position) : null;

    const docs = keys.some((key) => key.field === DUE_SORT_FIELD)
      ? await this.pageByPipeline(query, after, keys, filter.limit)
      : await this.taskModel
          .find(after ? { ...query, ...after } : query)
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
      nodes: page.map((doc) => toTaskView(doc, filter.timezone, filter.locale)),
      nextCursor:
        hasMore && last
          ? encodeCursor(
              positionOf(
                keys,
                withDueSort(last as unknown as Record<string, unknown>),
                last._id,
              ),
            )
          : null,
    };
  }

  /**
   * The same page, through an aggregation, for a view that sorts on a computed
   * key.
   *
   * The stage order is the whole of it. The predicate narrows to the member's
   * own rows first — an `$addFields` before `$match` would compute the key for
   * every task in the collection — then the key is projected, then the cursor's
   * filter, which *names* that key and therefore cannot run before it, and only
   * then the sort and the limit.
   *
   * `find()` is kept for the other five views rather than moved here for
   * symmetry: they sort on stored fields, where an index answers the sort, and
   * an `$addFields` in front of `$sort` would give that up for nothing.
   */
  private async pageByPipeline(
    query: Record<string, unknown>,
    after: Record<string, unknown> | null,
    keys: SortKey[],
    limit: number,
  ): Promise<TaskDoc[]> {
    const pipeline: PipelineStage[] = [
      { $match: query },
      dueSortStage(),
    ];
    if (after) pipeline.push({ $match: after });
    pipeline.push({ $sort: mongoSort(keys) }, { $limit: limit + 1 });

    return this.taskModel
      .aggregate<TaskDoc>(pipeline)
      .session(MongoUnitOfWork.currentSession())
      .exec();
  }

  async byId(
    userId: string,
    id: string,
    timezone: string,
    locale = 'en',
  ): Promise<TaskView | null> {
    const doc = await this.taskModel
      .findOne({ userId, _id: id })
      .session(MongoUnitOfWork.currentSession())
      .lean<TaskDoc>()
      .exec();
    return doc ? toTaskView(doc, timezone, locale) : null;
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
    return docs.map((doc) => toTaskView(doc, timezone));
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
    return docs.map((doc) => toTaskView(doc, timezone));
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
    return docs.map((doc) => toTaskView(doc, timezone));
  }
}

/**
 * Exported so the in-memory adapter renders a view identically.
 *
 * `locale` defaults to English rather than being required, which is the same
 * answer a member with no locale gets: the three cross-context reads below have
 * no member language to hand and no consumer that renders the sentence.
 */
export function toTaskView(
  doc: TaskDoc,
  timezone: string,
  locale = 'en',
): TaskView {
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
    recurrenceText: rule ? rule.humanText(locale) : (recurrence?.rrule ?? null),
    estimatedMinutes: doc.estimatedMinutes ?? null,
    deferCount: doc.deferCount ?? 0,
    source: doc.source ?? 'app',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt ?? null,
  };
}
