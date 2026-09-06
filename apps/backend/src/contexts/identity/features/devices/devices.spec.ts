import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../../../shared/cqrs/ids.js';
import { User } from '../../domain/user.aggregate.js';
import {
  InMemoryDeviceRepository,
  InMemoryUserRepository,
} from '../../infrastructure/in-memory-identity.repositories.js';
import { DevicesQueryHandler } from './devices.query.js';

describe('devices query', () => {
  let devices: InMemoryDeviceRepository;
  let users: InMemoryUserRepository;
  let handler: DevicesQueryHandler;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
    users = new InMemoryUserRepository();
    handler = new DevicesQueryHandler(devices, users);
    devices.rows.push(
      {
        id: 'dev-1',
        userId: 'user-1',
        installId: 'i-1',
        kind: 'android',
        name: 'Pixel',
        pushToken: 'token-1',
        lastSeenAt: new Date('2026-09-07T09:00:00Z'),
      },
      {
        id: 'dev-2',
        userId: 'user-2',
        installId: 'i-2',
        kind: 'chrome_extension',
        name: null,
        pushToken: null,
        lastSeenAt: null,
      },
    );
  });

  it('answers for one member', async () => {
    expect(await handler.forUser('user-1')).toEqual([
      {
        userId: 'user-1',
        deviceId: 'dev-1',
        kind: 'android',
        pushToken: 'token-1',
        lastSeenAt: new Date('2026-09-07T09:00:00Z'),
      },
    ]);
  });

  /** Batched, because the sweep asks about many members at once. */
  it('answers for several members in one call', async () => {
    const views = await handler.forUsers(['user-1', 'user-2']);

    expect(views.map((view) => view.deviceId).sort()).toEqual(['dev-1', 'dev-2']);
  });

  it('answers nothing for an empty list rather than everything', async () => {
    expect(await handler.forUsers([])).toEqual([]);
  });

  it('answers nothing for a member with no devices', async () => {
    expect(await handler.forUser('user-3')).toEqual([]);
  });

  /**
   * A device the extension registered has no push token, and the alert path
   * has to be able to tell that apart from a phone that does.
   */
  it('reports a missing push token as null rather than omitting the device', async () => {
    const [view] = await handler.forUser('user-2');

    expect(view).toMatchObject({ kind: 'chrome_extension', pushToken: null });
  });

  it('reports whether an account may still be acted on', async () => {
    const now = new Date();
    const active = User.register({
      id: newId(),
      email: 'a@b.test',
      displayName: null,
      passwordHash: 'x',
      googleSub: null,
      role: 'user',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await users.save(active);

    expect(await handler.isActive(active.id)).toBe(true);
    expect(await handler.isActive('nobody')).toBe(false);
  });

  it('reports a banned account as not actionable', async () => {
    const now = new Date();
    const banned = User.register({
      id: newId(),
      email: 'banned@b.test',
      displayName: null,
      passwordHash: 'x',
      googleSub: null,
      role: 'user',
      status: 'banned',
      createdAt: now,
      updatedAt: now,
    });
    await users.save(banned);

    expect(await handler.isActive(banned.id)).toBe(false);
  });
});
