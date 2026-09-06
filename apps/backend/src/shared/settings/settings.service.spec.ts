import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '../auth/principal.js';
import { AuditPort, type AuditEntry } from '../../contexts/operations/domain/audit.port.js';
import { InMemorySettingsStore } from './in-memory-settings.store.js';
import {
  InvalidSettingError,
  SETTINGS_CACHE_TTL_MS,
  SettingReadOnlyError,
  SettingsService,
  UnknownSettingError,
  type SettingsEventSink,
} from './settings.service.js';

class RecordingAudit extends AuditPort {
  readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

const owner: Principal = { kind: 'user', id: 'owner-1', role: 'admin' };

describe('SettingsService', () => {
  let store: InMemorySettingsStore;
  let audit: RecordingAudit;
  let events: SettingsEventSink & { published: Array<{ name: string; payload: unknown }> };
  let settings: SettingsService;

  beforeEach(() => {
    store = new InMemorySettingsStore();
    audit = new RecordingAudit();
    const published: Array<{ name: string; payload: unknown }> = [];
    events = {
      published,
      async publish(name, payload) {
        published.push({ name, payload });
      },
    };
    settings = new SettingsService(store, audit, events);
  });

  it('returns the registry default for a key nobody has set', async () => {
    expect(await settings.get('rhythm.draftTopN')).toBe(5);
    expect(await settings.get('ops.staleAfterMinutes')).toBe(15);
    expect(store.rows.size).toBe(0);
  });

  it('returns a stored value once it is set, and announces the change', async () => {
    await settings.set('rhythm.draftTopN', 3, owner);

    expect(await settings.get('rhythm.draftTopN')).toBe(3);
    expect(events.published).toEqual([
      { name: 'operations.SettingChanged', payload: { key: 'rhythm.draftTopN' } },
    ]);
  });

  it('refuses a value the key’s own schema rejects, and stores nothing', async () => {
    await expect(settings.set('rhythm.draftTopN', 0, owner)).rejects.toBeInstanceOf(
      InvalidSettingError,
    );

    expect(store.rows.size).toBe(0);
    expect(await settings.get('rhythm.draftTopN')).toBe(5);
  });

  it('refuses a key nobody registered rather than storing a stray value', async () => {
    await expect(settings.set('defaults.invented', 'x', owner)).rejects.toBeInstanceOf(
      UnknownSettingError,
    );
  });

  /**
   * The rule the whole read-only flag exists for. Refusing writes by key prefix
   * also froze `ops.staleAfterMinutes`, which is exactly the number an operator
   * retunes when a job legitimately runs long.
   */
  it('refuses a read-only key by its flag', async () => {
    await expect(settings.set('ops.lastBackupAt', '2026-09-06T03:00:00Z', owner)).rejects.toBeInstanceOf(
      SettingReadOnlyError,
    );
  });

  it('accepts a key that shares the ops prefix but not the flag', async () => {
    await expect(settings.set('ops.staleAfterMinutes', 30, owner)).resolves.toBe(30);
    expect(await settings.get('ops.staleAfterMinutes')).toBe(30);
  });

  /**
   * A trail that records only successes cannot answer "who tried to change this
   * and was turned away", which is the question an Owner actually asks.
   */
  it('leaves an audit row for a refused write as well as an applied one', async () => {
    await settings.set('rhythm.draftTopN', 7, owner);
    await settings.set('ops.lastBackupAt', 'x', owner).catch(() => undefined);
    await settings.set('rhythm.draftTopN', 0, owner).catch(() => undefined);

    expect(audit.entries).toHaveLength(3);
    expect(audit.entries.map((entry) => entry.meta?.outcome)).toEqual([
      'applied',
      'refused_read_only',
      'refused_invalid',
    ]);
    for (const entry of audit.entries) {
      expect(entry.action).toBe('settings.patch');
      expect(entry.actor).toEqual(owner);
    }
  });

  it('serves a cached value without going back to the store', async () => {
    await settings.set('chat.historyLimit', 40, owner);
    const spy = vi.spyOn(store, 'get');

    await settings.get('chat.historyLimit');
    await settings.get('chat.historyLimit');

    expect(spy).not.toHaveBeenCalled();
  });

  it('re-reads once the entry has aged past the cache window', async () => {
    vi.useFakeTimers();
    try {
      await settings.get('chat.historyLimit');
      await store.set('chat.historyLimit', 99, 'someone-else');

      // Still the cached value: the other process has not told us yet.
      expect(await settings.get('chat.historyLimit')).toBe(20);

      vi.advanceTimersByTime(SETTINGS_CACHE_TTL_MS + 1);
      expect(await settings.get('chat.historyLimit')).toBe(99);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a cached value when the change event arrives', async () => {
    await settings.get('chat.historyLimit');
    await store.set('chat.historyLimit', 99, 'someone-else');

    settings.invalidate('chat.historyLimit');

    expect(await settings.get('chat.historyLimit')).toBe(99);
  });

  it('describes the registry with current values and the flag, for the admin screen', async () => {
    await settings.set('rhythm.draftTopN', 8, owner);
    const described = await settings.describe();

    const draftTopN = described.find((row) => row.key === 'rhythm.draftTopN');
    expect(draftTopN).toMatchObject({ value: 8, default: 5, readOnly: false });

    const lastBackup = described.find((row) => row.key === 'ops.lastBackupAt');
    expect(lastBackup).toMatchObject({ value: null, readOnly: true });
  });
});
