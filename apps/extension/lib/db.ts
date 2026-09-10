import Dexie, { type EntityTable, type Table } from 'dexie';
import type { LabelRow, PendingPush, SyncEntity, TaskRow } from '@botvy/sdk';

/**
 * The panel re-mounts every time it is closed, so anything that must survive
 * lives here (entities) or in chrome.storage (tokens, settings) — never in
 * React state alone.
 */
export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * A task as the panel holds it.
 *
 * A plain alias now. It used to be
 * `Omit<TaskRow, 'repeats' | 'recurrenceMode' | 'recurrenceText'>`, working
 * around a real mismatch: the SDK's `TaskRow` had been typed from the server's
 * GraphQL read model, which renders a `recurrenceText` sentence, while rows
 * actually arrive from the sync pull, which sends the *rule*. Three fields were
 * promised and always undefined; two that were always present were missing.
 *
 * `TaskRow` was corrected to the pull's shape, so there is nothing left to omit
 * — and the alias is kept rather than removed so the panel has one name for the
 * row it stores, which is the thing Dexie's table is typed on.
 */
export type PanelTaskRow = TaskRow;

/**
 * One queued push, as it sits in `pending_ops`.
 *
 * `entity` is part of the primary key rather than a separate table per entity:
 * the queue is read per entity by the sync engine and written per row, so
 * `[entity+id]` is exactly the access pattern, and one store means one
 * transaction when a push and its row have to move together.
 *
 * `queuedAt` exists because the `SyncTable` port promises "oldest first" and
 * the compound key cannot deliver it. Keys sort by entity and then by id, and
 * an id is a UUIDv7 — creation order of the *row*, not of the *push*, so an
 * edit queued this minute against a task from last week would sort ahead of a
 * task created just now. Neither of `attempts` nor `queuedAt` goes on the
 * wire; `SyncStore` strips `attempts` and this file strips `queuedAt`.
 */
export interface PendingOpRow extends PendingPush {
  entity: SyncEntity;
  queuedAt: number;
}

export class BotvyDb extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;
  tasks!: Table<PanelTaskRow, string>;
  labels!: Table<LabelRow, string>;
  pending_ops!: Table<PendingOpRow, [SyncEntity, string]>;

  constructor() {
    super('botvy');

    // Version 1 stays declared. Dexie replays the ladder for an install that is
    // behind, so removing a rung would leave an existing profile with no path
    // forward — the browser's own version of the rule that a drift migration is
    // forward-only. Adding stores needs no upgrade function: unlike drift,
    // whose default `onUpgrade` throws, Dexie creates a store that appears in a
    // later version and leaves the existing ones alone.
    this.version(1).stores({ meta: '&key' });

    // Only the primary keys are indexed, and that is deliberate rather than
    // unfinished. The two lists the panel draws are "open, due on or before
    // today" and "not deleted", and both of those turn on a field that is
    // `null` for the ordinary row — IndexedDB does not index `null` or
    // `undefined` at all, so `where('deletedAt').equals(null)` matches nothing
    // and quietly hides every live row. It is the same shape of bug as drift's
    // `pending_op != 'x'`, which has hidden nearly every row twice already. The
    // panel therefore filters in JavaScript over the whole table, which costs
    // nothing at the few hundred rows a browser slice holds; if it ever holds
    // thousands, the fix is a derived scalar to index on (a `dueDay` string, a
    // `live` flag), never a `null` comparison.
    this.version(2).stores({
      meta: '&key',
      tasks: '&id',
      labels: '&id',
      pending_ops: '[entity+id], entity',
    });
  }
}

export const db = new BotvyDb();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
