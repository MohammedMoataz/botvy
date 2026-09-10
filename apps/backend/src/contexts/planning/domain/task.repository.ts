import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type { LabelSnapshot } from './task.aggregate.js';
import type { Task } from './task.aggregate.js';

/**
 * Tasks reach the phone, so the port is the syncable one: it answers "what
 * changed since" as well as the ordinary lookups, and it applies a pushed row.
 *
 * Beyond that it carries three operations no generic repository could:
 *
 * - `findMany` for the slices that act on a set (the rollover moves a list).
 * - `refreshLabelSnapshots`, a bulk write inside the context, because renaming
 *   a label the member put on 400 tasks is one statement rather than 400
 *   read-modify-writes.
 * - `purgeTombstonesBefore`, which is the write behind the `PurgeTombstones`
 *   command the sweep dispatches. It lives here rather than in Notifications
 *   because these are Planning's rows: another context reaching into this
 *   collection to delete from it is exactly what principle I forbids, and a
 *   command arriving over the bus is how the sweep asks for it instead.
 */
export abstract class TaskRepository extends SyncableRepository<Task> {
  abstract findMany(userId: string, ids: string[]): Promise<Task[]>;

  /**
   * How many tasks now show the label's current name and colour. Returns the
   * count so the handler can log a rename that touched nothing, which is how a
   * broken snapshot refresh would otherwise stay invisible.
   */
  abstract refreshLabelSnapshots(
    userId: string,
    labelId: string,
    snapshot: LabelSnapshot | null,
    at: Date,
  ): Promise<number>;

  /**
   * Erases tombstones deleted before `before`. Scoped to one member when the
   * caller has one, unscoped for the nightly sweep across everybody.
   */
  abstract purgeTombstonesBefore(
    before: Date,
    userId?: string,
  ): Promise<number>;

  /** Every row this member owns, for the purge on `identity.UserDeleted`. */
  abstract removeAllFor(userId: string): Promise<number>;
}
