import type { BotvyClient } from './client.js';

/**
 * The entities `/api/v1/sync` knows about, spelled exactly as the protocol
 * spells them — snake_case, because these strings go on the wire and in the
 * `rejections` array's `entity` field, and a client that translated them into
 * camelCase would have to translate them back to branch on a rejection.
 *
 * The web surfaces ask for a subset (the extension sends
 * `["tasks","labels","meetings","calendar_events"]`); the union is the whole
 * protocol so that adding a table later is a registration, not an edit here.
 */
export type SyncEntity =
  | 'tasks'
  | 'labels'
  | 'reminders'
  | 'meetings'
  | 'calendar_events'
  | 'sessions'
  | 'programs'
  | 'workouts'
  | 'meals'
  | 'links'
  | 'conversations'
  | 'messages'
  | 'daily_plans'
  | 'checkins'
  | 'profile'
  | 'preferences'
  | 'athlete_profile';

/** The operations a pushed row can carry. `purge` erases a tombstone for good. */
export type PushOp = 'create' | 'update' | 'delete' | 'restore' | 'purge';

/**
 * Why the server refused a pushed row.
 *
 * `protected` is never reported as `stale`, and the distinction is the whole
 * reason this is a union rather than a boolean: a `stale` verdict tells the
 * client "you are behind, take the server's row and try again", so a protected
 * row reported as stale is a client that retries forever.
 */
export type RejectionReason = 'stale' | 'gone' | 'protected' | 'not_deleted' | 'invalid';

/**
 * The shape every synced row shares.
 *
 * The three fields below are the protocol's; the two after them are the local
 * bookkeeping, and they are optional here because a row that arrived from the
 * server has no pending operation and its `baseUpdatedAt` is its own
 * `updatedAt`.
 *
 * **`updatedAt` and `baseUpdatedAt` are two different facts and confusing them
 * loses edits.** `updatedAt` is when *this* surface last edited the row;
 * `baseUpdatedAt` is the server's own value for the version this surface last
 * pulled. The server accepts a push outright while `baseUpdatedAt` still
 * matches its row — no clock consulted — so a local edit must never touch
 * `baseUpdatedAt`. Send the local time in that field instead and every offline
 * edit falls through to a clock comparison, which a slow handset loses.
 */
export interface SyncedRow {
  id: string;
  updatedAt: string;
  deletedAt?: string | null;
  /** The server's `updatedAt` for the version last pulled. Never a local time. */
  baseUpdatedAt?: string | null;
  /** The queued operation, or absent/null when the row is clean. */
  pendingOp?: PushOp | null;
}

/**
 * One queued change, as it goes on the wire — plus `attempts`, which does not.
 *
 * `attempts` is client-side bookkeeping (`pushAttempts` in the protocol's
 * prose) and is stripped before the request is built. It exists so that a row
 * the server keeps refusing stops being re-sent on every pass, without the
 * member's edit being thrown away: five refusals move it to `blocked`, where
 * the UI can badge it and offer a retry.
 */
export interface PendingPush {
  op: PushOp;
  id: string;
  baseUpdatedAt: string | null;
  updatedAt: string;
  data?: Record<string, unknown>;
  attempts: number;
}

/**
 * How many times a push is re-sent before the surface has to involve the
 * member.
 *
 * Five, from `contracts/sync.md`. The cap is not a way of discarding the edit —
 * it is the opposite: the row stays queued and shows up in `blocked` so a
 * badge and a tap-to-retry can exist. Dropping it silently is the one outcome
 * the contract forbids, because the member typed something and would never
 * learn it did not survive.
 */
export const MAX_PUSH_ATTEMPTS = 5;

/**
 * One local table, as the sync engine needs to see it.
 *
 * The engine cannot own the storage: the portal holds rows in memory for the
 * page's lifetime, the extension holds them in Dexie because its side panel
 * re-mounts every time it is closed, and the two cannot share an
 * implementation. What they can share is the protocol, which is everything in
 * `SyncStore` — so the storage is a port with seven small methods and the rules
 * live on this side of it.
 *
 * Implementations are free to be synchronous; every method is awaited, so an
 * in-memory table can return plain values and Dexie can return promises.
 */
