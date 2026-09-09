import { beforeEach, describe, expect, it } from 'vitest';
import { JwtSigner } from '../../../../shared/auth/jwt.signer.js';
import { InMemorySettingsStore } from '../../../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { InMemoryAuditAdapter } from '../../../../shared/audit/in-memory-audit.adapter.js';
import {
  GoogleTokenInvalid,
  type GoogleIdentity,
  type GoogleVerifier,
} from '../../domain/google-verifier.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import { User } from '../../domain/user.aggregate.js';
import {
  InMemoryDeviceRepository,
  InMemoryRefreshTokenRepository,
  InMemoryUserRepository,
} from '../../infrastructure/in-memory-identity.repositories.js';
import { RefreshHandler } from '../refresh/refresh.handler.js';
import { RegisterDeviceHandler } from '../register-device/register-device.handler.js';
import { InvalidCredentials } from '../sign-in/sign-in.handler.js';
import {
  GoogleSignInHandler,
  LinkPasswordWrong,
  LinkRequired,
  RegistrationClosedForGoogle,
} from './google-sign-in.handler.js';

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

const env = {
  JWT_ACCESS_SECRET: 'a-secret-long-enough',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

/** Stands in for Google. The real adapter's job is checking the audience. */
class FakeGoogle implements GoogleVerifier {
  identity: GoogleIdentity = {
    sub: 'g-sub-1',
    email: 'member@example.test',
    emailVerified: true,
    displayName: 'A Member',
    pictureUrl: null,
  };
  refuse = false;

  async verify(): Promise<GoogleIdentity> {
    if (this.refuse) throw new GoogleTokenInvalid();
    return this.identity;
  }
}

const OWNER = { kind: 'user', id: 'admin-1', role: 'admin' } as const;

function account(overrides: Partial<Parameters<typeof User.rehydrate>[0]> = {}) {
  return User.rehydrate({
    id: 'user-1',
    email: 'member@example.test',
    displayName: null,
    passwordHash: 'hashed:existing-password',
    googleSub: null,
    role: 'user',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    lastLoginAt: null,
    deletedAt: null,
    ...overrides,
  });
}

describe('google sign-in', () => {
  let users: InMemoryUserRepository;
  let tokens: InMemoryRefreshTokenRepository;
  let devices: InMemoryDeviceRepository;
  let google: FakeGoogle;
  let settings: SettingsService;
  let handler: GoogleSignInHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    tokens = new InMemoryRefreshTokenRepository();
    devices = new InMemoryDeviceRepository(uow);
    google = new FakeGoogle();
    settings = new SettingsService(new InMemorySettingsStore(), new InMemoryAuditAdapter());
    handler = new GoogleSignInHandler(
      uow,
      users,
      google,
      new JwtSigner(env),
      new RefreshHandler(tokens, users, new JwtSigner(env), env as never),
      new RegisterDeviceHandler(uow, devices),
      settings,
      hasher,
    );
  });

  it('registers an unknown Google identity and signs it in', async () => {
    const result = await handler.handle({ idToken: 'valid' });

    expect(result.email).toBe('member@example.test');
    expect(users.events.map((event) => event.name)).toContain('identity.UserRegistered');
    expect(result.refreshToken).toBeTypeOf('string');
  });

  /**
   * Inventing a password nobody knows would leave the member unable to change
   * it, and asking them to choose one mid-flow defeats the point of the flow.
   */
  it('creates the account with no password at all', async () => {
    const result = await handler.handle({ idToken: 'valid' });

    const stored = await users.findById(result.userId, result.userId);
    expect(stored?.passwordHash).toBeNull();
    expect(stored?.googleSub).toBe('g-sub-1');
  });

  it('signs in an identity that is already linked, without registering again', async () => {
    await users.save(account({ googleSub: 'g-sub-1' }));

    const result = await handler.handle({ idToken: 'valid' });

    expect(result.userId).toBe('user-1');
    expect(users.events.map((event) => event.name)).not.toContain('identity.UserRegistered');
  });

  /**
   * The case worth being careful about. Signing them in regardless would let
   * anyone who controls an address take over the account that used it.
   */
  it('refuses with link_required when the address has a password account', async () => {
    await users.save(account());

    const refused = await handler.handle({ idToken: 'valid' }).catch((error: Error) => error);

    expect(refused).toBeInstanceOf(LinkRequired);
    expect(refused).toMatchObject({ code: 'link_required', email: 'member@example.test' });
  });

  it('does not link the identity while it is refusing', async () => {
    await users.save(account());
    await handler.handle({ idToken: 'valid' }).catch(() => undefined);

    const stored = await users.findById('user-1', 'user-1');
    expect(stored?.googleSub).toBeNull();
  });

  /**
   * An account with neither a password nor a link has nothing to prove
   * ownership with, so linking is the only way it can ever be signed into.
   */
  it('links an account that has no password rather than refusing', async () => {
    await users.save(account({ passwordHash: null }));

    const result = await handler.handle({ idToken: 'valid' });

    expect(result.userId).toBe('user-1');
    const stored = await users.findById('user-1', 'user-1');
    expect(stored?.googleSub).toBe('g-sub-1');
  });

  it('refuses a banned account that is already linked', async () => {
    await users.save(account({ googleSub: 'g-sub-1', status: 'banned' }));

    await expect(handler.handle({ idToken: 'valid' })).rejects.toBeInstanceOf(InvalidCredentials);
  });

  /** The same switch that closes password registration closes this one. */
  it('refuses a first-time Google sign-in when registration is closed', async () => {
    await settings.set('auth.registrationOpen', false, OWNER);

    await expect(handler.handle({ idToken: 'valid' })).rejects.toBeInstanceOf(
      RegistrationClosedForGoogle,
    );
  });

  it('still signs in an existing linked member when registration is closed', async () => {
    await users.save(account({ googleSub: 'g-sub-1' }));
    await settings.set('auth.registrationOpen', false, OWNER);

    await expect(handler.handle({ idToken: 'valid' })).resolves.toMatchObject({
      userId: 'user-1',
    });
  });

  it('registers the device it was told about, like an ordinary sign-in', async () => {
    const result = await handler.handle({
      idToken: 'valid',
      device: { installId: 'install-1', kind: 'ios' },
    });

    expect(devices.rows).toHaveLength(1);
    expect(tokens.rows[0]?.deviceId).toBe(result.deviceId);
  });

  it('refuses a token the verifier will not accept', async () => {
    google.refuse = true;

    await expect(handler.handle({ idToken: 'forged' })).rejects.toBeInstanceOf(GoogleTokenInvalid);
  });

  it('never reports mustChangePassword for an account with no password', async () => {
    const result = await handler.handle({ idToken: 'valid' });

    expect(result.mustChangePassword).toBe(false);
  });
});

