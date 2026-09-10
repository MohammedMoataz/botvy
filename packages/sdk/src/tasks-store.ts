import type { BotvyClient } from './client.js';
import { newId } from './ids.js';
import { MemorySyncTable, type SyncedRow } from './sync-store.js';

export type Priority = 1 | 2 | 3 | 4;

/**
 * `open → completed | cancelled`, and back to `open` by reopening.
 *
 * Cancelled is not a synonym for completed and not a synonym for deleted: it is
 * "this was never going to happen". **Deleting a task must not touch its
 * status** — the status is the only record of whether it was dealt with, and the
 * Deleted view exists to show exactly that. Which is why `remove` below sets no
 * status and the `deleted` view reads the one that was already there.
 */
export type TaskStatus = 'open' | 'completed' | 'cancelled';

export type TaskSource = 'app' | 'chat' | 'extension' | 'rhythm';

export type RecurrenceMode = 'schedule' | 'completion';

/** The label's name and colour, snapshotted server-side so a list renders in one read. */
export interface LabelSnapshot {
  name: string;
  color: string;
}

/**
 * A recurrence as it goes on the wire: a rule, never expanded rows.
 *
 * `dtstart` plus an RRULE plus the dates lifted out of it. A moved occurrence
 * is an override and a skipped one an exdate — never an edit to the series —
 * which is what keeps "skip just this Tuesday" unambiguous and keeps a
 * repeating task one row to sync instead of a hundred.
 */
export interface TaskRecurrence {
  dtstart: string;
  rrule: string;
  mode: RecurrenceMode;
  exdates?: string[];
}

/**
 * A task as this surface holds it: **the shape the sync pull sends**, with
 * instants as ISO strings, plus the two sync columns from `SyncedRow`.
 *
 * ## It is the pull's shape, not the GraphQL read model's
 *
 * This interface was first written against the server's `TaskView` — the read
 * model behind the GraphQL queries — which carries `repeats`,
 * `recurrenceMode` and a server-rendered `recurrenceText`. But rows do not
 * arrive that way. Commands answer with an acknowledgement only, so every row
 * a client holds comes from `POST /api/v1/sync`, and the sync adapter sends the
 * *rule*: `recurrence` with its `dtstart`, `rrule`, `mode` and `exdates`, plus
 * `deferredFrom`.
 *
 * So the old declaration promised three fields that were `undefined` on every
 * row and omitted two that were always there. Typed from the wrong end.
 *
 * ## And the rule is what a client actually needs
 *
 * A screen showing "every 2 weeks on Tuesday" wants the sentence, and GraphQL
 * is where a screen gets it. A client holding a local copy needs something
 * else entirely: the phone completes a repeating task offline and has to work
 * out where the series goes next, and it has to plan its own alarms from the
 * rule. Neither is possible from a rendered sentence.
 *
 * Which is why the sync pull sends the rule and the read model sends the prose.
 * Both are right for their caller; this row is the pull's.
 */
