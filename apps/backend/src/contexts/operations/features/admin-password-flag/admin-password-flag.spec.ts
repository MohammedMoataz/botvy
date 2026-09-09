import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../../../shared/cqrs/ids.js';
import { InMemorySettingsStore } from '../../../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { InMemoryAuditAdapter } from '../../../../shared/audit/in-memory-audit.adapter.js';
import { ADMIN_PASSWORD_FLAG, AdminPasswordFlagHandler } from './admin-password-flag.handler.js';

const OWNER = { kind: 'user', id: 'admin-1', role: 'admin' } as const;

const passwordChanged = () => ({
  eventId: newId(),
  name: 'identity.PasswordChanged',
  context: 'identity',
  aggregate: { type: 'user', id: 'user-1' },
  userId: 'user-1',
  occurredAt: new Date(),
  payload: { bySelf: true },
  schemaVersion: 1,
});

describe('default administrator password flag', () => {
  let store: InMemorySettingsStore;
  let audit: InMemoryAuditAdapter;
  let settings: SettingsService;
  let handler: AdminPasswordFlagHandler;

  beforeEach(() => {
    store = new InMemorySettingsStore();
    audit = new InMemoryAuditAdapter();
    settings = new SettingsService(store, audit);
    handler = new AdminPasswordFlagHandler(settings);
  });

  it('records what the boot check found', async () => {
    await handler.record(true);

    expect(await settings.get(ADMIN_PASSWORD_FLAG)).toBe(true);
  });

  it('records a changed password as no longer default', async () => {
    await handler.record(true);

    await handler.record(false);

    expect(await settings.get(ADMIN_PASSWORD_FLAG)).toBe(false);
  });

  /**
   * The reason the event exists rather than a re-check on a timer: the banner
   * disappears the moment the Owner fixes it, which is the only moment they
   * are looking at it.
   */
  it('clears the flag when a password changes', async () => {
    await handler.record(true);

    await handler.onPasswordChanged(passwordChanged());

    expect(await settings.get(ADMIN_PASSWORD_FLAG)).toBe(false);
  });

  /**
   * `readOnly` means an operator may not edit it. It has never meant nothing
   * may write it — this key is an observation, and without a system door it
   * would describe a state nobody could record.
   */
  it('writes a key an operator is refused', async () => {
    await expect(settings.set(ADMIN_PASSWORD_FLAG, false, OWNER)).rejects.toThrow();

    await expect(handler.record(false)).resolves.toBeUndefined();
  });

  it('names the system in the audit trail, not a person', async () => {
    await handler.record(true);

    const row = audit.entries.at(-1);
    expect(row?.actor).toMatchObject({ kind: 'service', id: 'system' });
    expect(row?.meta).toMatchObject({ outcome: 'applied_by_system' });
  });

  /**
   * This runs at every boot. An audit row per restart would bury the changes
   * that mattered under a decade of "still true".
   */
  it('records nothing when the value has not moved', async () => {
    await handler.record(true);
    const after = audit.entries.length;

    await handler.record(true);

    expect(audit.entries.length).toBe(after);
  });

  it('still writes when the value moves back', async () => {
    await handler.record(false);
    const after = audit.entries.length;

    await handler.record(true);

    expect(audit.entries.length).toBe(after + 1);
    expect(await settings.get(ADMIN_PASSWORD_FLAG)).toBe(true);
  });
});
