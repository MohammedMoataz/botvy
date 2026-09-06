import type { AggregateRoot } from './aggregate-root.js';

/**
 * The repository port every context declares in its own `domain/` layer. Only
 * `infrastructure/` implements it, one adapter per store, which is what lets a
 * handler be written once and tested against memory.
 *
 * `remove` is a hard delete. Tombstoning is a domain operation with its own
 * meaning — a deleted row keeps its status, because the status is the only
 * record of whether the thing was completed, cancelled or never dealt with —
 * so it is never expressed as `remove`.
 */
export abstract class Repository<T extends AggregateRoot> {
  abstract findById(userId: string, id: string): Promise<T | null>;
  abstract save(aggregate: T): Promise<void>;
  abstract remove(aggregate: T): Promise<void>;
}

/**
 * The shape a read port takes. Concrete read ports declare their own methods
 * returning DTOs rather than aggregates: a read model is not a write model, and
 * returning an aggregate from a query invites a caller to mutate it.
 *
 * An interface rather than a base class, because there is nothing to inherit —
 * a read port shares no behaviour with any other, only the rule above.
 */
export interface ReadRepository {
  readonly [Symbol.toStringTag]?: string;
}
