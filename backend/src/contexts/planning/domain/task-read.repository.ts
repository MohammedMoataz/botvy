import type { ReadRepository } from '../../../shared/persistence/ports/repository.js';
import type {
  LabelSnapshot,
  Priority,
  TaskSource,
  TaskStatus,
} from './task.aggregate.js';
import type { RecurrenceMode } from './recurrence.js';

/**
 * A task as a reader sees it. Not an aggregate: returning one from a query
 * invites the caller to mutate it, and a read model has different obligations
 * from a write model — it may denormalise, it may omit, and it must never grow
 * a method.
 *
 * `recurrenceText` is here rather than computed by each caller because three
 * surfaces render "every 2 weeks on Tuesday" and none of them should have to
 * carry an RRULE parser to do it.
 */
export interface TaskView {
  id: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  allDay: boolean;
  priority: Priority;
  labelId: string | null;
  label: LabelSnapshot | null;
  status: TaskStatus;
  completedAt: Date | null;
  repeats: boolean;
  recurrenceMode: RecurrenceMode | null;
  recurrenceText: string | null;
  estimatedMinutes: number | null;
  deferCount: number;
  source: TaskSource;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * The six lists the member actually has, named as they are named on screen.
 *
 * They are an enum rather than a free-form filter object because each one is a
 * different query with a different index behind it, and a filter language would
 * let a client compose a combination nothing is indexed for. "Today" is not
 * `dueAt` between two values — it is that *and* open *and* not deleted, plus the
 * overdue ones the member still has to deal with, and encoding that in a
 * client-supplied predicate would put the definition of the member's day on the
 * wrong side of the network.
 */
export type TaskListView =
  'today' | 'upcoming' | 'overdue' | 'label' | 'completed' | 'deleted';

export interface TaskListFilter {
  view: TaskListView;
  /** Required for `label`, ignored otherwise. */
  labelId?: string;
  /**
   * The member's day boundaries, resolved by the handler against their own
   * zone. The adapter is handed instants and never computes a day itself: two
   * adapters computing "midnight" would be two chances to compute it in the
   * server's zone, which is the failure principle XI exists to prevent.
   */
  dayStart: Date;
  dayEnd: Date;
  now: Date;
  /**
   * The member's zone, carried because `recurrenceText` is rendered from it: a
   * task at 23:00 in Cairo falls on a different weekday in UTC, so describing
   * the rule without the zone names the wrong day.
   */
  timezone: string;
  limit: number;
  /** `updatedAt`-and-id cursor from a previous page. */
  cursor?: string;
}

export interface TaskPage {
  nodes: TaskView[];
  nextCursor: string | null;
}

/** A label with how many open tasks are sitting under it. */
export interface LabelView {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  openTaskCount: number;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * The read side.
 *
 * The three methods after `page` are not for any screen. They are the surface
 * other contexts read tasks through — P3's evening draft and P5's agenda — and
 * they exist here so those phases have something to call that is *not* this
 * collection. Without them the next phase binds a port straight to Planning's
 * store, and by the time anyone notices there are two contexts with a key to
 * one collection and no way to change its shape.
 */
export interface TaskReadRepository extends ReadRepository {
  page(userId: string, filter: TaskListFilter): Promise<TaskPage>;
  byId(userId: string, id: string, timezone: string): Promise<TaskView | null>;
  labels(userId: string, includeDeleted: boolean): Promise<LabelView[]>;

  /** Tasks due within a window. The rhythm's "what does tomorrow hold". */
  dueBetween(
    userId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<TaskView[]>;

  /**
   * Still-open tasks whose moment has passed. The rollover's input: these are
   * what the evening prompt offers to carry over.
   */
  openBefore(
    userId: string,
    before: Date,
    timezone: string,
  ): Promise<TaskView[]>;

  /**
   * Tasks that carry a time, over a window. The agenda merges these with
   * meetings and sessions, and an all-day task has no place on an hour grid.
   */
  timedBetween(
    userId: string,
    from: Date,
    to: Date,
    timezone: string,
  ): Promise<TaskView[]>;
}

/** The injection token, because the port is an interface and has no runtime identity. */
export const TASK_READ_REPOSITORY = Symbol('TASK_READ_REPOSITORY');