export interface TaskRow extends SyncedRow {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  allDay: boolean;
  priority: Priority;
  labelId: string | null;
  label: LabelSnapshot | null;
  status: TaskStatus;
  completedAt: string | null;
  /** The rule, never expanded rows. Null for a task that does not repeat. */
  recurrence: TaskRecurrence | null;
  estimatedMinutes: number | null;
  deferCount: number;
  /** Where the task was before it was last deferred, for "carried over" copy. */
  deferredFrom: string | null;
  source: TaskSource;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** What a create sends. `id` is minted here when the caller has no opinion. */
export interface NewTask {
  id?: string;
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  allDay?: boolean;
  priority?: Priority;
  labelId?: string | null;
  recurrence?: TaskRecurrence | null;
  estimatedMinutes?: number | null;
  source?: TaskSource;
}

export type TaskPatch = Omit<NewTask, 'id' | 'source'>;

/**
 * The six lists the member actually has, named as they are named on screen and
 * as the server's `TaskListView` names them.
 */
export type TaskListView =
  'today' | 'upcoming' | 'overdue' | 'label' | 'completed' | 'deleted';

/** What a command acknowledges. No route returns a view — see `TasksStore`. */
export interface TaskAck {
  updatedAt: string;
}

export interface CreateTaskAck extends TaskAck {
  id: string;
  /** True when the call created nothing because the task was already there. */
  replayed: boolean;
}

export interface CompleteTaskAck extends TaskAck {
  /** Where the series went, or null when the task is simply finished. */
  recurrenceAdvancedTo: string | null;
}

export interface RolloverAck {
  moved: string[];
  /** Ids asked for that this member does not own, or that are no longer open. */
  skipped: string[];
}

/**
 * The calendar date an instant falls on, where the member is.
 *
 * **Times belong to the member, not to the machine.** `timeZone` is a required
 * argument and there is no default: reading the host's own zone here is the
 * mistake that once shifted every extracted reminder by three hours, and a
 * browser in a hotel is no more authoritative than a server in Frankfurt. The
 * caller passes `profile.timezone`.
 *
 * Comparing *calendar dates* is also why this returns a string rather than a
 * pair of instants. The server computes `dayStart`/`dayEnd` with a
 * daylight-saving-aware helper because it filters in Mongo; a client comparing
 * `YYYY-MM-DD` needs no boundary arithmetic at all, and `dueAt < dayEnd` is
 * exactly `localDay(dueAt) <= localDay(now)`. No arithmetic is no chance to get
 * a 23-hour spring-forward day wrong.
 */
export function localDay(instant: string | Date, timeZone: string): string {
  // `en-CA` because its short date format is already `YYYY-MM-DD`, so the parts
  // need no reassembly and no locale can reorder them.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant instanceof Date ? instant : new Date(instant));
}

export interface TaskViewFilter {
  /** The member's own zone, from their profile. Never the host's. */
  timezone: string;
  /** Required for `label`, ignored otherwise. */
  labelId?: string | null;
  now?: Date;
}

/**
 * The member's tasks, for whichever surface asked.
 *
 * **None of these routes returns a task.** Every command answers with an
 * acknowledgement — `{ updatedAt }`, or an id and a `replayed` flag — because
 * commands are REST and reads are not, and a controller that returned a view
 * would make breaking that split the path of least resistance. So the rows this
 * store holds come from the sync pull, through `table`, and a command's job
 * here is to apply the change optimistically and stamp the server's `updatedAt`
 * on it.
 *
 * That stamp is legitimate where a local clock would not be: the value in an
 * acknowledgement *is* the server's row version, so it is exactly what
 * `baseUpdatedAt` is allowed to be set from.
 *
 * Offline is the surface's decision, not this store's. A tab with a connection
 * calls these methods and the request goes out; the extension queues the same
 * change through `SyncStore.queue('tasks', …)` and it goes out on the next
 * pass. Both paths land in the same `table`.
 */
export class TasksStore {
  /** The local rows, and the `SyncTable` the engine writes them through. */
  /**
   * Where the rows live.
   *
   * In-memory, and **not injectable** — which contradicts what this class used
   * to claim, so here is the actual position.
   *
   * The extension needs Dexie-backed storage and cannot use this store because
   * of it; it restated `view('today')` in its own code instead, which is the
   * third copy of the member's-day rule after the two server adapters. That is
   * a real cost and it is recorded as E-011.
   *
   * It is not fixed by taking a `SyncTable` in the constructor, which was
   * tried. The reads below are *synchronous* — `rows`, `byId`, `subscribe` —
   * and IndexedDB is not, so satisfying the port is not the obstacle: the
   * store's own read surface is. Making it injectable means making every read
   * async and following that through the portal, which is a refactor rather
   * than a fix in passing.
   */
  readonly table = new MemorySyncTable<TaskRow>();

  #listeners = new Set<() => void>();

