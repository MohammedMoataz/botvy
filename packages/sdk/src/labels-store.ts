import { ApiError, type BotvyClient } from './client.js';
import { newId } from './ids.js';
import { MemorySyncTable, type SyncedRow } from './sync-store.js';

/**
 * A label as this surface holds it, with `openTaskCount` as the server counts it.
 *
 * The count is a read-model field: it is computed on the server against the
 * tasks collection and it arrives with the row. Nothing here recomputes it from
 * the local tasks, because the local tasks are a subset — the extension syncs
 * only a slice — and a count that disagreed with the one on the phone would be
 * worse than no count.
 */
export interface LabelRow extends SyncedRow {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  openTaskCount: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NewLabel {
  id?: string;
  name: string;
  /** Omitted means the server picks the next unused colour from its palette. */
  color?: string;
  sortOrder?: number;
}

export type LabelPatch = Omit<NewLabel, 'id'>;

export interface LabelAck {
  updatedAt: string;
}

export interface CreateLabelAck extends LabelAck {
  id: string;
  replayed: boolean;
}

/**
 * Thrown when the member already has a label by that name.
 *
 * A typed error rather than a bare 409, because the caller has something
 * specific to do about it: put the cursor back in the name field and say so.
 * The API answers `{ code: 'duplicate_label_name' }`, which is the only 409 the
 * label routes produce, so the code is checked rather than the status alone —
 * a future second conflict on these routes must not silently arrive here.
 */
export class DuplicateLabelName extends Error {
  // `labelName`, not `name`: `Error` already has a `name` and it is the error's
  // own class name, which every logger and every `instanceof`-free check reads.
  // Shadowing it with the label's name would make this error report itself as
  // "Work" in a stack trace.
  constructor(readonly labelName: string) {
    super(`A label called "${labelName}" already exists.`);
    this.name = 'DuplicateLabelName';
  }
}

/**
 * The member's labels.
 *
 * Same shape as `TasksStore` and for the same reasons: the commands are REST
 * and answer with an acknowledgement, the rows arrive through the sync pull,
 * and `table` is what the engine writes them through.
 *
 * Labels are pushed **before** tasks — the protocol applies parents before
 * children so that a task snapshot can never name a label the server has not
 * heard of. That ordering lives in the server's apply and in the order a
 * surface registers its tables, not here; this store only has to not fight it,
 * which it does by never creating a task.
 */
export class LabelsStore {
  /** In-memory and not injectable, for the reason `TasksStore.table` gives. */
  readonly table = new MemorySyncTable<LabelRow>();

  #listeners = new Set<() => void>();

  constructor(private readonly client: BotvyClient) {
    this.table.subscribe(() => this.#announce());
  }

  /**
   * The live labels, in the order the member arranged them.
   *
   * Tombstones are held (the pull carries them, and the sweep needs them) but
   * not offered: a deleted label has no place in a picker. `deleted` is there
   * for a screen that wants them.
   */
  get labels(): LabelRow[] {
    return this.table.rows
      .filter((row) => row.deletedAt === null)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
  }

  get deleted(): LabelRow[] {
    return this.table.rows.filter((row) => row.deletedAt !== null);
  }

  byId(id: string): LabelRow | null {
    return this.table.byId(id);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * A new label. The id is minted here, so a retry is the same label.
   *
   * The colour is optional on purpose: leaving it out has the server take the
   * next unused entry from `settings.labels.palette`, which is an operator knob
   * and therefore not something a client may hold a copy of. A client that
   * shipped its own palette would be a hard-coded default, which is a bug by
   * house rule.
   */
  async create(label: NewLabel): Promise<CreateLabelAck> {
    const id = label.id ?? newId();
    const ack = await this.#translate(label.name, () =>
      this.client.rest<CreateLabelAck>('POST', '/labels', { ...label, id }),
    );
    this.#stamp(id, ack.updatedAt, {
      name: label.name,
      ...(label.color === undefined ? {} : { color: label.color }),
      ...(label.sortOrder === undefined ? {} : { sortOrder: label.sortOrder }),
    });
    return ack;
  }

  /**
   * A rename or a recolour.
   *
   * The rename shows on every task that carries the label, because the server
   * refreshes the snapshot it copied onto them. That refresh arrives on the
   * next pull — this store cannot do it, and must not try: the task rows are
   * `TasksStore`'s, and reaching into them from here to rewrite a name is the
   * cross-store write the platform's first principle exists to forbid.
   */
  async update(
    id: string,
    patch: LabelPatch,
  ): Promise<{ changed: string[]; updatedAt: string }> {
    const ack = await this.#translate(patch.name ?? '', () =>
      this.client.rest<{ changed: string[]; updatedAt: string }>(
        'PATCH',
        `/labels/${encodeURIComponent(id)}`,
        patch,
      ),
    );
    this.#stamp(
      id,
      ack.updatedAt,
      Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as Partial<LabelRow>,
    );
    return ack;
  }

  /**
   * Deleted, which is a tombstone. The tasks that carried it keep their own
   * status and lose only the label — again, on the next pull.
   */
  async remove(id: string): Promise<LabelAck> {
    const ack = await this.client.rest<LabelAck>(
      'DELETE',
      `/labels/${encodeURIComponent(id)}`,
    );
    this.#stamp(id, ack.updatedAt, { deletedAt: ack.updatedAt });
    return ack;
  }

  /** Dropped on sign-out. */
  clear(): void {
    this.table.clear();
  }

  /**
   * Turns the one conflict these routes produce into something a form can act
   * on, and leaves everything else alone.
   */
  async #translate<T>(name: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code =
        error instanceof ApiError
          ? (error.body as { code?: string } | null)?.code
          : undefined;
      if (code === 'duplicate_label_name') throw new DuplicateLabelName(name);
      throw error;
    }
  }

  /**
   * Applies a change locally with the server's `updatedAt`. See `TasksStore`'s
   * own `#stamp` for why taking that value is allowed here: it is the server's
   * row version, not a local clock reading.
   */
  #stamp(id: string, updatedAt: string, patch: Partial<LabelRow>): void {
    const existing = this.table.byId(id);
    const merged: LabelRow = {
      id,
      name: '',
      color: '',
      sortOrder: 0,
      openTaskCount: 0,
      deletedAt: null,
      ...existing,
      ...patch,
      updatedAt,
    };
    this.table.applyServerRows([merged]);
  }

  #announce(): void {
    for (const listener of this.#listeners) listener();
  }
}
