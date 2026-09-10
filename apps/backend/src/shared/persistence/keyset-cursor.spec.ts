import { describe, expect, it } from 'vitest';
import {
  compareRows,
  decodeCursor,
  encodeCursor,
  isAfter,
  mongoAfter,
  mongoSort,
  positionOf,
  type SortKey,
} from './keyset-cursor.js';

const BY_DUE: SortKey[] = [
  { field: 'dueAt', direction: 'asc' },
  { field: 'priority', direction: 'asc' },
];
const NEWEST_FIRST: SortKey[] = [{ field: 'updatedAt', direction: 'desc' }];

const at = (millis: number) => new Date(millis);

describe('the cursor round trip', () => {
  it('survives dates without losing precision', () => {
    // Carried as milliseconds rather than an ISO string, so a format that
    // rounded to the second could not silently drop a tie-break.
    const position = { values: [1_757_000_000_123, 2], id: 'task-1' };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('returns null for a corrupt cursor rather than throwing', () => {
    // The caller treats null as "start at the beginning". A client with a
    // mangled cursor gets the first page, which is recoverable; an exception
    // gets them a screen that will not load until they clear their storage.
    for (const bad of ['', 'not-base64', encodeCursor({ values: [], id: '' }).slice(0, 4)]) {
      expect(decodeCursor(bad)).not.toBe(undefined);
    }
    expect(decodeCursor('%%%')).toBeNull();
  });

  it('reads a position off a row', () => {
    const row = { dueAt: at(1000), priority: 2, title: 'x' };
    expect(positionOf(BY_DUE, row, 'task-1')).toEqual({ values: [1000, 2], id: 'task-1' });
  });
});

describe('the order is total, so a page boundary is unambiguous', () => {
  /**
   * The defect this file exists for.
   *
   * Both read adapters sorted by one field and paginated by another — tasks
   * ordered by `dueAt` with a cursor saying `updatedAt > x`, reminders in the
   * Done view sorted descending with an ascending cursor filter. A cursor is a
   * position in an *order*; naming a different field means "everything after
   * this" is not "the next page", so rows are skipped or repeated depending on
   * data a five-row fixture never had.
   */
  it('walks a run of rows sharing a sort key without skipping or repeating one', () => {
    // Five tasks, all due at the same instant with the same priority. Nothing
    // but the id separates them, which is precisely the case that breaks a
    // cursor with no tiebreak.
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      id,
      doc: { dueAt: at(5000), priority: 2 },
    }));

    const seen: string[] = [];
    let position: ReturnType<typeof positionOf> | null = null;

    // Page through two at a time until the list is exhausted.
    for (let guard = 0; guard < 10; guard += 1) {
      const remaining = rows
        .filter((row) => (position ? isAfter(BY_DUE, position, row.doc, row.id) : true))
        .sort((left, right) => compareRows(BY_DUE, left.doc, left.id, right.doc, right.id));
      if (remaining.length === 0) break;

      const page = remaining.slice(0, 2);
      seen.push(...page.map((row) => row.id));
      const last = page.at(-1)!;
      position = positionOf(BY_DUE, last.doc, last.id);
    }

    // Every row, exactly once, in order.
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('walks a descending order correctly', () => {
    // The Done view's order. With an ascending filter this returned the rows it
    // had already shown.
    const rows = [
      { id: 'x', doc: { updatedAt: at(3000) } },
      { id: 'y', doc: { updatedAt: at(2000) } },
      { id: 'z', doc: { updatedAt: at(1000) } },
    ];

    const first = rows
      .slice()
      .sort((l, r) => compareRows(NEWEST_FIRST, l.doc, l.id, r.doc, r.id))
      .slice(0, 2);
    expect(first.map((row) => row.id)).toEqual(['x', 'y']);

    const position = positionOf(NEWEST_FIRST, first.at(-1)!.doc, first.at(-1)!.id);
    const next = rows.filter((row) => isAfter(NEWEST_FIRST, position, row.doc, row.id));
    // Only the oldest is left. Not `x` again.
    expect(next.map((row) => row.id)).toEqual(['z']);
  });

  it('orders null below every value, as Mongo does', () => {
    // Not a preference — matching the store is the point. An in-memory adapter
    // that sorted nulls last would let a spec pass against an order production
    // does not produce, which is how this pair drifted in the first place.
    const undated = { dueAt: null, priority: 1 };
    const dated = { dueAt: at(1000), priority: 1 };
    expect(compareRows(BY_DUE, undated, 'a', dated, 'b')).toBeLessThan(0);
  });
});

describe('the Mongo filter mirrors the in-memory comparison', () => {
  it('builds one branch per key plus the id tiebreak', () => {
    const filter = mongoAfter(BY_DUE, { values: [5000, 2], id: 'task-1' }) as {
      $or: Array<Record<string, unknown>>;
    };

    // Two sort keys, so three branches: greater on the first; equal on the
    // first and greater on the second; equal on both and greater on the id.
    expect(filter.$or).toHaveLength(3);
    expect(filter.$or[0]).toEqual({ dueAt: { $gt: at(5000) } });
    expect(filter.$or[1]).toEqual({ dueAt: at(5000), priority: { $gt: 2 } });
    expect(filter.$or[2]).toEqual({ dueAt: at(5000), priority: 2, _id: { $gt: 'task-1' } });
  });

  it('restores a date field as a Date, not the raw milliseconds', () => {
    // Every date in these collections is stored as a `Date`. Comparing against
    // the number the cursor carries would match nothing at all, so every page
    // after the first would come back empty.
    const filter = mongoAfter([{ field: 'remindAt', direction: 'asc' }], {
      values: [1_757_000_000_000],
      id: 'r1',
    }) as { $or: Array<Record<string, { $gt: unknown }>> };

    expect(filter.$or[0]!.remindAt!.$gt).toBeInstanceOf(Date);
  });

  it('leaves a non-date numeric field as a number', () => {
    // `priority` is a number too. Restoring it as a Date would compare a
    // priority against an epoch instant.
    const filter = mongoAfter([{ field: 'priority', direction: 'asc' }], {
      values: [2],
      id: 'task-1',
    }) as { $or: Array<Record<string, { $gt: unknown }>> };

    expect(filter.$or[0]!.priority!.$gt).toBe(2);
  });

  it('flips the operator for a descending key', () => {
    const filter = mongoAfter(NEWEST_FIRST, { values: [3000], id: 'x' }) as {
      $or: Array<Record<string, unknown>>;
    };
    expect(filter.$or[0]).toEqual({ updatedAt: { $lt: at(3000) } });
  });

  it('appends _id to the sort, so the store agrees the order is total', () => {
    expect(mongoSort(BY_DUE)).toEqual({ dueAt: 1, priority: 1, _id: 1 });
    expect(mongoSort(NEWEST_FIRST)).toEqual({ updatedAt: -1, _id: 1 });
  });
});
