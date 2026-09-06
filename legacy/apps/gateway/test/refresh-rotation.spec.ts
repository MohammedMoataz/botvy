import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service.js';
import { parseDurationToMs } from '../src/auth/duration.js';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

function makeService(storedToken: Record<string, unknown> | null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'u1', role: 'user' }),
      update: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn().mockResolvedValue(storedToken),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue({ sub: 'u1', jti: 'jti-1' }),
    signAsync: vi.fn().mockResolvedValue('new-token'),
  };
  const config = {
    get: vi.fn((key: string) => (key === 'JWT_REFRESH_TTL' ? '30d' : 'secret-value-long-enough')),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AuthService(prisma as any, jwt as any, config as any);
  return { service, prisma, jwt };
}

describe('parseDurationToMs', () => {
  it('parses each supported unit', () => {
    expect(parseDurationToMs('500ms')).toBe(500);
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('15m')).toBe(900_000);
    expect(parseDurationToMs('2h')).toBe(7_200_000);
    expect(parseDurationToMs('30d')).toBe(2_592_000_000);
  });

  it('throws on a malformed duration rather than silently returning NaN', () => {
    expect(() => parseDurationToMs('forever')).toThrow();
    expect(() => parseDurationToMs('10w')).toThrow();
  });
});

describe('AuthService.refresh — rotation and reuse detection', () => {
  const validStored = () => ({
    id: 'jti-1',
    userId: 'u1',
    tokenHash: sha256('good-token'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  });

  it('rotates: revokes the presented token and issues a new pair', async () => {
    const { service, prisma } = makeService(validStored());
    const result = await service.refresh('good-token');
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'jti-1' } }),
    );
  });

  it('rejects a token that was already revoked (reuse detection)', async () => {
    const { service } = makeService({ ...validStored(), revokedAt: new Date() });
    await expect(service.refresh('good-token')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const { service } = makeService({
      ...validStored(),
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.refresh('good-token')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the presented token does not match the stored hash', async () => {
    const { service } = makeService(validStored());
    await expect(service.refresh('tampered-token')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when no such token row exists', async () => {
    const { service } = makeService(null);
    await expect(service.refresh('good-token')).rejects.toThrow(UnauthorizedException);
  });
});