  constructor(private readonly client: BotvyClient) {
    // The engine writes rows through the table, not through this store, so a
    // pull has to reach subscribers somehow. Forwarding is that somehow.
    this.table.subscribe(() => this.#announce());
  }

  get tasks(): TaskRow[] {
    return this.table.rows;
  }

  byId(id: string): TaskRow | null {
    return this.table.byId(id);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * One of the six lists, filtered and ordered the way the server does it.
   *
   * A mirror of the backend's `taskPredicateFor` and of the ordering its
   * adapters share — deliberately, and it is the only duplication in this file:
   * the extension's Today list has to work with no connection, so the
   * definition of Today has to exist on this side too. Two definitions is a
   * risk, so this one is written to be *checkably* the same rather than
   * merely similar, and the spec asserts each row of it.
   *
   * `today` includes the overdue ones (`dueAt` before the end of today, not
   * inside today) because a task the member has not dealt with is still theirs
   * to deal with today. That is the server's rule, not a convenience.
   */
  view(view: TaskListView, filter: TaskViewFilter): TaskRow[] {
    const today = localDay(filter.now ?? new Date(), filter.timezone);
    const dayOf = (row: TaskRow): string | null =>
      row.dueAt ? localDay(row.dueAt, filter.timezone) : null;

    const matches = this.tasks.filter((row) => {
      switch (view) {
        case 'today': {
          const due = dayOf(row);
          return (
            row.deletedAt === null &&
            row.status === 'open' &&
            due !== null &&
            due <= today
          );
        }
        case 'upcoming': {
          const due = dayOf(row);
          return (
            row.deletedAt === null &&
            row.status === 'open' &&
            due !== null &&
            due > today
          );
        }
        case 'overdue': {
          const due = dayOf(row);
          return (
            row.deletedAt === null &&
            row.status === 'open' &&
            due !== null &&
            due < today
          );
        }
        case 'label':
          return (
            row.deletedAt === null && row.labelId === (filter.labelId ?? null)
          );
        case 'completed':
          return row.deletedAt === null && row.status === 'completed';
        case 'deleted':
          return row.deletedAt !== null;
      }
    });

    return matches.sort((a, b) => {
      if (view === 'completed')
        return time(b.completedAt) - time(a.completedAt);
      if (view === 'deleted') return time(b.deletedAt) - time(a.deletedAt);
      return time(a.dueAt) - time(b.dueAt) || a.priority - b.priority;
    });
  }

  /**
   * A new task.
   *
   * The id is minted here and a repeat of it is not an error: the route answers
   * 200 with `replayed: true` rather than 201, so a retry after a timeout is
   * the protocol working rather than a second task. Which is also why no
   * idempotency key is sent — the id *is* the key.
   */
  async create(task: NewTask): Promise<CreateTaskAck> {
    const id = task.id ?? newId();
    const ack = await this.client.rest<CreateTaskAck>('POST', '/tasks', {
      ...task,
      id,
    });
    this.#stamp(id, ack.updatedAt, rowFieldsFrom(task));
    return ack;
  }

  async update(
    id: string,
    patch: TaskPatch,
  ): Promise<{ changed: string[]; updatedAt: string }> {
    const ack = await this.client.rest<{
      changed: string[];
      updatedAt: string;
    }>('PATCH', `/tasks/${encodeURIComponent(id)}`, patch);
    this.#stamp(id, ack.updatedAt, rowFieldsFrom(patch));
    return ack;
  }

  /**
   * Ticked off — and for a series, re-armed.
   *
   * `recurrenceAdvancedTo` is why the acknowledgement is worth reading: the UI
   * shows "done" for a one-off and "done — next Tuesday" for a series, and
   * without it the client would have to re-derive the rule to find out which
   * happened. A series that advanced is still `open` locally, at its new
   * moment, which is what the next pull will confirm.
   */
  async complete(id: string, at?: string): Promise<CompleteTaskAck> {
    const ack = await this.client.rest<CompleteTaskAck>(
      'POST',
      `/tasks/${encodeURIComponent(id)}/complete`,
      at ? { at } : {},
    );
    this.#stamp(
      id,
      ack.updatedAt,
      ack.recurrenceAdvancedTo
        ? { status: 'open', completedAt: null, dueAt: ack.recurrenceAdvancedTo }
        : { status: 'completed', completedAt: at ?? ack.updatedAt },
    );
    return ack;
  }

  async reopen(id: string, at?: string): Promise<TaskAck> {
    const ack = await this.#act(id, 'reopen', at ? { at } : {});
    this.#stamp(id, ack.updatedAt, { status: 'open', completedAt: null });
    return ack;
  }

  async cancel(id: string, at?: string): Promise<TaskAck> {
    const ack = await this.#act(id, 'cancel', at ? { at } : {});
    this.#stamp(id, ack.updatedAt, { status: 'cancelled' });
    return ack;
  }

  /** Pushed to another day. The server counts the deferrals; this reads the count back. */
  async defer(
    id: string,
    toDate: string,
  ): Promise<TaskAck & { deferCount: number }> {
    const ack = await this.client.rest<TaskAck & { deferCount: number }>(
      'POST',
      `/tasks/${encodeURIComponent(id)}/defer`,
      { toDate },
    );
    this.#stamp(id, ack.updatedAt, {
      dueAt: toDate,
      deferCount: ack.deferCount,
    });
    return ack;
  }

