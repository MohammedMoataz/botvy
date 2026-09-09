import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../cqrs/domain-event.js';
import { UnitOfWork } from '../ports/unit-of-work.js';

/**
 * Something whose state has to be undone when a transaction rolls back.
 * The in-memory repositories enlist themselves.
 */
export interface InMemoryParticipant {
  snapshot(): void;
  restore(): void;
}

/**
 * The unit of work handler specs bind.
 *
 * It rolls back for real. That is not politeness: the repository contract holds
 * every adapter to the same semantics, and an in-memory adapter that kept rows
 * a failed transaction wrote would let a handler pass its spec and lose data in
 * production. The suite caught exactly that.
 *
 * A nested `run` joins the outer one, matching the store adapters, so a spec
 * exercising a handler that calls another behaves the way production does.
 */
@Injectable()
export class InMemoryUnitOfWork extends UnitOfWork {
  readonly events: DomainEvent[] = [];
  #depth = 0;
  #commitCallbacks: Array<() => Promise<void>> = [];
  #participants = new Set<InMemoryParticipant>();
  #rolledBack = false;

  enlist(participant: InMemoryParticipant): void {
    this.#participants.add(participant);
  }

  /**
   * Enlist an adapter whose whole state is a handful of Maps and Arrays.
   *
   * `InMemoryRepositoryBase` snapshots itself. Identity's adapters predate that
   * base and keep differently shaped indexes - a Map by id here, an Array of
   * rows there - so rather than each repeating the same six lines, they hand
   * their containers over and this does it.
   */
  enlistState(...containers: Array<Map<string, unknown> | unknown[]>): void {
    let saved: Array<Map<string, unknown> | unknown[]> = [];
    this.enlist({
      snapshot() {
        saved = containers.map((c) => (Array.isArray(c) ? [...c] : new Map(c)));
      },
      restore() {
        containers.forEach((container, index) => {
          const copy = saved[index];
          if (Array.isArray(container) && Array.isArray(copy)) {
            container.length = 0;
            container.push(...copy);
          } else if (container instanceof Map && copy instanceof Map) {
            container.clear();
            for (const [key, value] of copy) container.set(key, value);
          }
        });
      },
    });
  }

  async run<R>(work: () => Promise<R>): Promise<R> {
    this.#depth += 1;
    const outermost = this.#depth === 1;

    if (outermost) {
      for (const participant of this.#participants) participant.snapshot();
    }

    try {
      const result = await work();
      if (outermost) {
        const callbacks = this.#commitCallbacks;
        this.#commitCallbacks = [];
        for (const callback of callbacks) await callback();
      }
      return result;
    } catch (error) {
      if (outermost) {
        // Rows and events go back together. An event for a change that did not
        // commit is the bug the outbox exists to prevent.
        for (const participant of this.#participants) participant.restore();
        this.#rolledBack = true;
        this.events.length = 0;
        this.#commitCallbacks = [];
      }
      throw error;
    } finally {
      this.#depth -= 1;
    }
  }

  onCommit(callback: () => Promise<void>): void {
    this.#commitCallbacks.push(callback);
  }

  /**
   * Called by the in-memory repositories when they save an aggregate.
   *
   * It refuses outside a transaction, and that refusal is the point. An
   * aggregate that raised events has a row *and* an outbox entry to write, and
   * a handler that saves it without a unit of work makes those two independent
   * statements - which is at-most-once delivery wearing an outbox. Three
   * separate reviews found comments claiming "in the same transaction" above
   * code that opened none; this is the claim made checkable.
   */
  collect(events: DomainEvent[]): void {
    if (events.length > 0 && this.#depth === 0) {
      throw new Error(
        `${events.length} event(s) were raised outside a unit of work. The aggregate ` +
          'and its outbox entry have to commit together: wrap the write in uow.run().',
      );
    }
    this.events.push(...events);
  }

  get rolledBack(): boolean {
    return this.#rolledBack;
  }

  reset(): void {
    this.events.length = 0;
    this.#commitCallbacks = [];
    this.#rolledBack = false;
    this.#depth = 0;
  }
}