describe('google link', () => {
  let users: InMemoryUserRepository;
  let google: FakeGoogle;
  let handler: GoogleSignInHandler;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    google = new FakeGoogle();
    handler = new GoogleSignInHandler(
      uow,
      users,
      google,
      new JwtSigner(env),
      new RefreshHandler(
        new InMemoryRefreshTokenRepository(),
        users,
        new JwtSigner(env),
        env as never,
      ),
      new RegisterDeviceHandler(uow, new InMemoryDeviceRepository(uow)),
      new SettingsService(new InMemorySettingsStore(), new InMemoryAuditAdapter()),
      hasher,
    );
    await users.save(account());
  });

  it('attaches the identity once the password is proved', async () => {
    const result = await handler.link('valid', 'existing-password');

    expect(result.userId).toBe('user-1');
    const stored = await users.findById('user-1', 'user-1');
    expect(stored?.googleSub).toBe('g-sub-1');
    expect(users.events.map((event) => event.name)).toContain('identity.GoogleLinked');
  });

  it('refuses a wrong password, and links nothing', async () => {
    await expect(handler.link('valid', 'not-it')).rejects.toBeInstanceOf(LinkPasswordWrong);

    const stored = await users.findById('user-1', 'user-1');
    expect(stored?.googleSub).toBeNull();
  });

  /** Same wording as an ordinary failed sign-in, for the same reason. */
  it('says the same thing for an address with no account', async () => {
    google.identity = { ...google.identity, email: 'nobody@example.test' };

    await expect(handler.link('valid', 'anything')).rejects.toBeInstanceOf(LinkPasswordWrong);
  });

  it('is idempotent when the same identity is linked twice', async () => {
    await handler.link('valid', 'existing-password');

    await expect(handler.link('valid', 'existing-password')).resolves.toMatchObject({
      userId: 'user-1',
    });
  });
});
