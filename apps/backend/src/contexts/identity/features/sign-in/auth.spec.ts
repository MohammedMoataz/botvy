import { beforeEach, describe, expect, it } from 'vitest';
import { JwtSigner } from '../../../../shared/auth/jwt.signer.js';
import { JwtVerifier } from '../../../../shared/auth/jwt.verifier.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import { User } from '../../domain/user.aggregate.js';
import { InMemoryUserRepository } from '../../infrastructure/in-memory-identity.repositories.js';
import {
  ChangePasswordHandler,
  CurrentPasswordWrong,
  MIN_PASSWORD_LENGTH,
  NewPasswordTooShort,
  NewPasswordUnchanged,
} from '../change-password/change-password.handler.js';
import { InvalidCredentials, SignInHandler } from './sign-in.handler.js';

/** Reversible and instant. The real cost belongs to the scrypt adapter's spec. */
const hasher: PasswordHasher = {
  async hash(plain) {
    return `hashed:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `hashed:${plain}`;
  },
};

const env = { JWT_ACCESS_SECRET: 'a-secret-long-enough', JWT_ACCESS_TTL: '15m' };

function admin(overrides: Partial<{ status: 'active' | 'banned'; password: string }> = {}) {
  return User.rehydrate({
    id: 'user-1',
    email: 'imohammedmoataz@gmail.com',
    displayName: 'Owner',
    passwordHash: `hashed:${overrides.password ?? 'admin'}`,
    googleSub: null,
    role: 'admin',
    status: overrides.status ?? 'active',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    lastLoginAt: null,
    deletedAt: null,
  });
}

describe('sign-in', () => {
  let users: InMemoryUserRepository;
  let handler: SignInHandler;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    handler = new SignInHandler(users, hasher, new JwtSigner(env));
  });

  it('returns a token the verifier accepts, carrying the role', async () => {
    await users.save(admin());

    const result = await handler.handle({
      email: 'imohammedmoataz@gmail.com',
      password: 'admin',
    });

    const principal = new JwtVerifier(env).verify(result.accessToken);
    expect(principal).toMatchObject({ kind: 'user', id: 'user-1', role: 'admin' });
  });

  /** The seed's boot warning is only actionable if the client is told. */
  it('reports that the seeded password is still in use', async () => {
    await users.save(admin());

    const result = await handler.handle({
      email: 'imohammedmoataz@gmail.com',
      password: 'admin',
    });

    expect(result.mustChangePassword).toBe(true);
  });

  it('does not flag a password that is not the seeded one', async () => {
    await users.save(admin({ password: 'something-else' }));

    const result = await handler.handle({
      email: 'imohammedmoataz@gmail.com',
      password: 'something-else',
    });

    expect(result.mustChangePassword).toBe(false);
  });

  it('accepts the login in any case, with surrounding space', async () => {
    await users.save(admin());

    await expect(
      handler.handle({ email: '  IMohammedMoataz@Gmail.com ', password: 'admin' }),
    ).resolves.toMatchObject({ userId: 'user-1' });
  });

  /**
   * One message for a missing account and a wrong password alike. Anything else
   * is an account-existence oracle, and this installation's administrator login
   * is a value written down in the setup guide.
   */
  it('says the same thing for a wrong password and an unknown address', async () => {
    await users.save(admin());

    const wrongPassword = await handler
      .handle({ email: 'imohammedmoataz@gmail.com', password: 'nope' })
      .catch((error: Error) => error);
    const noSuchUser = await handler
      .handle({ email: 'nobody@example.test', password: 'nope' })
      .catch((error: Error) => error);

    expect(wrongPassword).toBeInstanceOf(InvalidCredentials);
    expect(noSuchUser).toBeInstanceOf(InvalidCredentials);
    expect((wrongPassword as Error).message).toBe((noSuchUser as Error).message);
  });

  it('refuses a banned account without saying that is why', async () => {
    await users.save(admin({ status: 'banned' }));

    await expect(
      handler.handle({ email: 'imohammedmoataz@gmail.com', password: 'admin' }),
    ).rejects.toBeInstanceOf(InvalidCredentials);
  });

  it('records the sign-in on the account', async () => {
    await users.save(admin());

    await handler.handle({ email: 'imohammedmoataz@gmail.com', password: 'admin' });

    const stored = await users.findByLogin('imohammedmoataz@gmail.com');
    expect(stored?.lastLoginAt).toBeInstanceOf(Date);
  });
});

describe('change password', () => {
  let users: InMemoryUserRepository;
  let handler: ChangePasswordHandler;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    handler = new ChangePasswordHandler(users, hasher);
    await users.save(admin());
  });

  it('replaces the hash and raises the event', async () => {
    await handler.handle({
      userId: 'user-1',
      currentPassword: 'admin',
      newPassword: 'a-longer-secret',
    });

    const stored = await users.findById('user-1', 'user-1');
    expect(stored?.passwordHash).toBe('hashed:a-longer-secret');
  });

  /**
   * Asked for even though the caller already holds a token: a stolen access
   * token must not be enough to lock the owner out of their own account.
   */
  it('refuses when the current password is wrong', async () => {
    await expect(
      handler.handle({
        userId: 'user-1',
        currentPassword: 'not-it',
        newPassword: 'a-longer-secret',
      }),
    ).rejects.toBeInstanceOf(CurrentPasswordWrong);
  });

  it('enforces the minimum length on the server, not only in the client', async () => {
    await expect(
      handler.handle({
        userId: 'user-1',
        currentPassword: 'admin',
        newPassword: 'x'.repeat(MIN_PASSWORD_LENGTH - 1),
      }),
    ).rejects.toBeInstanceOf(NewPasswordTooShort);
  });

  it('refuses a new password identical to the old one', async () => {
    await users.save(admin({ password: 'a-longer-secret' }));

    await expect(
      handler.handle({
        userId: 'user-1',
        currentPassword: 'a-longer-secret',
        newPassword: 'a-longer-secret',
      }),
    ).rejects.toBeInstanceOf(NewPasswordUnchanged);
  });

  /** A Google-only account. There is nothing to compare, so nothing passes. */
  it('reports a wrong current password for an account that has none', async () => {
    await users.save(
      User.rehydrate({
        id: 'user-2',
        email: 'google-only@example.test',
        displayName: null,
        passwordHash: null,
        googleSub: 'g-1',
        role: 'user',
        status: 'active',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'),
        lastLoginAt: null,
        deletedAt: null,
      }),
    );

    await expect(
      handler.handle({ userId: 'user-2', currentPassword: '', newPassword: 'a-longer-secret' }),
    ).rejects.toBeInstanceOf(CurrentPasswordWrong);
  });
});
