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
  updatedAt: Date = new Date();
  schemaVersion = 1;

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
