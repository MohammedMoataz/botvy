import {
  EVENT_SCHEMA_VERSION,
  contextOf,
  type DomainEvent,
} from '../../cqrs/domain-event.js';
import { newId } from '../../cqrs/ids.js';

/**
 * The base every aggregate extends. It holds the events raised during the
 * current unit of work and hands them over exactly once: the repository pulls
 * them inside the transaction that saves the aggregate, so an event cannot be
 * published for a change that did not commit, and a commit cannot happen
 * without its events being written alongside it.
 */
export abstract class AggregateRoot<Id = string> {
  abstract readonly id: Id;
  abstract readonly userId: string;
  /**
   * When the row last changed **on the server**, and never a fact about the
   * member's day.
   *
   * It is the optimistic-concurrency column (`MongoRepositoryBase.save`
   * filters on `updatedAt: { $lte: aggregate.updatedAt }`) and the `/sync`
   * cursor, so a mutating method assigns it `new Date()` — never the caller's
   * `at`. An `at` older than the stored row made the filter miss, the save
   * throw `StaleWriteError` and a perfectly well-formed request answer 500
   * (E-017); letting a client move it backwards is also letting a client hide
   * its own next write from every delta pull.
   *
   * `at` still exists and still means what it says: it sets the *domain*
   * timestamp — `completedAt`, `deletedAt`, `lastMessageAt` — and stamps the
   * event, which is where "the member says it happened on Tuesday" belongs.
   *
   * `rehydrate` is the one assignment from stored state, and it is not a
   * mutation.
   */
  updatedAt: Date = new Date();
  schemaVersion = 1;

  /**
   * The row version this copy was **loaded at**, or `null` for a copy that was
   * never loaded from a store.
   *
   * It is the optimistic-concurrency counter E-006 asks for, and it is not a
   * domain fact: nothing in any aggregate reads it, and no event carries it.
   * `MongoRepositoryBase.save` matches it and writes `version + 1`, and the
   * in-memory adapter does the same thing so a handler spec and production
   * agree — they have silently disagreed before, under a comment claiming they
   * matched.
   *
   * `null` means exactly one thing to both adapters: **judge this write the way
   * it was judged before there was a version**, on `updatedAt`. Two copies
   * reach that state and they want the same answer:
   *
   *   - a fresh aggregate, whose first save is a create, and
   *   - a copy read from a row written before the column existed.
   *
   * The second is what makes this land with no backfill. A versionless row has
   * a version the first time anything saves it, so the fallback closes itself
   * per row, and until it does that row is no worse guarded than it is today.
   *
   * `version` is stamped by `versioned()` wrapping a mapper, not by
   * `rehydrate`, so no aggregate's state interface had to grow an
   * infrastructure column — see `shared/persistence/ports/mapper.ts`.
   */
  version: number | null = null;

  #events: DomainEvent[] = [];

  /**
   * Records an event against this aggregate. `context` is derived from the
   * name so the two can never disagree.
   */
  protected raise<P>(
    name: string,
    aggregateType: string,
    payload: P,
    occurredAt: Date = new Date(),
  ): void {
    this.#events.push({
      eventId: newId(),
      name,
      context: contextOf(name),
      aggregate: { type: aggregateType, id: String(this.id) },
      userId: this.userId ?? null,
      occurredAt,
      payload,
      schemaVersion: EVENT_SCHEMA_VERSION,
    });
  }

  /** Hands over the pending events and clears them. Called by the repository. */
  pullEvents(): DomainEvent[] {
    const pending = this.#events;
    this.#events = [];
    return pending;
  }

  /** Read-only view, for assertions in specs. */
  get pendingEvents(): readonly DomainEvent[] {
    return this.#events;
  }
}

/**
 * The server's clock, and never a step backwards.
 *
 * `updatedAt` is the optimistic-concurrency column and the sync cursor, so it
 * is the server's own `new Date()` and not a caller's `at` (E-017). The `max`
 * is the other half of that rule: a row whose stored timestamp is somehow ahead
 * of this instant — a clock that has been corrected, a client-minted create
 * carrying a skewed `createdAt`, a fixture written for a later hour — would
 * otherwise refuse its own next edit as stale for as long as the difference
 * lasts, and the member would simply see nothing happen.
 *
 * It belongs in the mutating method and never on the base class: `rehydrate`
 * assigns an `updatedAt` older than this instant by design, and a forward-only
 * setter there would refuse to load any row that had not been touched this
 * millisecond.
 */
export function forward(current: Date): Date {
  const now = Date.now();
  return new Date(Math.max(now, current.getTime() + 1));
}