export interface SyncTable<Row extends SyncedRow = SyncedRow> {
  /**
   * Everything queued for push, oldest first.
   *
   * This *is* the push queue — the engine keeps no second copy. That is
   * deliberate: the extension's service worker is killed and restarted at the
   * browser's discretion, and a queue held in the engine's memory would take
   * the member's unsent edits with it. Dexie's `pending_ops` table survives;
   * an instance field does not.
   */
  pending(): Promise<PendingPush[]> | PendingPush[];

  /**
   * Queue a change, replacing any entry already queued for the same id.
   *
   * Replacing rather than appending is what makes three quick edits to one task
   * one push. It is also why `attempts` rides on the record: the engine
   * re-enqueues with a higher count instead of tracking it separately.
   */
  enqueue(push: PendingPush): Promise<void> | void;

  /** Drop the queue entries and clear `pendingOp` for exactly these ids. */
  clearPending(ids: string[]): Promise<void> | void;

  /**
   * Upsert server rows by id, stamping `baseUpdatedAt` from each row's own
   * `updatedAt` — never from a local edit, and never from the clock.
   */
  applyServerRows(rows: Row[]): Promise<void> | void;

  /** Remove rows outright: a rejection with no server row, or the delete sweep. */
  removeRows(ids: string[]): Promise<void> | void;

  /** Every id this surface holds, tombstones included. The sweep's input. */
  heldIds(): Promise<string[]> | string[];

  /**
   * The server's `updatedAt` for the version last pulled, or null for a row the
   * server has never sent.
   *
   * Read by `queue()` so that the value on the wire comes from here and cannot
   * come from the caller. A caller that passed its own edit time would be
   * passing the field that makes the fast path work, and the fast path is the
   * ordinary case.
   */
  baseVersion(id: string): Promise<string | null> | string | null;
}

/** Where the cursor lives on a given surface. Same shape as `TokenStorage`, same reason. */
export interface CursorStorage {
  read(): string | null;
  write(cursor: string | null): void;
}

/** A cursor that forgets when the page does — the default, and safe anywhere. */
export function inMemoryCursorStorage(): CursorStorage {
  let held: string | null = null;
  return {
    read: () => held,
    write: (cursor) => {
      held = cursor;
    },
  };
}

export interface SyncRejection {
  entity: SyncEntity;
  id: string;
  reason: RejectionReason;
  /** The server's row, or null when the server has nothing to offer. */
  server: SyncedRow | null;
}

/**
 * An alert the phone (or anything else that can schedule locally) should arm.
 *
 * Carried on every response for the next seven days, because alerts fire from
 * the device so that they work offline; the server sweep is only the fallback.
 * The SDK holds the list and does nothing with it — a browser tab has no alarm
 * to set — so that the extension's service worker can arm `chrome.alarms` from
 * it without a second round trip.
 */
export interface PendingAlert {
  source: { kind: string; id: string; occurrenceAt?: string | null };
  label: string;
  notifyAt: string;
  title: string;
  body: string;
  deepLink?: string | null;
}

/** The response, as `contracts/sync.md` defines it. */
export interface SyncResponse {
  now: string;
  full: boolean;
  pull: Partial<Record<SyncEntity, unknown>> & { moreMessages?: boolean };
  accepted: Partial<Record<SyncEntity, string[]>>;
  rejections: SyncRejection[];
  pendingAlerts: PendingAlert[];
}

/** What one round trip did, for a caller that wants to report it. */
export interface SyncOutcome {
  full: boolean;
  cursor: string;
  /** Rows pulled and applied, summed over every registered table. */
  applied: number;
  accepted: number;
  rejections: SyncRejection[];
  /** Pushes that have hit the attempt cap and are waiting on the member. */
  blocked: PendingPush[];
  /** Ids the sweep removed, per entity. Empty unless `full`. */
  swept: Partial<Record<SyncEntity, string[]>>;
}

export interface SyncStoreOptions {
  /** This surface's install id — `chrome_extension` for the side panel. */
  installId: string;
  /** The tables this surface holds. Its keys are the `entities` asked for. */
  tables: Partial<Record<SyncEntity, SyncTable>>;
  cursorStorage?: CursorStorage;
}

