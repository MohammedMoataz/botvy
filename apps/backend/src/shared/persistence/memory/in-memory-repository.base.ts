import type { AggregateRoot } from '../ports/aggregate-root.js';
import { Repository } from '../ports/repository.js';
import type { InMemoryUnitOfWork } from './in-memory-unit-of-work.js';

/**
 * The store a handler spec runs against. It holds aggregates in a Map keyed by
 * `userId:id` — keyed by member, so a spec that forgets to scope a query fails
 * here rather than in production — and hands the events it pulls to the unit of
 * work so the spec can assert on them.
 *
 * It enforces the same optimistic check the store adapters do: saving an
 * aggregate whose `updatedAt` is older than the stored one is a lost update,
 * and a spec should see that as loudly as a member would.
 */
export abstract class InMemoryRepositoryBase<T extends AggregateRoot> extends Repository<T> {
  protected readonly store = new Map<string, T>();

  constructor(protected readonly uow: InMemoryUnitOfWork) {
    super();
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
      throw new Error(
        `Refusing a stale write to ${key}: stored ${existing.updatedAt.toISOString()} is newer than ${aggregate.updatedAt.toISOString()}.`,
      );
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
