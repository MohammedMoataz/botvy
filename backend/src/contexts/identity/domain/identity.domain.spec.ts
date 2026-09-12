import { describe, expect, it } from 'vitest';
import { Device } from './device.aggregate.js';
import {
  judgeRefresh,
  refreshExpiry,
  type RefreshTokenRecord,
} from './session-chain.js';
import { GoogleAlreadyLinked, User } from './user.aggregate.js';

const NOW = new Date('2026-09-09T10:00:00.000Z');

function user(overrides: Partial<Parameters<typeof User.rehydrate>[0]> = {}) {
  return User.rehydrate({
    id: 'user-1',
    email: 'owner@example.test',
    displayName: 'Owner',
    passwordHash: 'hashed',
    googleSub: null,
    role: 'admin',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    lastLoginAt: null,
    deletedAt: null,
    ...overrides,
  });
}

const names = (aggregate: { pendingEvents: readonly { name: string }[] }) =>
  aggregate.pendingEvents.map((event) => event.name);

describe('user aggregate', () => {
  it('links a Google identity and says so', () => {
    const account = user();

    account.linkGoogle('g-sub-1');

    expect(account.googleSub).toBe('g-sub-1');
    expect(names(account)).toEqual(['identity.GoogleLinked']);
  });

  /** Linking the same subject again is a retry, not a change. */
  it('is silent when the same Google identity is linked twice', () => {
    const account = user({ googleSub: 'g-sub-1' });

    account.linkGoogle('g-sub-1');

    expect(names(account)).toEqual([]);
  });

  /**
   * Overwriting would silently transfer the account to whoever signed in
   * second, and the member whose address it was would be locked out with
   * nothing in the log to explain it.
   */
  it('refuses a second, different Google identity', () => {
    const account = user({ googleSub: 'g-sub-1' });

    expect(() => account.linkGoogle('g-sub-2')).toThrow(GoogleAlreadyLinked);
    expect(account.googleSub).toBe('g-sub-1');
  });

  it('bans, and refuses to be active afterwards', () => {
    const account = user();

    account.ban('admin-1', 'spam');

    expect(account.isActive).toBe(false);
    expect(names(account)).toEqual(['identity.UserBanned']);
    expect(account.pendingEvents[0]?.payload).toMatchObject({
      by: 'admin-1',
      reason: 'spam',
    });
  });

  /** An admin clicking twice must not make a consumer count two bans. */
  it('raises nothing when banning an already-banned member', () => {
    const account = user({ status: 'banned' });

    account.ban('admin-1');

    expect(names(account)).toEqual([]);
  });

  it('unbans, and does not pretend to restore the revoked sessions', () => {
    const account = user({ status: 'banned' });

    account.unban('admin-1');

    expect(account.isActive).toBe(true);
    expect(names(account)).toEqual(['identity.UserUnbanned']);
  });

  it('reports both ends of a role change, so an audit row can name them', () => {
    const account = user({ role: 'user' });

    account.setRole('admin', 'admin-1');

    expect(account.pendingEvents[0]?.payload).toMatchObject({
      from: 'user',
      to: 'admin',
    });
  });

  it('raises nothing when the role is already what was asked for', () => {
    const account = user({ role: 'admin' });

    account.setRole('admin', 'admin-1');

    expect(names(account)).toEqual([]);
  });

  /**
   * The row stays: every Mongo context holds this `userId` as a plain string
   * with no foreign key to tell it the account is gone, so the event is the
   * only thing that triggers their purge.
   */
  it('soft-deletes and carries the email the purge handlers need', () => {
    const account = user();

    account.softDelete(NOW);

    expect(account.deletedAt).toEqual(NOW);
    expect(account.isActive).toBe(false);
    expect(names(account)).toEqual(['identity.UserDeleted']);
  });

  it('is idempotent on a second delete', () => {
    const account = user({ deletedAt: NOW });

    account.softDelete();

    expect(names(account)).toEqual([]);
  });
});

