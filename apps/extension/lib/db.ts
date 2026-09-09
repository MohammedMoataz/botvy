import Dexie, { type EntityTable } from 'dexie';

/**
 * The panel re-mounts every time it is closed, so anything that must survive
 * lives here (entities) or in chrome.storage (tokens, settings) — never in
 * React state alone.
 */
export interface MetaRow {
  key: string;
  value: unknown;
}

export class BotvyDb extends Dexie {
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('botvy');
    this.version(1).stores({ meta: '&key' });
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
