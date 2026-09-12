import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

export interface LabelState {
  id: string;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_LABEL_NAME_LENGTH = 60;

/** `#rrggbb`, lower case. The palette offers some; a member may type any. */
const HEX_COLOR = /^#[0-9a-f]{6}$/;

export class LabelRuleError extends Error {
  constructor(
    readonly code: 'name_required' | 'bad_color' | 'not_deleted',
    message: string,
  ) {
    super(message);
    this.name = 'LabelRuleError';
  }
}

/**
 * A colour-coded name the member groups tasks under.
 *
 * Two things about it are load-bearing beyond the obvious:
 *
 * **`nameLower` is not a convenience field.** It is the column the unique index
 * is built over, because Mongo has no expression indexes and "no two labels
 * called Work" has to be enforced against a stored comparison form. The
 * aggregate is the only thing that computes it, so the index and the domain can
 * never disagree about what two names being the same means.
 *
 * **A deleted label frees its name.** `tombstone` unsets `nameLower`, and the
 * index is partial on that field existing — so the member who deletes "Work"
 * can immediately create "Work" again, while the tombstone stays around long
 * enough for every device to hear about the deletion. Enforcing uniqueness over
 * `deletedAt` instead would need the index to understand a status, and Mongo's
 * partial expressions are not the place to encode a lifecycle.
 */
export class Label extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  name: string;
  color: string;
  sortOrder: number;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: LabelState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.name = state.name;
    this.color = state.color;
    this.sortOrder = state.sortOrder;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: LabelState): Label {
    return new Label(state);
  }

  /** With the client's own id, for the same offline reason a task has one. */
  static create(state: Omit<LabelState, 'updatedAt' | 'deletedAt'>): Label {
    const label = new Label({
      ...state,
      name: requireName(state.name),
      color: requireColor(state.color),
      deletedAt: null,
      updatedAt: state.createdAt,
    });
    // No event. Nothing outside Planning reacts to a label existing, and the
    // snapshot refresh only has work to do when one *changes*.
    return label;
  }

  /**
   * Rename, recolour, reorder.
   *
   * `LabelUpdated` carries the new name and colour because its only consumer is
   * Planning itself, refreshing the snapshot embedded on every task that
   * carries this label. Sending the values means that handler does not have to
   * read the label back to know what to write.
   */
  update(
    patch: { name?: string; color?: string; sortOrder?: number },
    at: Date = new Date(),
  ): string[] {
    const changed: string[] = [];

    if (patch.name !== undefined) {
      const name = requireName(patch.name);
      if (name !== this.name) {
        this.name = name;
        changed.push('name');
      }
    }

    if (patch.color !== undefined) {
      const color = requireColor(patch.color);
      if (color !== this.color) {
        this.color = color;
        changed.push('color');
      }
    }

    if (patch.sortOrder !== undefined && patch.sortOrder !== this.sortOrder) {
      this.sortOrder = patch.sortOrder;
      changed.push('sortOrder');
    }

    if (changed.length === 0) return changed;

    this.updatedAt = at;
    // Raised for a reorder too, which changes no snapshot. The handler compares
    // before writing and does nothing, and that costs one query — cheaper than
    // a second event name whose only difference is which fields moved.
    this.raise(
      'planning.LabelUpdated',
      'label',
      { labelId: this.id, name: this.name, color: this.color },
      at,
    );
    return changed;
  }

  /**
   * Deleted. The tasks that carried it keep their snapshot until the handler
   * clears it, and they keep their own status either way — a label going away
   * is not a task being finished.
   */
  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
    this.raise(
      'planning.LabelDeleted',
      'label',
      { labelId: this.id, name: this.name, color: this.color },
      at,
    );
  }

  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
    this.raise(
      'planning.LabelUpdated',
      'label',
      { labelId: this.id, name: this.name, color: this.color },
      at,
    );
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * The comparison form, or `undefined` for a tombstone.
   *
   * `undefined` rather than `null` matters: the mapper omits an undefined field,
   * and the unique index is partial on `$exists: true`. A null would be a
   * *value* to Mongo, and every tombstoned label would then collide with every
   * other one — the exact trap that partial index exists to avoid, arriving
   * from the other direction.
   */
  get nameLower(): string | undefined {
    return this.isDeleted ? undefined : this.name.toLowerCase();
  }

  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new LabelRuleError(
        'not_deleted',
        'Only a deleted label can be erased.',
      );
    }
  }

  get snapshot(): { name: string; color: string } {
    return { name: this.name, color: this.color };
  }
}

function requireName(raw: string): string {
  const name = raw.trim().slice(0, MAX_LABEL_NAME_LENGTH);
  if (name === '') {
    throw new LabelRuleError('name_required', 'A label needs a name.');
  }
  return name;
}

function requireColor(raw: string): string {
  const color = raw.trim().toLowerCase();
  if (!HEX_COLOR.test(color)) {
    throw new LabelRuleError(
      'bad_color',
      `"${raw}" is not a colour like #0f766e.`,
    );
  }
  return color;
}