  /**
   * Deleted, which is a tombstone and **not** a status change.
   *
   * Only `deletedAt` is set. The status stays whatever it was, because it is the
   * only record of whether the task was completed, cancelled or never dealt
   * with — and the Deleted view exists to show precisely that.
   */
  async remove(id: string): Promise<TaskAck> {
    const ack = await this.client.rest<TaskAck>(
      'DELETE',
      `/tasks/${encodeURIComponent(id)}`,
    );
    this.#stamp(id, ack.updatedAt, { deletedAt: ack.updatedAt });
    return ack;
  }

  /** Undeleted. Keeps the status it had, for the same reason `remove` never touched it. */
  async restore(id: string): Promise<TaskAck> {
    const ack = await this.#act(id, 'restore');
    this.#stamp(id, ack.updatedAt, { deletedAt: null });
    return ack;
  }

  /** Erased for good. 204, so there is no acknowledgement to stamp. */
  async purge(id: string): Promise<void> {
    await this.client.rest<void>(
      'POST',
      `/tasks/${encodeURIComponent(id)}/purge`,
    );
    this.table.removeRows([id]);
  }

  /**
   * "Not this one" — an exdate on the series, never an edit to it.
   *
   * The occurrence goes in the path exactly as the meetings route spells it,
   * because a member skipping a repeating task and a member skipping a
   * repeating meeting are doing the same thing.
   */
  async skipOccurrence(
    id: string,
    occurrence: string,
  ): Promise<TaskAck & { dueAt: string | null }> {
    const ack = await this.client.rest<TaskAck & { dueAt: string | null }>(
      'POST',
      `/tasks/${encodeURIComponent(id)}/occurrences/${encodeURIComponent(occurrence)}/skip`,
    );
    this.#stamp(id, ack.updatedAt, { dueAt: ack.dueAt });
    return ack;
  }

  /**
   * A set of tasks carried to another day — the evening prompt's "carry these
   * four over".
   *
   * `skipped` names the ids the server would not move, so a client that assumed
   * every id moved would show four tasks on tomorrow and have three. Only the
   * moved ones are stamped locally; the rest wait for the pull to say what
   * happened to them.
   */
  async rollover(taskIds: string[], toDate: string): Promise<RolloverAck> {
    const ack = await this.client.rest<RolloverAck>('POST', '/tasks/rollover', {
      taskIds,
      toDate,
    });
    for (const id of ack.moved) {
      const row = this.table.byId(id);
      if (row) this.table.applyLocal({ ...row, dueAt: toDate }, 'update');
    }
    return ack;
  }

  /** Dropped on sign-out, so the next member does not see the last one's tasks. */
  clear(): void {
    this.table.clear();
  }

