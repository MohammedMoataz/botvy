import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../cqrs/domain-event.js';
import { UnitOfWork } from '../ports/unit-of-work.js';

/**
 * The unit of work handler specs bind. It runs the work, collects the events
 * the repositories captured, and runs the commit callbacks — enough for a spec
 * to assert "this command raised exactly one event" without a database.
 *
 * A nested `run` joins the outer one, matching the store adapters, so a spec
 * exercising a handler that calls another handler behaves the same way
 * production does.
 */
@Injectable()
export class InMemoryUnitOfWork extends UnitOfWork {
  readonly events: DomainEvent[] = [];
  #depth = 0;
  #commitCallbacks: Array<() => Promise<void>> = [];
  #rolledBack = false;

  async run<R>(work: () => Promise<R>): Promise<R> {
    this.#depth += 1;
    const outermost = this.#depth === 1;
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
        // A rollback throws away the events too: an event for a change that did
        // not commit is exactly the bug the outbox exists to prevent.
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

  /** Called by the in-memory repositories when they save an aggregate. */
  collect(events: DomainEvent[]): void {
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
