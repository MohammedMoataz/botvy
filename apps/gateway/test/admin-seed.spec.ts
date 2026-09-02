import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  AdminSeedService,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
} from '../src/auth/admin-seed.service.js';

/**
 * The seeded admin. What matters here is what it must NOT do: it must never
 * touch an account that already exists as an admin, never reset a password,
 * and never stop the gateway booting if it fails.
 */
function makeService(
  opts: { admins?: number; existing?: unknown; password?: string; createThrows?: boolean } = {},
) {
  const prisma = {
    user: {
      count: vi.fn().mockResolvedValue(opts.admins ?? 0),
      findUnique: vi.fn().mockResolvedValue(opts.existing ?? null),
      create: opts.createThrows
        ? vi.fn().mockRejectedValue(new Error('unique constraint'))
        : vi.fn().mockResolvedValue({ id: 'u1' }),
      update: vi.fn().mockResolvedValue({ id: 'u1' }),
    },
  };
  const values: Record<string, string> = {
    ADMIN_EMAIL: DEFAULT_ADMIN_EMAIL,
    ADMIN_PASSWORD: opts.password ?? DEFAULT_ADMIN_PASSWORD,
  };
  const config = { get: vi.fn().mockImplementation((k: string) => values[k]) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AdminSeedService(prisma as any, config as any);
  return { service, prisma };
}

describe('seeding the first admin', () => {
  it('creates one when the database has none', async () => {
    const { service, prisma } = makeService();
    await service.onApplicationBootstrap();

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe('admin');
    expect(data.role).toBe('admin');
    // Hashed, never the literal — a stored plaintext password is the whole
    // reason argon2 is here.
    expect(data.passwordHash).not.toContain(DEFAULT_ADMIN_PASSWORD);
    expect(data.passwordHash.startsWith('$argon2')).toBe(true);
  });

  it('still creates it when some other admin already exists', async () => {
    // Gating on "the database has no admin" meant an install that already had
    // one never got this account, so the documented default credentials did
    // not work there — the opposite of a default.
    const { service, prisma } = makeService({ admins: 1 });
    await service.onApplicationBootstrap();

    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('leaves the account alone once it exists, password included', async () => {
    // Otherwise every restart would hand it back to anyone who knows the
    // default, and changing the password would be pointless.
    const { service, prisma } = makeService({
      existing: { id: 'u9', email: 'admin', role: 'admin' },
    });
    await service.onApplicationBootstrap();

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('promotes it if it exists as an ordinary user', async () => {
    // Someone who registered as "admin" before this shipped. Failing on the
    // unique index would leave the install with no way in.
    const { service, prisma } = makeService({
      existing: { id: 'u9', email: 'admin', role: 'user' },
    });
    await service.onApplicationBootstrap();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u9' },
      data: { role: 'admin' },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does not stop the gateway booting when it fails', async () => {
    // Every other feature works without a seeded admin, and the account can
    // be made by hand.
    const { service } = makeService({ createThrows: true });
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('is idempotent across restarts', async () => {
    const { service, prisma } = makeService();
    await service.onApplicationBootstrap();
    // The one it just made, now found on the second boot.
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'admin', role: 'admin' });
    await service.onApplicationBootstrap();

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
});

describe('the default-password warning', () => {
  it('warns while the shipped password is still in use', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { service } = makeService();
    await service.onApplicationBootstrap();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('default password'));
    warn.mockRestore();
  });

  it('stays quiet once it has been changed', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { service } = makeService({ password: 'something-else' });
    await service.onApplicationBootstrap();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns even when the admin already existed, because it is still weak', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { service } = makeService({ admins: 1 });
    await service.onApplicationBootstrap();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
