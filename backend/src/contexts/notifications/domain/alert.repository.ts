import type { Alert, AlertSource } from './alert.aggregate.js';

/**
 * Alerts are server-only: no client creates one, none syncs, and the phone
 * learns about the next seven days through a query rather than a pull. So this
 * is a plain repository rather than the syncable one, and the ids are ObjectIds
 * rather than client-minted UUIDv7s.
 *
 * The methods that are not CRUD are the pipeline:
 *
 * - `claim` is the atomic take. It is a *repository* method rather than a
 *   read-modify-write in the handler because atomicity is a property of the
 *   store: `findOneAndUpdate` filtered on `claimedAt: null` is one round trip
 *   that exactly one of two concurrent sweeps wins. Loading, checking and
 *   saving would let both pass the check.
 * - `dueUnsent` is the sweep's own query, batched.
 * - `pendingForSource` and `deletePendingForSource` are the planning saga's
 *   reconcile: read what is planned, write what should be, delete what should
 *   not.
 */
export abstract class AlertRepository {
  abstract findById(userId: string, id: string): Promise<Alert | null>;
  abstract save(alert: Alert): Promise<void>;
  abstract remove(alert: Alert): Promise<void>;

  /**
   * Unsent alerts for one source, whatever their moment. The saga's input when
   * it reconciles: everything currently planned for this task or reminder.
   */
  abstract pendingForSource(
    userId: string,
    source: Pick<AlertSource, 'kind' | 'id'>,
  ): Promise<Alert[]>;

  /**
   * Drops every unsent alert for a source. What a completion, a cancellation or
   * a deletion means — and it is `pending` only, never sent: an alert already
   * delivered is a thing that happened, and deleting the record of it would
   * lose the only evidence the member was told.
   */
  abstract deletePendingForSource(
    userId: string,
    source: Pick<AlertSource, 'kind' | 'id'>,
  ): Promise<number>;

  /** Due, unsent, oldest first, capped. The sweep's batch. */
  abstract dueUnsent(now: Date, limit: number): Promise<Alert[]>;

  /**
   * Every future alert for a member. The re-plan paths need it: a time-zone
   * change has to recompute every planned instant, and a ban has to remove
   * them all.
   */
  abstract pendingForMember(userId: string, from: Date): Promise<Alert[]>;

  /** The next seven days, for the phone to schedule its own alarms from. */
  abstract upcomingForMember(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<Alert[]>;

  /**
   * Takes the row exclusively, or answers null because somebody else did.
   *
   * Returns the claimed aggregate rather than a boolean so the caller sends
   * from the row the store actually wrote, not the copy it happened to be
   * holding.
   */
  abstract claim(id: string, at: Date): Promise<Alert | null>;

  /** Unsent alerts whose moment passed longer ago than the expiry window. */
  abstract expiredUnsent(before: Date, limit: number): Promise<Alert[]>;

  abstract removeAllFor(userId: string): Promise<number>;
}