/**
 * One round trip of `/api/v1/sync`, and the rules that make it safe to replay.
 *
 * The protocol is small and every one of its client obligations is a bug that
 * has been paid for somewhere, so they are enumerated here rather than left to
 * each surface:
 *
 * 1. **Rejections first, branching on `entity` before touching any table.**
 *    Every entity shares the rejection shape, which is exactly why the branch
 *    has to come first: writing a refused meeting through the task path
 *    corrupts rather than crashes, and nothing tells you.
 * 2. **`pendingOp` is cleared only for ids listed in `accepted`.** Not for
 *    "everything we sent" — a push the server neither accepted nor rejected
 *    (dropped mid-batch, an entity the server does not know) has to stay
 *    queued.
 * 3. **`baseUpdatedAt` comes from the server row only.** See `SyncedRow`.
 * 4. **The delete sweep runs only when `full`.** A delta lists what changed;
 *    treating it as the complete set deletes every row that simply did not
 *    change. Deletions arrive as tombstones instead.
 * 5. **Five attempts, then stop re-sending — and never discard the edit.**
 *
 * The cursor is written last, after every table has committed, because the
 * cursor is the claim "I hold everything up to here". Writing it before the
 * apply means a failure between the two loses rows the client will never ask
 * for again.
 */
export class SyncStore {
  #cursorStorage: CursorStorage;
  #inFlight: Promise<SyncOutcome> | null = null;
  #queuedRerun: Promise<SyncOutcome> | null = null;
  #syncing = false;
  #lastSyncedAt: string | null = null;
  #lastError: Error | null = null;
  #pendingAlerts: PendingAlert[] = [];
  #blocked: PendingPush[] = [];
  #listeners = new Set<() => void>();

  constructor(
    private readonly client: BotvyClient,
    private readonly options: SyncStoreOptions,
  ) {
    this.#cursorStorage = options.cursorStorage ?? inMemoryCursorStorage();
  }

  /** The server's `now` from the last completed pass, echoed back as `since`. */
  get cursor(): string | null {
    return this.#cursorStorage.read();
  }

  get syncing(): boolean {
    return this.#syncing;
  }

  get lastSyncedAt(): string | null {
    return this.#lastSyncedAt;
  }

  /** The last transport or server failure, for a sync indicator to show. */
  get lastError(): Error | null {
    return this.#lastError;
  }

  /** Alerts for the next seven days, for a surface that can schedule locally. */
  get pendingAlerts(): PendingAlert[] {
    return this.#pendingAlerts;
  }

  /**
   * Pushes that have been refused `MAX_PUSH_ATTEMPTS` times.
   *
   * Non-empty means the UI owes the member a badge and a way to retry. The
   * rows are still in the queue; they are simply not being re-sent on their
   * own any more.
   */
  get blocked(): PendingPush[] {
    return this.#blocked;
  }

  /** The entities this surface asks for, which is whatever it registered a table for. */
  get entities(): SyncEntity[] {
    return Object.keys(this.options.tables) as SyncEntity[];
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Queue a local change for the next pass.
   *
   * `baseUpdatedAt` is read from the table rather than accepted from the
   * caller, so the server's fast path (`baseUpdatedAt == server.updatedAt`,
   * decided without consulting any clock) cannot be broken by a caller that
   * had a local timestamp to hand.
   *
   * `updatedAt` defaults to now, which is right: it is this surface's edit
   * time, and the server only falls back to comparing it when the base no
   * longer matches.
   */
  async queue(
    entity: SyncEntity,
    change: { op: PushOp; id: string; data?: Record<string, unknown>; updatedAt?: string },
  ): Promise<void> {
    const table = this.options.tables[entity];
    if (!table) {
      throw new Error(`No local table registered for "${entity}".`);
    }
    await table.enqueue({
      op: change.op,
      id: change.id,
      baseUpdatedAt: await table.baseVersion(change.id),
      updatedAt: change.updatedAt ?? new Date().toISOString(),
      data: change.data,
      attempts: 0,
    });
    this.#announce();
  }