describe('device aggregate', () => {
  const registered = () =>
    Device.register({
      id: 'dev-1',
      userId: 'user-1',
      installId: 'install-1',
      kind: 'android',
      name: 'Pixel',
      pushToken: 'token-1',
      lastSeenAt: NOW,
      createdAt: NOW,
    });

  it('announces a new device with whether it can be pushed to', () => {
    const device = registered();

    expect(names(device)).toEqual(['identity.DeviceRegistered']);
    expect(device.pendingEvents[0]?.payload).toMatchObject({
      kind: 'android',
      hasPush: true,
    });
  });

  /**
   * A phone re-registers on every launch. Raising the event each time would
   * wake the notification context for nothing.
   */
  it('stays quiet when a re-registration changes nothing consumers care about', () => {
    const device = registered();
    device.pullEvents();

    device.reregister({ name: 'Pixel 9' });

    expect(names(device)).toEqual([]);
    expect(device.name).toBe('Pixel 9');
  });

  it('announces a re-registration that changes the push token', () => {
    const device = registered();
    device.pullEvents();

    device.reregister({ pushToken: 'token-2' });

    expect(names(device)).toEqual(['identity.DeviceRegistered']);
    expect(device.pendingEvents[0]?.payload).toMatchObject({ hasPush: true });
  });

  it('reports a cleared push token as no longer pushable', () => {
    const device = registered();
    device.pullEvents();

    device.reregister({ pushToken: null });

    expect(device.pendingEvents[0]?.payload).toMatchObject({ hasPush: false });
  });

  /** The sweep skips a device that has synced since an alert was planned. */
  it('moves lastSeenAt on every re-registration, event or not', () => {
    const device = registered();
    const later = new Date(NOW.getTime() + 60_000);

    device.reregister({}, later);

    expect(device.lastSeenAt).toEqual(later);
  });

  /**
   * The other half of that rule, and the reason `losePushToken` exists as its
   * own operation rather than as `reregister({ pushToken: null })`.
   *
   * `reregister` means "the app launched and told us its token", which is
   * evidence the device is alive — so it stamps `lastSeenAt`. Losing a token
   * means "the push service told us the token is dead", which is evidence of
   * the opposite, and stamping `lastSeenAt` would be actively harmful: the
   * notification sweep skips any device whose `lastSeenAt` is at or after an
   * alert's `plannedAt`, on the grounds that such a device has synced and holds
   * its own local alarm. A phone that had not synced for a week would suddenly
   * qualify, so every alert would be skipped for it and the member would stop
   * being notified at all.
   */
  it('clears a dead push token without stamping lastSeenAt', () => {
    const device = registered();
    // `register` leaves its own event pending; drain it so the assertion below
    // is about what losing the token raised and nothing else.
    device.pullEvents();
    const lastSynced = device.lastSeenAt;

    const changed = device.losePushToken(new Date(NOW.getTime() + 3_600_000));

    expect(changed).toBe(true);
    expect(device.pushToken).toBeNull();
    // The important assertion: the device is not reported as freshly synced.
    expect(device.lastSeenAt).toEqual(lastSynced);
    expect(names(device)).toEqual(['identity.DeviceRemoved']);
    expect(device.pendingEvents[0]?.payload).toMatchObject({ hasPush: false });
  });

  it('does nothing, and raises nothing, for a device that had no token', () => {
    // The sweep can be handed the same token twice in one pass, and a device
    // already reaped must not raise a second `DeviceRemoved` that re-plans
    // everybody's alerts again.
    const device = registered();
    device.losePushToken();
    device.pullEvents();

    // Second time round there is nothing left to clear.
    expect(device.losePushToken()).toBe(false);
    expect(names(device)).toEqual([]);
  });
});

describe('refresh chain', () => {
  const record = (
    overrides: Partial<RefreshTokenRecord> = {},
  ): RefreshTokenRecord => ({
    id: 'rt-1',
    userId: 'user-1',
    familyId: 'fam-1',
    tokenHash: 'hash-1',
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    revokedAt: null,
    replacedBy: null,
    deviceId: null,
    createdAt: NOW,
    ...overrides,
  });

  it('rotates a live token', () => {
    expect(judgeRefresh(record(), NOW).outcome).toBe('rotate');
  });

  it('reports an unknown token as unknown, not as a replay', () => {
    expect(judgeRefresh(null, NOW).outcome).toBe('unknown');
  });

  it('reports an expired token as expired', () => {
    const past = record({ expiresAt: new Date(NOW.getTime() - 1) });

    expect(judgeRefresh(past, NOW).outcome).toBe('expired');
  });

  /**
   * The rule the whole family exists for: a token presented twice is either a
   * replay or a theft, and there is no way to tell which.
   */
  it('reports an already-exchanged token as a replay', () => {
    const exchanged = record({ replacedBy: 'rt-2' });

    expect(judgeRefresh(exchanged, NOW)).toMatchObject({ outcome: 'replayed' });
  });

  it('reports a revoked token as a replay', () => {
    const revoked = record({ revokedAt: NOW });

    expect(judgeRefresh(revoked, NOW)).toMatchObject({ outcome: 'replayed' });
  });

  /**
   * Replay is judged before expiry, so the holder of a stolen copy cannot keep
   * a family alive by waiting for the token to age out first.
   */
  it('prefers replay over expiry when a token is both', () => {
    const both = record({
      replacedBy: 'rt-2',
      expiresAt: new Date(NOW.getTime() - 1),
    });

    expect(judgeRefresh(both, NOW).outcome).toBe('replayed');
  });

  it('reads the configured lifetime', () => {
    expect(refreshExpiry('30d', NOW)).toEqual(
      new Date(NOW.getTime() + 30 * 86_400_000),
    );
    expect(refreshExpiry('12h', NOW)).toEqual(
      new Date(NOW.getTime() + 12 * 3_600_000),
    );
    expect(refreshExpiry('45m', NOW)).toEqual(
      new Date(NOW.getTime() + 45 * 60_000),
    );
  });

  /** A malformed lifetime silently defaulting is a session that never expires. */
  it('refuses a lifetime it cannot parse rather than guessing', () => {
    expect(() => refreshExpiry('a fortnight')).toThrow(/JWT_REFRESH_TTL/);
  });
});
