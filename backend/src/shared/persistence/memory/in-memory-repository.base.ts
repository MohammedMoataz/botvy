import type { AggregateRoot } from '../ports/aggregate-root.js';
import { StaleWriteError } from '../ports/errors.js';
import { Repository } from '../ports/repository.js';
import type { InMemoryParticipant, InMemoryUnitOfWork } from './in-memory-unit-of-work.js';

/**
 * The store a handler spec runs against. Rows are keyed by `userId:id` — keyed
 * by member, so a spec that forgets to scope a lookup fails here rather than in
 * production — and the events it pulls go to the unit of work for assertion.
 *
 * It enlists itself so a rolled-back transaction takes its writes with it, and
 * it raises the same `StaleWriteError` the store adapters do. Both of those are
 * promises the repository contract makes on every adapter's behalf; an
 * in-memory adapter that broke either would let a handler pass its spec and
 * misbehave against a real database.
 */
export abstract class InMemoryRepositoryBase<T extends AggregateRoot>
  extends Repository<T>
  implements InMemoryParticipant
{
  protected readonly store = new Map<string, T>();
  #snapshot: Map<string, T> | null = null;

  constructor(protected readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlist(this);
  }

  snapshot(): void {
    this.#snapshot = new Map(this.store);
  }

  restore(): void {
    if (!this.#snapshot) return;
    this.store.clear();
    for (const [key, value] of this.#snapshot) this.store.set(key, value);
    this.#snapshot = null;
  }

  protected key(userId: string, id: string): string {
    return `${userId}:${id}`;
  }

  async findById(userId: string, id: string): Promise<T | null> {
    return this.store.get(this.key(userId, id)) ?? null;
  }

  async save(aggregate: T): Promise<void> {
    const key = this.key(aggregate.userId, String(aggregate.id));
    const existing = this.store.get(key);
    if (existing && existing.updatedAt > aggregate.updatedAt) {
      throw new StaleWriteError(String(aggregate.id));
    }
    this.uow.collect(aggregate.pullEvents());
    this.store.set(key, aggregate);
  }

  async remove(aggregate: T): Promise<void> {
    this.uow.collect(aggregate.pullEvents());
    this.store.delete(this.key(aggregate.userId, String(aggregate.id)));
  }

  /** Test affordance: everything stored, in insertion order. */
  all(): T[] {
    return [...this.store.values()];
  }

  clear(): void {
    this.store.clear();
  }
}
