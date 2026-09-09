import { beforeEach, describe, expect, it } from 'vitest';
import { JwtSigner } from '../../../../shared/auth/jwt.signer.js';
import { InMemoryAuditAdapter } from '../../../../shared/audit/in-memory-audit.adapter.js';
import { InMemorySettingsStore } from '../../../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import { MIN_PASSWORD_LENGTH } from '../../domain/password-rules.js';
import {
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../../infrastructure/in-memory-identity.repositories.js';
import { RefreshHandler, hashRefreshToken } from '../refresh/refresh.handler.js';
import {
  EmailAlreadyRegistered,
  PasswordTooShort,
  PasswordsDoNotMatch,
  RegisterHandler,
  RegistrationClosed,
} from './register.handler.js';

import { InMemoryUnitOfWork } from '../../../../shared/persistence/memory/in-memory-unit-of-work.js';

let uow: InMemoryUnitOfWork;

const hasher: PasswordHasher = {
  async hash(plain) {
    return `hashed:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `hashed:${plain}`;
  },
};

const env = {
  JWT_ACCESS_SECRET: 'a-secret-long-enough',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

/** Whoever flips the registration switch; the audit row names them. */
const OWNER = { kind: 'user', id: 'admin-1', role: 'admin' } as const;

const good = {
  email: 'member@example.test',
  password: 'a-long-enough-password',
  passwordConfirm: 'a-long-enough-password',
};

describe('register', () => {
  let users: InMemoryUserRepository;
  let settings: SettingsService;
  let handler: RegisterHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    settings = new SettingsService(new InMemorySettingsStore(), new InMemoryAuditAdapter());
    handler = new RegisterHandler(uow, users, hasher, settings);
  });

  it('creates the member and raises the event the other contexts bootstrap from', async () => {
    const result = await handler.handle(good);

    expect(result.email).toBe('member@example.test');
    expect(users.events.map((event) => event.name)).toEqual(['identity.UserRegistered']);
  });

  /**
   * Profile's bootstrap prefers what registration supplied over the registry
   * defaults, and it reads them off this event rather than asking Identity
   * across a store boundary for a value that was in hand at the time.
   */
  it('carries the supplied locale and time zone on the event', async () => {
    await handler.handle({ ...good, locale: 'ar', timezone: 'Africa/Cairo' });

    expect(users.events[0]?.payload).toMatchObject({ locale: 'ar', timezone: 'Africa/Cairo' });
  });

  it('reports absent locale and time zone as null rather than omitting them', async () => {
    await handler.handle(good);

    expect(users.events[0]?.payload).toMatchObject({ locale: null, timezone: null });
  });

  it('normalises the login, so the same address cannot register twice in two cases', async () => {
    await handler.handle({ ...good, email: '  Member@Example.test ' });

    await expect(handler.handle(good)).rejects.toBeInstanceOf(EmailAlreadyRegistered);
  });

  /** The client's own check is for the person who mistyped. This one is for
   * every caller that is not the client. */
  it('refuses a mismatched confirmation', async () => {
    await expect(
      handler.handle({ ...good, passwordConfirm: 'something-else-entirely' }),
    ).rejects.toBeInstanceOf(PasswordsDoNotMatch);
  });

  it('refuses a password below the minimum', async () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);

    await expect(
      handler.handle({ ...good, password: short, passwordConfirm: short }),
    ).rejects.toBeInstanceOf(PasswordTooShort);
  });

  it('creates a member, not an administrator', async () => {
    const result = await handler.handle(good);

    const stored = await users.findById(result.userId, result.userId);
    expect(stored?.role).toBe('user');
  });

  /**
   * A settings key rather than an environment variable, so the Owner closes
   * registration from the portal without a redeploy.
   */
  it('refuses when the Owner has closed registration', async () => {
    await settings.set('auth.registrationOpen', false, OWNER);

    await expect(handler.handle(good)).rejects.toBeInstanceOf(RegistrationClosed);
  });

  /**
   * `SettingsService` caches, and drops its entry when the key is written — so
   * closing registration takes effect on the next attempt rather than at the
   * next restart. This is the test that would catch a handler reading the key
   * once at construction.
   */
  it('notices the key changing without a restart', async () => {
    await settings.set('auth.registrationOpen', false, OWNER);
    await expect(handler.handle(good)).rejects.toBeInstanceOf(RegistrationClosed);

    await settings.set('auth.registrationOpen', true, OWNER);

    await expect(handler.handle(good)).resolves.toMatchObject({ email: good.email });
  });
});

describe('refresh rotation', () => {
  let users: InMemoryUserRepository;
  let tokens: InMemoryRefreshTokenRepository;
  let handler: RefreshHandler;
  let userId: string;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    tokens = new InMemoryRefreshTokenRepository();
    handler = new RefreshHandler(tokens, users, new JwtSigner(env), env as never);

    const registered = await new RegisterHandler(
      uow,
      users,
      hasher,
      new SettingsService(new InMemorySettingsStore(), new InMemoryAuditAdapter()),
    ).handle(good);
    userId = registered.userId;
  });

  it('exchanges a live token for a new pair', async () => {
    const opened = await handler.open(userId, null);

    const rotated = await handler.handle(opened.refreshToken);

    expect(rotated.refreshToken).not.toBe(opened.refreshToken);
    expect(rotated.accessToken).toBeTypeOf('string');
  });

  it('keeps the successor in the same family, so the chain stays one chain', async () => {
    const opened = await handler.open(userId, null);

    await handler.handle(opened.refreshToken);

    const families = new Set(tokens.rows.map((row) => row.familyId));
    expect(families.size).toBe(1);
    expect(tokens.rows).toHaveLength(2);
  });

  it('marks the exchanged token as replaced rather than leaving it live', async () => {
    const opened = await handler.open(userId, null);

    await handler.handle(opened.refreshToken);

    const previous = tokens.rows.find(
      (row) => row.tokenHash === hashRefreshToken(opened.refreshToken),
    );
    expect(previous?.replacedBy).toBeTruthy();
  });

  /**
   * The rule the family exists for. A token presented twice is either a replay
   * or a theft and nothing in the request tells them apart, so the whole family
   * goes and the member signs in again.
   */
  it('revokes the entire family when a token is presented twice', async () => {
    const opened = await handler.open(userId, null);
    await handler.handle(opened.refreshToken);

    const replay = await handler.handle(opened.refreshToken).catch((error: Error) => error);

    expect(replay).toMatchObject({ code: 'session_replay' });
    expect(tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  /** After a replay, even the legitimately-issued successor is dead. */
  it('leaves the honest client signed out too, which is the price of the rule', async () => {
    const opened = await handler.open(userId, null);
    const rotated = await handler.handle(opened.refreshToken);
    await handler.handle(opened.refreshToken).catch(() => undefined);

    const afterwards = await handler.handle(rotated.refreshToken).catch((error: Error) => error);

    expect(afterwards).toMatchObject({ code: 'session_replay' });
  });

  it('reports an unrecognised token as invalid, not as a replay', async () => {
    const rejected = await handler.handle('never-issued').catch((error: Error) => error);

    expect(rejected).toMatchObject({ code: 'token_invalid' });
  });

  it('reports an expired token as expired, so the client knows to sign in again', async () => {
    const opened = await handler.open(userId, null);
    for (const row of tokens.rows) row.expiresAt = new Date(Date.now() - 1);

    const rejected = await handler.handle(opened.refreshToken).catch((error: Error) => error);

    expect(rejected).toMatchObject({ code: 'token_expired' });
  });

  /**
   * Banned between issuing and refreshing. The family goes as well, otherwise
   * the holder keeps refreshing against an account that is gone.
   */
  it('refuses and revokes when the account can no longer sign in', async () => {
    const opened = await handler.open(userId, null);
    const account = await users.findById(userId, userId);
    account?.ban('admin-1');
    if (account) await uow.run(() => users.save(account));

    const rejected = await handler.handle(opened.refreshToken).catch((error: Error) => error);

    expect(rejected).toMatchObject({ code: 'token_invalid' });
    expect(tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  /** Only the hash is stored, so a database dump does not hand over sessions. */
  it('never stores the token it handed out', async () => {
    const opened = await handler.open(userId, null);

    expect(tokens.rows.map((row) => row.tokenHash)).not.toContain(opened.refreshToken);
    expect(tokens.rows[0]?.tokenHash).toBe(hashRefreshToken(opened.refreshToken));
  });
});