  /** The routes that take an id and answer `{ updatedAt }`, spelled once. */
  async #act(id: string, action: string, body?: unknown): Promise<TaskAck> {
    return this.client.rest<TaskAck>(
      'POST',
      `/tasks/${encodeURIComponent(id)}/${action}`,
      body ?? {},
    );
  }

  /**
   * Applies a change locally and takes the server's `updatedAt` for it.
   *
   * The row goes in with **no** pending operation: this change went to the
   * server and the server answered, so there is nothing to push. The stamped
   * `updatedAt` is the server's own row version, which is why passing it
   * through `applyServerRows` — the one place `baseUpdatedAt` is written — is
   * correct here and would not be for a local edit.
   *
   * A row the store has never seen (created in this call, or pulled by another
   * surface) is merged over a blank one rather than dropped: the alternative is
   * a create that does not appear until the next sync, which reads as the
   * button having done nothing.
   */
  #stamp(id: string, updatedAt: string, patch: Partial<TaskRow>): void {
    const existing = this.table.byId(id);
    const merged = {
      ...(existing ?? blankTask(id, { updatedAt })),
      ...patch,
      id,
      updatedAt,
    } as TaskRow;
    this.table.applyServerRows([merged]);
  }

  #announce(): void {
    for (const listener of this.#listeners) listener();
  }
}

/**
 * Milliseconds, with a null sorting **first** — deliberately, and not because
 * it is nicer.
 *
 * MongoDB orders null below every date, so the server's two adapters both put
 * an undated task above everything with a deadline; `label` is the only view
 * that carries one, and `enhancements/E-007` records that ordering as a known
 * cost rather than a defect. This is the third adapter of the same list, so it
 * agrees with the other two. A client that quietly sorted nulls last would put
 * the extension's by-label list in a different order from the phone's, which is
 * exactly the silent disagreement the server's two adapters were reconciled to
 * end. If E-007 is ever taken, this line changes with it.
 */
function time(value: string | null): number {
  return value ? new Date(value).getTime() : 0;
}

/**
 * A create or a patch, translated into the row fields it implies.
 *
 * Two things it is doing, both of which have to happen somewhere. First, only
 * the keys the caller actually set are kept: a patch spread wholesale writes
 * `undefined` over a field nobody mentioned, and in a local row that is
 * indistinguishable from clearing it. `null` survives, because for `notes`,
 * `dueAt` and `labelId` it means "clear this" and the API reads it the same way.
 *
 * Second, `recurrence` **is** a row field and is kept. It used to be stripped
 * here, on the belief that the row carried a rendered `recurrenceText`
 * instead — see `TaskRow` for why that was the wrong end to type from. The
 * rule is what the pull sends and what a client needs to advance a series
 * locally, so a task created here holds it from the moment it is created
 * rather than only after the next pull.
 */
function rowFieldsFrom(patch: NewTask | TaskPatch): Partial<TaskRow> {
  const rest = { ...patch } as NewTask;
  delete (rest as { id?: string }).id;

  const fields = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as Partial<TaskRow>;

  // `recurrence` needs no projection now: it is the row's own field, so the
  // spread above has already carried it. This used to derive `repeats` and
  // `recurrenceMode` from it, which is what the row was wrongly typed to hold.
  return fields;
}

/**
 * The defaults the server applies to a task nobody has described yet.
 *
 * Used only to fill the fields an acknowledgement does not carry, so that a
 * just-created task can render before the first pull replaces it with the real
 * row. Priority 4 and `source: 'app'` are the server's own defaults.
 */
function blankTask(id: string, ack: { updatedAt: string }): TaskRow {
  return {
    id,
    title: '',
    notes: null,
    dueAt: null,
    allDay: false,
    priority: 4,
    labelId: null,
    label: null,
    status: 'open',
    completedAt: null,
    recurrence: null,
    estimatedMinutes: null,
    deferCount: 0,
    deferredFrom: null,
    source: 'app',
    createdAt: ack.updatedAt,
    updatedAt: ack.updatedAt,
    deletedAt: null,
  };
}
