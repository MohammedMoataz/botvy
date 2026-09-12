import type { AggregateRoot } from './aggregate-root.js';
import { Repository } from './repository.js';

/**
 * A repository whose rows reach the phone.
 *
 * `pullSince` returns what changed after a cursor, and the delete sweep on the
 * client runs only against a full snapshot — because treating a delta as the
 * complete set deletes every row that simply did not change. Deletions arrive as
 * tombstones instead, which is why `pullSince` includes them rather than
 * filtering them out as a read of live data would.
 *
 * It carries no `applyChange`. It did, and that was the wrong layer: applying a
 * pushed row means calling `tombstone()` or `defer()` on the aggregate so the
 * event is raised and the invariant is checked, and a repository that invokes
 * domain behaviour is no longer a repository. The push side belongs to each
 * context's `SyncableEntity` adapter, which loads through this port, calls the
 * aggregate, and saves — so the protocol lives in one layer and the store in
 * another.
 */
export abstract class SyncableRepository<
  T extends AggregateRoot,
> extends Repository<T> {
  /** Rows changed since the cursor, tombstones included. `null` means everything. */
  abstract pullSince(userId: string, since: Date | null): Promise<T[]>;
}
