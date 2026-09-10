import type { Table } from 'dexie';
import type {
  CursorStorage,
  PendingPush,
  PushOp,
  SyncEntity,
  SyncTable,
  SyncedRow,
} from '@botvy/sdk';
import { db, setMeta } from './db';

/**
 * The `SyncTable` port, backed by Dexie.
 *
 * The port exists for exactly this: `SyncStore` holds the protocol and nothing
 * else, so the portal can keep its rows in a `Map` for the life of a page while
 * the extension keeps them in IndexedDB. The extension has no choice about it.
 * The side panel is *destroyed* every time it is closed, and a push queue held
 * in an engine's memory would take the member's unsent edits with it — they
 * typed something, and it has to still be there when they open the panel again.
 * `MemorySyncTable` is the same seven methods over a `Map`; every rule that
 * matters lives above this line, in `SyncStore`.
 *
 * Two of those rules are visible here anyway, because they are about *writing*
 * and this is the writer:
 *
 * - **`baseUpdatedAt` is written from the server row's own `updatedAt`, and
 *   nowhere else.** `applyServerRows` is the only method that sets it. A local
 *   edit moves `updatedAt` and leaves `baseUpdatedAt` alone, which is what
 *   keeps the server's fast path (`baseUpdatedAt == server.updatedAt`, decided
 *   without consulting any clock) available to an offline edit. Send the local
 *   time in that field instead and every offline edit falls through to a clock
 *   comparison, which a slow handset loses.
 * - **A row and its queue entry move together.** Every method that touches both
 *   does it inside one Dexie transaction, so a panel closed mid-write cannot
 *   leave a `pendingOp` marker on a row whose push is gone, or a push for a row
 *   that was swept.
 */
export class DexieSyncTable<Row extends SyncedRow> implements SyncTable<Row> {
  constructor(
    private readonly entity: SyncEntity,
    private readonly rows: Table<Row, string>,
  ) {}

  /** Oldest first, per the port — see `PendingOpRow.queuedAt` for why by hand. */
  async pending(): Promise<PendingPush[]> {
    const queued = await db.pending_ops
      .where('entity')
      .equals(this.entity)
      .toArray();
    return queued
      .sort((left, right) => left.queuedAt - right.queuedAt)
      .map(({ entity: _entity, queuedAt: _queuedAt, ...push }) => push);
  }

  /**
   * Queue a change, replacing any entry already queued for the same id.
   *
   * `put` on a compound key does the replacing, which is what makes three quick
   * edits to one task one push. The row wears the operation as well so a list
   * can badge an unsent edit without joining against the queue on every render.
   */
  async enqueue(push: PendingPush): Promise<void> {
    await db.transaction('rw', db.pending_ops, this.rows, async () => {
      await db.pending_ops.put({
        ...push,
        entity: this.entity,
        queuedAt: Date.now(),
      });
      const row = await this.rows.get(push.id);
      if (row) await this.rows.put({ ...row, pendingOp: push.op });
    });
  }

  async clearPending(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await db.transaction('rw', db.pending_ops, this.rows, async () => {
      await db.pending_ops.bulkDelete(ids.map((id) => this.key(id)));
      const rows = await this.rows.bulkGet(ids);
      await this.rows.bulkPut(
        rows
          .filter((row): row is Row => row !== undefined)
          .map((row) => ({ ...row, pendingOp: null })),
      );
    });
  }

  async applyServerRows(rows: Row[]): Promise<void> {
    if (!rows.length) return;
    await db.transaction('rw', db.pending_ops, this.rows, async () => {
      // The one place `baseUpdatedAt` is ever written. One writer means it
      // cannot become a local time by accident.
      await this.rows.bulkPut(
        rows.map((row) => ({
          ...row,
          baseUpdatedAt: row.updatedAt,
          pendingOp: null,
        })),
      );
      await db.pending_ops.bulkDelete(rows.map((row) => this.key(row.id)));
    });
  }

  async removeRows(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await db.transaction('rw', db.pending_ops, this.rows, async () => {
      await this.rows.bulkDelete(ids);
      await db.pending_ops.bulkDelete(ids.map((id) => this.key(id)));
    });
  }

  /** Every id held, tombstones included — the delete sweep's input. */
  async heldIds(): Promise<string[]> {
    return this.rows.toCollection().primaryKeys();
  }

  async baseVersion(id: string): Promise<string | null> {
    return (await this.rows.get(id))?.baseUpdatedAt ?? null;
  }

  /**
   * A local edit, applied optimistically and marked pending.
   *
   * `updatedAt` moves; `baseUpdatedAt` does not — it still names the server
   * version this row was pulled at, which is the version the server compares
   * against. Touching it here is the bug that turns every offline edit into a
   * clock comparison. `MemorySyncTable.applyLocal` says the same thing over a
   * `Map`; the queue entry itself is `SyncStore.queue`'s job, not this one's,
   * because it reads `baseVersion` from here and must not be handed a caller's
   * timestamp.
   */
  async applyLocal(row: Row, pendingOp: PushOp): Promise<void> {
    const existing = await this.rows.get(row.id);
    await this.rows.put({
      ...row,
      baseUpdatedAt: existing?.baseUpdatedAt ?? row.baseUpdatedAt ?? null,
      pendingOp,
    });
  }

  /** Everything held, for the panel to filter. See `db.ts` on why not indexed. */
  async all(): Promise<Row[]> {
    return this.rows.toArray();
  }

  /** Dropped on sign-out, so the next member does not see the last one's rows. */
  async clear(): Promise<void> {
    await db.transaction('rw', db.pending_ops, this.rows, async () => {
      await this.rows.clear();
      await db.pending_ops.where('entity').equals(this.entity).delete();
    });
  }

  private key(id: string): [SyncEntity, string] {
    return [this.entity, id];
  }
}

/** Dexie `meta` key holding the sync cursor — the server's `now`, echoed back. */
export const SYNC_CURSOR_KEY = 'sync.cursor';

/** Dexie `meta` key holding the last completed pass, for the indicator. */
export const SYNC_LAST_AT_KEY = 'sync.lastSyncedAt';

/**
 * The cursor, in Dexie, behind a synchronous mirror.
 *
 * `CursorStorage` is synchronous and Dexie is not, which is the same collision
 * `PanelStore` resolves for tokens and it is resolved the same way: the caller
 * hydrates the value once before the engine is built, the mirror answers reads
 * from memory, and every write is flushed back best-effort. A panel that closed
 * mid-flush rehydrates from whichever value landed — and a cursor that is
 * *behind* only costs a second pull of rows the client already holds, because
 * every apply is an upsert by id. A cursor that ran ahead would lose rows
 * forever, which is why the engine writes it last, after the tables commit.
 */
export function dexieCursorStorage(initial: string | null): CursorStorage {
  let held = initial;
  return {
    read: () => held,
    write: (cursor) => {
      held = cursor;
      void setMeta(SYNC_CURSOR_KEY, cursor);
    },
  };
}
