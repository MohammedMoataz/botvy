import {
  type CalendarEventRow,
  type CursorStorage,
  type LabelRow,
  type MeetingRow,
  type SyncEntity,
  type SyncTable,
} from '@botvy/sdk';
import { db, getMeta, setMeta, type PanelTaskRow } from './db';
import { DexieSyncTable, SYNC_CURSOR_KEY, dexieCursorStorage } from './sync-table';

/**
 * The sync wiring both contexts share (P9).
 *
 * The panel and the background worker each run a `SyncStore`, and they must
 * agree about three things or they are two clients pretending to be one: which
 * **tables** are registered, which **cursor** is read and written, and which
 * **install id** identifies this browser. Two install ids would be two device
 * rows and a notification each; two cursors would each pull what the other
 * already had.
 *
 * Two engines over one queue is safe — `/sync` is idempotent by design, a push
 * the other context already sent comes back in `accepted`, and the cursor only
 * moves forward — but only while they are configured identically, which is what
 * this file is for.
 */

export const INSTALL_ID_KEY = 'auth.installId';

/**
 * How this installation identifies itself, minted once and kept in Dexie.
 *
 * It must survive the panel closing and the worker being evicted: a fresh id
 * would give the member a new device row every time, and then one notification
 * per row. `/sync` is handed the same id, because the handler stamps
 * `devices.lastSeenAt` by install id — which is what lets the server's alert
 * sweep skip a device that already holds its own alarms.
 */
export async function installId(): Promise<string> {
  const existing = await getMeta<string>(INSTALL_ID_KEY);
  if (existing) return existing;

  const minted = crypto.randomUUID();
  await setMeta(INSTALL_ID_KEY, minted);
  return minted;
}

/**
 * The four tables, in the order the contract applies them.
 *
 * Labels before tasks is the one that buys correctness: a task carries a
 * snapshot of its label's name and colour, so applying tasks first would let one
 * name a label the same request is about to create. Meetings and calendar
 * events follow in the order `contracts/sync.md` writes them — nothing there
 * depends on order, and a request that reads like the contract is one nobody
 * later "fixes" in the wrong direction.
 */
export function workerTables(): Partial<Record<SyncEntity, SyncTable>> {
  return {
    labels: new DexieSyncTable<LabelRow>('labels', db.labels),
    tasks: new DexieSyncTable<PanelTaskRow>('tasks', db.tasks),
    meetings: new DexieSyncTable<MeetingRow>('meetings', db.meetings),
    calendar_events: new DexieSyncTable<CalendarEventRow>(
      'calendar_events',
      db.calendar_events,
    ),
  };
}

/** The cursor, read from Dexie so both contexts continue the same pull. */
export async function workerCursor(): Promise<CursorStorage> {
  return dexieCursorStorage((await getMeta<string>(SYNC_CURSOR_KEY)) ?? null);
}
