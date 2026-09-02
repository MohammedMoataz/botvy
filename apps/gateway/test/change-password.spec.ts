import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service.js';

/**
 * Changing a password. It exists because the gateway now ships with a default
 * admin, and a default credential with no supported way to change it is worse
 * than no default at all.
 */
async function makeService(currentPassword = 'admin') {
  const user = {
    id: 'u1',
    email: 'admin',
    role: 'admin',
    passwordHash: await argon2.hash(currentPassword),
  };
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(user),
    },
    refreshToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('token') };
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: 'x'.repeat(16),
    JWT_REFRESH_SECRET: 'y'.repeat(16),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
  };
  const config = { get: vi.fn().mockImplementation((k: string) => values[k]) };

  const service = new AuthService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jwt as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config as any,
  );
  return { service, prisma, user };
}

describe('AuthService.changePassword', () => {
  it('replaces the hash and returns a working pair', async () => {
    const { service, prisma } = await makeService();
    const pair = await service.changePassword('u1', {
      currentPassword: 'admin',
      newPassword: 'a-real-password',
    });

    const stored = prisma.user.update.mock.calls[0][0].data.passwordHash as string;
    expect(await argon2.verify(stored, 'a-real-password')).toBe(true);
    expect(pair).toHaveProperty('accessToken');
  });

  it('signs every other session out', async () => {
    // A password is usually changed because someone else might know the old
    // one. Leaving their refresh token alive makes the change cosmetic.
    const { service, prisma } = await makeService();
    await service.changePassword('u1', {
      currentPassword: 'admin',
      newPassword: 'a-real-password',
    });

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('refuses a wrong current password, and changes nothing', async () => {
    const { service, prisma } = await makeService();
    await expect(
      service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'a-real-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an account that is not there', async () => {
    const { service, prisma } = await makeService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.changePassword('ghost', { currentPassword: 'admin', newPassword: 'a-real-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
