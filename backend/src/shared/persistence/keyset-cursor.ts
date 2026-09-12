/**
 * Keyset pagination, shared because two contexts had the same bug in it and a
 * third would have made three.
 *
 * ## What was wrong
 *
 * Both read adapters sorted by one field and paginated by another: tasks came
 * back ordered by `dueAt` while the cursor said `updatedAt > x`, and reminders
 * in the Done view were sorted `updatedAt: -1` while the cursor filtered
 * `updatedAt > x` — a descending sort with an ascending filter.
 *
 * A cursor is a *position in an order*. If it names a different field from the
 * one the rows are ordered by, "everything after this value" is not "the next
 * page": rows are skipped, rows repeat, and which ones depends on data the test
 * fixture did not happen to have. It is the sort of defect that survives a
 * green suite because a five-row fixture has no boundary to fall over.
 *
 * ## What this does instead
 *
 * The cursor carries the *sort key values* of the last row on the page, plus
 * that row's id. The next page is everything strictly after that position in
 * exactly the declared order, with the id as the final tiebreak — so two rows
 * sharing a due date to the millisecond still have a total order, and neither
 * is lost at a page boundary.
 *
 * The id tiebreak is not belt-and-braces. Without it, a page ending on the
 * first of two rows with the same `dueAt` either re-shows the second (if the
 * comparison is `>=`) or drops it (if `>`), and there is no third option.
 *
 * Both adapters share this so the in-memory one used by every handler spec
 * orders rows exactly as Mongo does. A spec that pages against a different
 * order from production is a spec that proves nothing about paging.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortKey {
  field: string;
  direction: SortDirection;
}

/** Where a page ended: the sort values of its last row, and that row's id. */
export interface CursorPosition {
  values: Array<string | number | null>;
  id: string;
}

/**
 * Opaque to the client, and deliberately so: the only correct thing to do with
 * a cursor is hand it back. Base64url of JSON, with dates reduced to
 * milliseconds so the round trip cannot lose precision to a string format.
 */
export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

/**
 * `null` for anything unreadable, and the caller treats that as "start at the
 * beginning" rather than raising. A client sending a corrupt cursor gets the
 * first page, which is recoverable; an error gets them a screen that will not
 * load until they clear their storage.
 */
export function decodeCursor(cursor: string): CursorPosition | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as CursorPosition).values) ||
      typeof (parsed as CursorPosition).id !== 'string'
    ) {
      return null;
    }
    return parsed as CursorPosition;
  } catch {
    return null;
  }
}

/** A sort value in its comparable, serialisable form. */
export function sortValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

/** The position a page ended at, read off its last row. */
export function positionOf(
  keys: SortKey[],
  row: Record<string, unknown>,
  id: string,
): CursorPosition {
  return { values: keys.map((key) => sortValue(row[key.field])), id };
}

/** `{ field: 1 | -1 }` for Mongo, with `_id` appended as the tiebreak. */
export function mongoSort(keys: SortKey[]): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = {};
  for (const key of keys) sort[key.field] = key.direction === 'asc' ? 1 : -1;
  sort._id = 1;
  return sort;
}

/**
 * "Strictly after this position, in this order", as a Mongo filter.
 *
 * The lexicographic form: equal on every key so far and greater on this one.
 * With three keys that is four branches, the last of which is the id tiebreak.
 *
 * `null` is passed through as a value rather than translated. Mongo sorts null
 * below every number and date, and the in-memory comparator below is written to
 * agree with that — matching the store is what matters, not whether null-first
 * is the nicer reading. Where it shows on screen (undated tasks at the top of a
 * label's group) it is a deliberate, documented consequence.
 */
export function mongoAfter(
  keys: SortKey[],
  position: CursorPosition,
): Record<string, unknown> {
  const branches: Array<Record<string, unknown>> = [];

  for (let i = 0; i < keys.length; i += 1) {
    const branch: Record<string, unknown> = {};
    for (let j = 0; j < i; j += 1) {
      branch[keys[j]!.field] = restore(
        position.values[j] ?? null,
        keys[j]!.field,
      );
    }
    const key = keys[i]!;
    branch[key.field] = {
      [key.direction === 'asc' ? '$gt' : '$lt']: restore(
        position.values[i] ?? null,
        key.field,
      ),
    };
    branches.push(branch);
  }

  // Equal on every sort key: the id decides, and it always can, because it is
  // unique.
  const tiebreak: Record<string, unknown> = {};
  for (let j = 0; j < keys.length; j += 1) {
    tiebreak[keys[j]!.field] = restore(
      position.values[j] ?? null,
      keys[j]!.field,
    );
  }
  tiebreak._id = { $gt: position.id };
  branches.push(tiebreak);

  return { $or: branches };
}

/**
 * A cursor value back into what the field holds.
 *
 * Every date field in these collections is stored as a `Date`, and the cursor
 * carries it as milliseconds — so a comparison against the raw number would
 * match nothing at all and every page after the first would come back empty.
 * The field names are the source of truth for which is which, because a
 * timestamp and a priority are both numbers by the time they reach here.
 */
const DATE_FIELDS = new Set([
  'dueAt',
  'completedAt',
  'deletedAt',
  'updatedAt',
  'createdAt',
  'remindAt',
  'snoozedUntil',
  'notifyAt',
  'plannedAt',
]);

function restore(value: string | number | null, field: string): unknown {
  if (value === null) return null;
  if (DATE_FIELDS.has(field) && typeof value === 'number')
    return new Date(value);
  return value;
}

/**
 * The same order, in memory.
 *
 * Null sorts first, which is what Mongo does — see `mongoAfter`. Getting this
 * to agree with the store is the entire point of sharing the file.
 */
export function compareRows(
  keys: SortKey[],
  a: Record<string, unknown>,
  aId: string,
  b: Record<string, unknown>,
  bId: string,
): number {
  for (const key of keys) {
    const left = sortValue(a[key.field]);
    const right = sortValue(b[key.field]);
    const order = compareValues(left, right);
    if (order !== 0) return key.direction === 'asc' ? order : -order;
  }
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/** Strictly after the position, in memory. Mirrors `mongoAfter` exactly. */
export function isAfter(
  keys: SortKey[],
  position: CursorPosition,
  row: Record<string, unknown>,
  id: string,
): boolean {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]!;
    const order = compareValues(
      sortValue(row[key.field]),
      position.values[i] ?? null,
    );
    const directed = key.direction === 'asc' ? order : -order;
    if (directed !== 0) return directed > 0;
  }
  return id > position.id;
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
): number {
  // Null below everything, as Mongo orders it.
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
