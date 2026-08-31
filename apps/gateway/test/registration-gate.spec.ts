import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { GoogleAuthService } from '../src/auth/google-auth.service.js';

/** ConfigService stub: ALLOW_REGISTRATION plus the JWT values token issuing needs. */
function makeConfig(allowRegistration: boolean | string | undefined) {
  return {
    get: vi.fn((key: string) => {
      if (key === 'ALLOW_REGISTRATION') return allowRegistration;
      if (key === 'JWT_REFRESH_TTL') return '30d';
      return 'secret-value-long-enough';
    }),
  };
}

function makePrisma(existingUser: Record<string, unknown> | null) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(existingUser),
      create: vi.fn().mockResolvedValue({ id: 'u-new', email: 'new@example.com', role: 'user' }),
      update: vi.fn().mockResolvedValue({}),
    },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
}

function makeAuth(allowRegistration: boolean | string | undefined, existingUser = null as Record<string, unknown> | null) {
  const prisma = makePrisma(existingUser);
  const jwt = { signAsync: vi.fn().mockResolvedValue('token'), verifyAsync: vi.fn() };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const service = new AuthService(prisma as any, jwt as any, makeConfig(allowRegistration) as any);
  return { service, prisma };
}

function makeGoogle(allowRegistration: boolean | string | undefined, existingUser: Record<string, unknown> | null) {
  const prisma = makePrisma(existingUser);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new GoogleAuthService(prisma as any, makeConfig(allowRegistration) as any);
  return { service, prisma };
}

const registerDto = { email: 'new@example.com', password: 'correct horse battery staple', displayName: 'New' };
const googleIdentity = { email: 'new@example.com', displayName: 'New', subject: 'g-123' };

describe('ALLOW_REGISTRATION — email/password registration', () => {
  it('creates the account when registration is enabled', async () => {
    const { service, prisma } = makeAuth(true);
    await expect(service.register(registerDto)).resolves.toMatchObject({ email: 'new@example.com' });
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('rejects with 403 when registration is disabled', async () => {
    const { service, prisma } = makeAuth(false);
    await expect(service.register(registerDto)).rejects.toThrow(ForbiddenException);
    await expect(service.register(registerDto)).rejects.toThrow('Registration is closed on this server');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('stays open when ALLOW_REGISTRATION is unset (permissive default)', async () => {
    const { service, prisma } = makeAuth(undefined);
    await service.register(registerDto);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('lets an EXISTING user log in while registration is disabled', async () => {
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash('s3cret-password');
    const { service } = makeAuth(false, { id: 'u1', role: 'user', passwordHash });
    await expect(service.login({ email: 'old@example.com', password: 's3cret-password' })).resolves.toMatchObject({
      accessToken: 'token',
      refreshToken: 'token',
    });
  });
});

describe('ALLOW_REGISTRATION — Google sign-in (which does create users)', () => {
  it('creates a first-time Google account when registration is enabled', async () => {
    const { service, prisma } = makeGoogle(true, null);
    await expect(service.findOrCreateUser(googleIdentity)).resolves.toMatchObject({ id: 'u-new' });
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('refuses a NEW Google account with 403 when registration is disabled', async () => {
    const { service, prisma } = makeGoogle(false, null);
    await expect(service.findOrCreateUser(googleIdentity)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('still returns an EXISTING Google user while registration is disabled', async () => {
    const { service, prisma } = makeGoogle(false, { id: 'u1', email: 'new@example.com', status: 'active' });
    await expect(service.findOrCreateUser(googleIdentity)).resolves.toMatchObject({ id: 'u1' });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

// Regression: ConfigService.get() consults process.env before the validated,
// zod-transformed config, so a var actually set in the environment arrives as
// a STRING. Every case above passes a boolean, which is why the gate could
// compare against boolean false only and still look fully covered — while a
// real server running ALLOW_REGISTRATION=false accepted registrations.
describe('ALLOW_REGISTRATION arriving as a string, as process.env delivers it', () => {
  it('refuses email/password registration for the string "false"', async () => {
    const { service, prisma } = makeAuth('false');
    await expect(service.register(registerDto)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a new Google account for the string "false"', async () => {
    const { service, prisma } = makeGoogle('false', null);
    await expect(service.findOrCreateUser(googleIdentity)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('stays open for the string "true"', async () => {
    const { service, prisma } = makeAuth('true');
    await service.register(registerDto);
    expect(prisma.user.create).toHaveBeenCalled();
  });
});
