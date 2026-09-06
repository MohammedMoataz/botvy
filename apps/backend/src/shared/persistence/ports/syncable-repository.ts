import type { AggregateRoot } from './aggregate-root.js';
import { Repository } from './repository.js';
import type { ApplyResult, SyncChange } from './sync-change.js';

/**
 * A repository whose rows reach the phone. `pullSince` returns what changed
 * after a cursor; the delete sweep on the client runs only against a full
 * snapshot, because treating a delta as the complete set deletes every row that
 * simply did not change — deletions arrive as tombstones instead.
 */
export abstract class SyncableRepository<T extends AggregateRoot> extends Repository<T> {
  abstract pullSince(userId: string, since: Date | null): Promise<T[]>;
  abstract applyChange(userId: string, change: SyncChange): Promise<ApplyResult>;
}