  /**
   * Push, pull, apply — once at a time, with at most one pass queued behind.
   *
   * Joining an in-flight pass would be wrong rather than merely lazy: a change
   * queued while a request is on the wire is not in that request, so a caller
   * that joined would be told its edit had synced when the server has never
   * seen it. The queued re-run is what makes "kick the sync after every edit" a
   * safe thing for a UI to do — the second and third kicks collapse into one
   * pass that runs after the first finishes.
   */
  async sync(): Promise<SyncOutcome> {
    if (this.#inFlight) {
      // One pass may wait behind the one on the wire; every further caller
      // joins that same waiting pass rather than adding another.
      this.#queuedRerun ??= this.#inFlight.catch(() => undefined).then(() => {
        this.#queuedRerun = null;
        return this.#start();
      });
      return this.#queuedRerun;
    }
    return this.#start();
  }

  /** Starts a pass and publishes it as the in-flight one, so the next caller waits. */
  #start(): Promise<SyncOutcome> {
    this.#inFlight = this.#run().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  /**
   * Put the blocked pushes back in the rotation, at the member's request.
   *
   * The counter is reset rather than the cap lifted: whatever the member did
   * about the conflict — edited the row, accepted the server's version — the
   * next five passes are a fresh judgement, and if it is still refused they
   * land back here.
   */
  async retryBlocked(): Promise<void> {
    for (const table of Object.values(this.options.tables) as SyncTable[]) {
      const stuck = (await table.pending()).filter((push) => push.attempts >= MAX_PUSH_ATTEMPTS);
      for (const push of stuck) await table.enqueue({ ...push, attempts: 0 });
    }
    this.#blocked = [];
    this.#announce();
  }

  /**
   * Forget the cursor, so the next pass is a full pull.
   *
   * Called on sign-out and after anything that could have left the local tables
   * disagreeing with the server. It does not clear the tables: the surface owns
   * those, and on sign-out it drops them itself.
   */
  reset(): void {
    this.#cursorStorage.write(null);
    this.#lastSyncedAt = null;
    this.#pendingAlerts = [];
    this.#blocked = [];
    this.#announce();
  }

  async #run(): Promise<SyncOutcome> {
    this.#syncing = true;
    this.#lastError = null;
    this.#announce();

    try {
      const sent = await this.#collectPush();
      const response = await this.client.rest<SyncResponse>('POST', '/sync', {
        installId: this.options.installId,
        since: this.cursor,
        entities: this.entities,
        push: sent.wire,
      });
      const outcome = await this.#apply(response, sent.blocked);
      this.#lastSyncedAt = response.now;
      return outcome;
    } catch (error) {
      // The queue is untouched on a failure. A pass that could not reach the
      // server is not an attempt the server judged, so nothing is counted
      // against `MAX_PUSH_ATTEMPTS` here — five flights through a tunnel would
      // otherwise blocked-badge an edit the server has no opinion about.
      this.#lastError = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally {
      this.#syncing = false;
      this.#announce();
    }
  }

  /**
   * Builds the `push` map, leaving the over-attempted rows behind.
   *
   * `attempts` is stripped: it is this client's bookkeeping and the API rejects
   * unknown fields rather than ignoring them.
   */
  async #collectPush(): Promise<{
    wire: Partial<Record<SyncEntity, Array<Omit<PendingPush, 'attempts'>>>>;
    blocked: PendingPush[];
  }> {
    const wire: Partial<Record<SyncEntity, Array<Omit<PendingPush, 'attempts'>>>> = {};
    const blocked: PendingPush[] = [];

    for (const [entity, table] of Object.entries(this.options.tables) as Array<
      [SyncEntity, SyncTable]
    >) {
      const queued = await table.pending();
      const sendable: Array<Omit<PendingPush, 'attempts'>> = [];
      for (const push of queued) {
        if (push.attempts >= MAX_PUSH_ATTEMPTS) {
          blocked.push(push);
          continue;
        }
        const { attempts: _held, ...onTheWire } = push;
        sendable.push(onTheWire);
      }
      if (sendable.length) wire[entity] = sendable;
    }

    return { wire, blocked };
  }

  /**
   * The apply, in the order the contract fixes.
   *
   * Rejections, then the accepted markers, then the pulls, then the sweep, then
   * the cursor. The order is not stylistic: applying pulls before rejections
   * would let a pull overwrite a row a rejection is about to replace with the
   * server's own version, and clearing pending markers before the rejections
   * are read would clear the marker on a row that was refused.
   */
  async #apply(response: SyncResponse, blocked: PendingPush[]): Promise<SyncOutcome> {
    const rejections = response.rejections ?? [];

    // 1. Rejections, branching on `entity` first. An unknown entity is skipped
    //    rather than guessed at: this surface has no table for it, and pushing
    //    somebody else's row through a table that happens to be registered is
    //    how a refused meeting ends up written as a task.
    const stillBlocked = [...blocked];
    for (const rejection of rejections) {
      const table = this.options.tables[rejection.entity];
      if (!table) continue;

      // Read the queued push **before** the row is touched. Both branches
      // below drop the queue entry for the id as a side effect of writing the
      // row — which is right for an accepted change and wrong here, because
      // this change was refused and its attempt still has to be counted. Doing
      // it in the other order costs the count silently: the push comes back on
      // the next pass with `attempts` at zero, and a row the server refuses
      // forever is re-sent forever without ever reaching `blocked`.
      const queued = (await table.pending()).find((push) => push.id === rejection.id);

      if (rejection.server) {
        // The server has a row: take it. `applyServerRows` is the same path a
        // pull uses, so `baseUpdatedAt` comes out of the server's own
        // `updatedAt` and the local `pendingOp` goes away with it.
        await table.applyServerRows([rejection.server]);
      } else {
        // Nothing to take — the row is gone on the server (`gone`, or a `purge`
        // that already happened). Remove it locally rather than leaving a row
        // that will be refused forever.
        await table.removeRows([rejection.id]);
      }

      // The edit is kept and its attempt counted. Even a `protected` refusal
      // stays queued: the member may still be able to do something about it,
      // and dropping their edit because the server said no once is the failure
      // the cap exists to avoid rather than to cause.
      if (queued) {
        const attempted = { ...queued, attempts: queued.attempts + 1 };
        await table.enqueue(attempted);
        if (attempted.attempts >= MAX_PUSH_ATTEMPTS) stillBlocked.push(attempted);
      }
    }

    // 2. `pendingOp` cleared for exactly the accepted ids, and nothing else.
    let accepted = 0;
    for (const [entity, ids] of Object.entries(response.accepted ?? {}) as Array<
      [SyncEntity, string[]]
    >) {
      const table = this.options.tables[entity];
      if (!table || !ids?.length) continue;
      await table.clearPending(ids);
      accepted += ids.length;
    }

    // 3. Pulls, as upserts by id.
    let applied = 0;
    const pulled = new Map<SyncEntity, string[]>();
    for (const entity of this.entities) {
      const table = this.options.tables[entity]!;
      const rows = response.pull?.[entity];
      // Only the row-shaped entities come through a table. `profile`,
      // `preferences` and `athlete_profile` are single objects and `messages`
      // is a paged stream with its own cursor — none of them is a set of rows
      // keyed by id, so none of them is applied here even if a surface asked
      // for it. `moreMessages` paging belongs to whoever owns the message
      // store, which is not this engine.
      if (!Array.isArray(rows)) continue;
      const typed = rows as SyncedRow[];
      await table.applyServerRows(typed);
      pulled.set(
        entity,
        typed.map((row) => row.id),
      );
      applied += typed.length;
    }

    // 4. The delete sweep — **only on a full pull**. A delta says what changed;
    //    sweeping against it deletes every row that simply did not change.
    //    Rows with a pending operation are skipped whether or not the server
    //    sent them: the server has not seen that edit yet, so its silence is
    //    not evidence the row is gone.
    const swept: Partial<Record<SyncEntity, string[]>> = {};
    if (response.full) {
      for (const entity of this.entities) {
        const table = this.options.tables[entity]!;
        // Only entities that actually came back as rows. An entity the server
        // omitted is one it had nothing to say about, and "nothing to say" is
        // not "you hold nothing" — sweeping on an absent key would empty the
        // table.
        const keep = pulled.get(entity);
        if (!keep) continue;

        const keepIds = new Set(keep);
        const pendingIds = new Set((await table.pending()).map((push) => push.id));
        const doomed = (await table.heldIds()).filter(
          (id) => !keepIds.has(id) && !pendingIds.has(id),
        );
        if (doomed.length) {
          await table.removeRows(doomed);
          swept[entity] = doomed;
        }
      }
    }

    // 5. The cursor, last, once every table above has committed. It is the
    //    claim "I hold everything up to here", and a claim written before the
    //    apply is a claim for rows this client will never ask for again.
    this.#cursorStorage.write(response.now);

    this.#pendingAlerts = response.pendingAlerts ?? [];
    this.#blocked = stillBlocked;

    return {
      full: response.full,
      cursor: response.now,
      applied,
      accepted,
      rejections,
      blocked: stillBlocked,
      swept,
    };
  }

  #announce(): void {
    for (const listener of this.#listeners) listener();
  }
}

