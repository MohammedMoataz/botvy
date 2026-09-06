import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../../../shared/auth/service-token.guard.js';
import {
  InMemoryServiceClientRepository,
  InMemoryUserRepository,
} from '../../infrastructure/in-memory-identity.repositories.js';
import {
  AdminSeedService,
  DEFAULT_ADMIN_PASSWORD,
  type PasswordHasher,
} from './admin-seed.service.js';
import { N8N_CLIENT_NAME, N8N_SCOPES, ServiceClientSeedService } from './service-client-seed.service.js';

/** Not argon2: these specs are about the seed's branches, not about hashing. */
const fakeHasher: PasswordHasher = {
  async hash(plain) {
    return `hashed:${plain}`;
  },
  async verify(hash, plain) {
    return hash === `hashed:${plain}`;
  },
};

describe('admin seed', () => {
  let users: InMemoryUserRepository;
  let seed: AdminSeedService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    seed = new AdminSeedService(users, fakeHasher);
  });

  it('creates the account on a fresh install and raises the registration event', async () => {
    expect(await seed.seed('admin', 'admin')).toBe('created');

    const user = await users.findByLogin('admin');
    expect(user).toMatchObject({ role: 'admin', status: 'active' });
    expect(users.events.map((event) => event.name)).toEqual(['identity.UserRegistered']);
  });

  /** A second boot must change nothing, or every restart rewrites the account. */
  it('is a no-op on the second boot', async () => {
    await seed.seed('admin', 'admin');
    const before = (await users.findByLogin('admin'))!.passwordHash;

    expect(await seed.seed('admin', 'admin')).toBe('unchanged');
    expect((await users.findByLogin('admin'))!.passwordHash).toBe(before);
    expect(await users.countAll()).toBe(1);
  });

  /**
   * The rule that makes the portal usable: a password changed there has to
   * survive a restart, so the seed never resets one.
   */
  it('never resets a password that was changed', async () => {
    await seed.seed('admin', 'admin');
    const user = (await users.findByLogin('admin'))!;
    user.passwordHash = 'hashed:something-the-owner-chose';
    await users.save(user);

    await seed.seed('admin', 'admin');

    expect((await users.findByLogin('admin'))!.passwordHash).toBe(
      'hashed:something-the-owner-chose',
    );
  });

  /**
   * Keyed on this account existing, not on whether some administrator does.
   * Gating on "the database has no admin" meant an install that already had one
   * never got the documented default credentials — the opposite of a default.
   */
  it('promotes the named account when it exists as an ordinary member', async () => {
    await seed.seed('someone@else.test', 'their-password');
    const other = (await users.findByLogin('someone@else.test'))!;
    other.role = 'user';
    await users.save(other);

    expect(await seed.seed('someone@else.test', 'ignored')).toBe('promoted');
    expect((await users.findByLogin('someone@else.test'))!.role).toBe('admin');
  });

  it('reports the seeded password as still default, and stops once it changes', async () => {
    await seed.seed('admin', DEFAULT_ADMIN_PASSWORD);
    expect(await seed.isStillDefault('admin', DEFAULT_ADMIN_PASSWORD)).toBe(true);

    const user = (await users.findByLogin('admin'))!;
    user.passwordHash = 'hashed:a-real-password';
    await users.save(user);

    expect(await seed.isStillDefault('admin', DEFAULT_ADMIN_PASSWORD)).toBe(false);
  });
});

describe('n8n service-client seed', () => {
  let clients: InMemoryServiceClientRepository;
  let seed: ServiceClientSeedService;

  beforeEach(() => {
    clients = new InMemoryServiceClientRepository();
    seed = new ServiceClientSeedService(clients);
  });

  it('creates the client with the scopes the committed workflows need', async () => {
    expect(await seed.seed('an-internal-token')).toBe('created');

    const client = await clients.findByName(N8N_CLIENT_NAME);
    expect(client?.scopes).toEqual([...N8N_SCOPES]);
  });

  it('is a no-op on the second boot with the same token', async () => {
    await seed.seed('an-internal-token');
    expect(await seed.seed('an-internal-token')).toBe('unchanged');
    expect(clients.byName.size).toBe(1);
  });

  /**
   * A second row with the same name and an old secret still valid would mean
   * revoking a credential had no effect.
   */
  it('rotates the hash in place when the token changes, leaving one row', async () => {
    await seed.seed('the-old-token');

    // The outcome matters as much as the state: a rotation reported as
    // "unchanged" is a rotation nobody is told about.
    expect(await seed.seed('the-new-token')).toBe('rotated');

    expect(clients.byName.size).toBe(1);
    expect(await clients.verifyToken(hashToken('the-new-token'))).not.toBeNull();
    expect(await clients.verifyToken(hashToken('the-old-token'))).toBeNull();
  });

  it('stores a hash, never the token itself', async () => {
    await seed.seed('an-internal-token');

    const stored = clients.byName.get(N8N_CLIENT_NAME)!;
    expect(stored.tokenHash).toBe(hashToken('an-internal-token'));
    expect(stored.tokenHash).not.toContain('an-internal-token');
  });
});
