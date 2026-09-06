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
