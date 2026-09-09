import { Injectable } from '@nestjs/common';
import { SettingsStore, type StoredSetting } from './settings.store.js';

/** The store the settings specs bind, and the one a unit test of any consumer uses. */
@Injectable()
export class InMemorySettingsStore extends SettingsStore {
  readonly rows = new Map<string, StoredSetting>();

  async get(key: string): Promise<StoredSetting | null> {
    return this.rows.get(key) ?? null;
  }

  async getMany(keys: string[]): Promise<StoredSetting[]> {
    return keys.map((key) => this.rows.get(key)).filter((row): row is StoredSetting => Boolean(row));
  }

  async set(key: string, value: unknown, updatedBy: string | null): Promise<StoredSetting> {
    const row: StoredSetting = { key, value, updatedAt: new Date(), updatedBy };
    this.rows.set(key, row);
    return row;
  }
}
