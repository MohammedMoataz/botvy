import type { ReadRepository } from '../../../shared/persistence/ports/repository.js';
import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type {
  Reminder,
  ReminderSource,
  ReminderStatus,
} from './reminder.aggregate.js';

/**
 * Reminders sync, so this is the syncable port, plus the two writes that belong
 * to this context and are asked for from outside it: the tombstone purge the
 * notification sweep dispatches as a command, and the wholesale removal the
 * `identity.UserDeleted` handler needs.
 *
 * Both are here rather than in the caller for the same reason: these are this
 * context's rows. A sweep that deleted from `reminders` itself would be one
 * context holding a key to another's store, which is what principle I forbids
 * — so it asks, over the `CommandBus`, and this is what answers.
 */
export abstract class ReminderRepository extends SyncableRepository<Reminder> {
  abstract purgeTombstonesBefore(
    before: Date,
    userId?: string,
  ): Promise<number>;
  abstract removeAllFor(userId: string): Promise<number>;
}

/**
 * A reminder as a reader sees it. `effectiveAt` is resolved here so that no
 * caller has to remember that a snooze overrides the original moment — three
 * surfaces render this list, and the one that forgot would show the member a
 * time they had already pushed away.
 */
export interface ReminderView {
  id: string;
  title: string;
  remindAt: Date;
  effectiveAt: Date;
  leadTimes: string[];
  status: ReminderStatus;
  snoozedUntil: Date | null;
  source: ReminderSource;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * The four lists the member has, named as the screen names them.
 *
 * `upcoming` and `overdue` split on the *effective* moment, so a snoozed
 * reminder moves between them as its snooze runs out — which is what the
 * member expects, having pushed it there themselves.
 */
export type ReminderListView = 'upcoming' | 'overdue' | 'done' | 'deleted';

export interface ReminderListFilter {
  view: ReminderListView;
  now: Date;
  limit: number;
  cursor?: string;
}

export interface ReminderPage {
  nodes: ReminderView[];
  nextCursor: string | null;
}

export interface ReminderReadRepository extends ReadRepository {
  page(userId: string, filter: ReminderListFilter): Promise<ReminderPage>;
  byId(userId: string, id: string): Promise<ReminderView | null>;
}

export const REMINDER_READ_REPOSITORY = Symbol('REMINDER_READ_REPOSITORY');
