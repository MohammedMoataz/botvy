import type { AggregateRoot } from './aggregate-root.js';

/**
 * Between an aggregate and its stored shape. `toDomain` upcasts by
 * `schemaVersion`, which is why a document written by an older build can still
 * be read: migrations only go forward, and a document that has not been
 * rewritten yet is upcast on read rather than left unreadable.
 */
export interface Mapper<T, Doc> {
  toDomain(doc: Doc): T;
  toPersistence(aggregate: T): Doc;
}

/**
 * Wraps a mapper so the aggregate it returns carries the row version it was
 * loaded at (E-006). The mapper is the choke point on purpose: an adapter
 * loads through a dozen finders — `nextQueued`, `dueUnsent`, `forWindow`,
 * `findByUrl` — and every one of them ends in `toDomain`, so wrapping the
 * declaration covers them all and no call site changes.
 *
 * It is here rather than in `rehydrate` because the version is not a domain
 * fact. Threading it through every aggregate's `State` interface would put an
 * infrastructure column in twenty-three domain files to say something only the
 * repository ever reads.
 *
 * A document with no `version` yields `null`, which both adapters read as
 * "judge this on `updatedAt`, the way it is judged today" — that is what lets
 * the column arrive without a backfill.
 */
export function versioned<T extends AggregateRoot, Doc>(
  mapper: Mapper<T, Doc>,
): Mapper<T, Doc> {
  return {
    toDomain(doc: Doc): T {
      const aggregate = mapper.toDomain(doc);
      const stored = (doc as { version?: unknown }).version;
      aggregate.version = typeof stored === 'number' ? stored : null;
      return aggregate;
    },
    toPersistence: (aggregate: T): Doc => mapper.toPersistence(aggregate),
  };
}