/**
 * A `SyncTable` that holds its rows in memory.
 *
 * What the portal wants, and what a test wants. The extension replaces it with
 * a Dexie-backed one, because a side panel re-mounts every time it is closed
 * and a `Map` does not survive that — which is the same reason the extension's
 * tokens live in `chrome.storage`.
 *
 * `TasksStore` and `LabelsStore` each own one of these and expose it as their
 * `table`, so the two rules the port cannot express — `baseUpdatedAt` from the
 * server row, `pendingOp` cleared only when accepted — are implemented once
 * here instead of once per entity.
 */
export class MemorySyncTable<Row extends SyncedRow = SyncedRow> implements SyncTable<Row> {
  #rows = new Map<string, Row>();
  #queue = new Map<string, PendingPush>();
  #listeners = new Set<() => void>();

  get rows(): Row[] {
    return [...this.#rows.values()];
  }

  byId(id: string): Row | null {
    return this.#rows.get(id) ?? null;
  }

  /** Notified on every change, so a re-mounted view can catch up. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * A local edit, applied optimistically and marked pending.
   *
   * `updatedAt` moves; `baseUpdatedAt` does not — it still names the server
   * version this row was pulled at, which is the version the server compares
   * against. Touching it here is the bug that turns every offline edit into a
   * clock comparison.
   */
  applyLocal(row: Row, pendingOp: PushOp): void {
    const existing = this.#rows.get(row.id);
    this.#rows.set(row.id, {
      ...row,
      baseUpdatedAt: existing?.baseUpdatedAt ?? row.baseUpdatedAt ?? null,
      pendingOp,
    });
    this.#announce();
  }

  pending(): PendingPush[] {
    return [...this.#queue.values()];
  }

  enqueue(push: PendingPush): void {
    this.#queue.set(push.id, push);
    const row = this.#rows.get(push.id);
    if (row) this.#rows.set(push.id, { ...row, pendingOp: push.op });
    this.#announce();
  }

  clearPending(ids: string[]): void {
    for (const id of ids) {
      this.#queue.delete(id);
      const row = this.#rows.get(id);
      if (row) this.#rows.set(id, { ...row, pendingOp: null });
    }
    this.#announce();
  }

  applyServerRows(rows: Row[]): void {
    for (const row of rows) {
      // `baseUpdatedAt` is the row's own `updatedAt`, always. This is the only
      // place it is ever written, which is the point: one writer means it
      // cannot be a local time by accident.
      this.#rows.set(row.id, { ...row, baseUpdatedAt: row.updatedAt, pendingOp: null });
      this.#queue.delete(row.id);
    }
    this.#announce();
  }

  removeRows(ids: string[]): void {
    for (const id of ids) {
      this.#rows.delete(id);
      this.#queue.delete(id);
    }
    this.#announce();
  }

  heldIds(): string[] {
    return [...this.#rows.keys()];
  }

  baseVersion(id: string): string | null {
    return this.#rows.get(id)?.baseUpdatedAt ?? null;
  }

  /** Dropped on sign-out, so the next member does not see the last one's rows. */
  clear(): void {
    this.#rows.clear();
    this.#queue.clear();
    this.#announce();
  }

  #announce(): void {
    for (const listener of this.#listeners) listener();
  }
}
