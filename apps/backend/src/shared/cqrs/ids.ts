import { v7 as uuidv7, validate as uuidValidate } from 'uuid';

/**
 * UUIDv7 for anything the phone can create while offline. The client mints the
 * id before the server ever sees the row, which is what makes a retried create
 * a no-op rather than a duplicate. Server-only collections use ObjectId.
 *
 * v7 rather than v4 because it sorts by creation time, so an index on `_id`
 * doubles as a chronological one.
 */
export function newId(): string {
  return uuidv7();
}

export function isUuid(value: string): boolean {
  return uuidValidate(value);
}
