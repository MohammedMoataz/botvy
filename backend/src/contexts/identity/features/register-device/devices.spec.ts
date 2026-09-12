import { beforeEach, describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import { User } from '../../domain/user.aggregate.js';
import {
  InMemoryDeviceRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../../infrastructure/in-memory-identity.repositories.js';
import {
  AccountNotFound,
  DeleteAccountHandler,
  PasswordRequired,
} from '../delete-account/delete-account.handler.js';
import { LogoutHandler } from '../logout/logout.handler.js';
import { hashRefreshToken } from '../refresh/refresh.handler.js';
import {
  DeviceNotFound,
  RegisterDeviceHandler,
} from './register-device.handler.js';

import { InMemoryUnitOfWork } from '../../../../shared/persistence/memory/in-memory-unit-of-work.js';

let uow: InMemoryUnitOfWork;

const NOW = new Date('2026-09-09T10:00:00.000Z');

const hasher: PasswordHasher = {
  async hash(plain) {
    return `hashed:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `hashed:${plain}`;
  },
};

const member = (
  id = 'user-1',
  passwordHash: string | null = 'hashed:secret-enough',
) =>
  User.rehydrate({
    id,
    email: `${id}@example.test`,
    displayName: null,
    passwordHash,
    googleSub: null,
    role: 'user',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    lastLoginAt: null,
    deletedAt: null,
  });

describe('register device', () => {
  let devices: InMemoryDeviceRepository;
  let handler: RegisterDeviceHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    devices = new InMemoryDeviceRepository(uow);
    handler = new RegisterDeviceHandler(uow, devices);
  });

  const android = {
    userId: 'user-1',
    installId: 'install-1',
    kind: 'android',
  } as const;

  it('creates the device and says it was new', async () => {
    const result = await handler.handle(android, NOW);

    expect(result.created).toBe(true);
    expect(devices.rows).toHaveLength(1);
    expect(devices.events.map((event) => event.name)).toEqual([
      'identity.DeviceRegistered',
    ]);
  });

  /**
   * The same call arriving twice is the normal case: a phone registers on every
   * launch and has no way to know whether the first attempt reached the server.
   */
  it('is idempotent on the install id', async () => {
    await handler.handle(android, NOW);
    const second = await handler.handle(
      android,
      new Date(NOW.getTime() + 60_000),
    );

    expect(second.created).toBe(false);
    expect(devices.rows).toHaveLength(1);
  });

  it('moves lastSeenAt forward on a re-registration', async () => {
    await handler.handle(android, NOW);
    const later = new Date(NOW.getTime() + 60_000);

    await handler.handle(android, later);

    expect(devices.rows[0]?.lastSeenAt).toEqual(later);
  });

  /** Raising it again would wake the notification context for nothing. */
  it('raises the event once when nothing consumers care about changed', async () => {
    await handler.handle(android, NOW);
    await handler.handle({ ...android, name: 'Pixel 9' }, NOW);

    expect(devices.events).toHaveLength(1);
  });

  it('raises it again when the push token changes', async () => {
    await handler.handle(android, NOW);
    await handler.handle({ ...android, pushToken: 'fcm-1' }, NOW);

    expect(devices.events).toHaveLength(2);
  });

  /**
   * The handset was handed over, or a second account signed in on it. The row
   * moves rather than duplicating — the previous owner's alerts must stop going
   * to a phone that is not theirs.
   */
  it('moves an install id that now belongs to a different member', async () => {
    await handler.handle(android, NOW);

    const result = await handler.handle({ ...android, userId: 'user-2' }, NOW);

    expect(result.created).toBe(true);
    expect(devices.rows).toHaveLength(1);
    expect(devices.rows[0]?.userId).toBe('user-2');
    expect(devices.events.map((event) => event.name)).toEqual([
      'identity.DeviceRegistered',
      'identity.DeviceRemoved',
      'identity.DeviceRegistered',
    ]);
  });

  it('removes a device the member owns', async () => {
    const created = await handler.handle(android, NOW);

    await handler.remove('user-1', created.deviceId);

    expect(devices.rows).toHaveLength(0);
  });

  /** A 404 rather than a 403: whether it exists is not this caller's business. */
  it("refuses to remove another member's device, as though it were not there", async () => {
    const created = await handler.handle(android, NOW);

    await expect(
      handler.remove('user-2', created.deviceId),
    ).rejects.toBeInstanceOf(DeviceNotFound);
    expect(devices.rows).toHaveLength(1);
  });
});

describe('logout', () => {
  let tokens: InMemoryRefreshTokenRepository;
  let handler: LogoutHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    tokens = new InMemoryRefreshTokenRepository();
    handler = new LogoutHandler(tokens);
  });

  const issue = async (familyId: string, token: string, userId = 'user-1') =>
    tokens.issue({
      userId,
      familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + 86_400_000),
      deviceId: null,
    });

  /** Signing out a phone must leave the tablet signed in. */
  it('revokes one session and leaves the others', async () => {
    await issue('fam-1', 'phone-token');
    await issue('fam-2', 'tablet-token');

    const result = await handler.handle('phone-token');

    expect(result.signedOut).toBe(true);
    expect(tokens.rows.filter((row) => row.revokedAt !== null)).toHaveLength(1);
  });

  /**
   * An error for an unknown token would say something about which tokens
   * exist, and the client is signing out either way.
   */
  it('is quiet about a token it does not recognise', async () => {
    await expect(handler.handle('never-issued')).resolves.toEqual({
      signedOut: false,
    });
  });

  it('ends every session on request', async () => {
    await issue('fam-1', 'a');
    await issue('fam-2', 'b');
    await issue('fam-3', 'c', 'someone-else');

    const result = await handler.everywhere('user-1');

    expect(result.sessionsEnded).toBe(2);
    expect(
      tokens.rows.find((row) => row.userId === 'someone-else')?.revokedAt,
    ).toBeNull();
  });
});

describe('delete account', () => {
  let users: InMemoryUserRepository;
  let tokens: InMemoryRefreshTokenRepository;
  let handler: DeleteAccountHandler;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    tokens = new InMemoryRefreshTokenRepository();
    handler = new DeleteAccountHandler(uow, users, hasher, tokens);
    await users.save(member());
  });

  /**
   * Soft on this side. Every Mongo context holds this `userId` as a plain
   * string with no foreign key to tell it the account is gone, and
   * `identity.UserDeleted` is what triggers their purge.
   */
  it('soft-deletes and raises the event the purge handlers read', async () => {
    await handler.handle({ userId: 'user-1', password: 'secret-enough' });

    const stored = await users.findById('user-1', 'user-1');
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    expect(users.events.map((event) => event.name)).toContain(
      'identity.UserDeleted',
    );
  });

  it('ends every session immediately rather than waiting for the purge', async () => {
    await tokens.issue({
      userId: 'user-1',
      familyId: 'fam-1',
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 86_400_000),
      deviceId: null,
    });

    await handler.handle({ userId: 'user-1', password: 'secret-enough' });

    expect(tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  /**
   * The one irreversible action a stolen access token should not be able to
   * take on its own.
   */
  it('requires the password, and refuses without it', async () => {
    await expect(handler.handle({ userId: 'user-1' })).rejects.toBeInstanceOf(
      PasswordRequired,
    );
  });

  it('refuses a wrong password', async () => {
    await expect(
      handler.handle({ userId: 'user-1', password: 'not-it' }),
    ).rejects.toBeInstanceOf(PasswordRequired);
  });

  /** A Google-only account has no password to ask for. */
  it('deletes an account that has no password without one', async () => {
    await users.save(member('user-2', null));

    await expect(handler.handle({ userId: 'user-2' })).resolves.toEqual({
      deleted: true,
    });
  });

  it('refuses a second delete rather than raising the event twice', async () => {
    await handler.handle({ userId: 'user-1', password: 'secret-enough' });

    await expect(
      handler.handle({ userId: 'user-1', password: 'secret-enough' }),
    ).rejects.toBeInstanceOf(AccountNotFound);
  });
});
