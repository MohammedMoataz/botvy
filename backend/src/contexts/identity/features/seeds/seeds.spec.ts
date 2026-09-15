import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../../../shared/auth/service-token.guard.js';
import {
  InMemoryServiceClientRepository,
  InMemoryUserRepository,
} from '../../infrastructure/in-memory-identity.repositories.js';
import { AdminCredentialsQueryHandler } from './admin-credentials.query.js';
import {
  AdminSeedService,
  DEFAULT_ADMIN_PASSWORD,
  type PasswordHasher,
} from './admin-seed.service.js';
import { IdentityBootstrap } from './identity.bootstrap.js';
import {
  N8N_CLIENT_NAME,
  N8N_SCOPES,
  ServiceClientSeedService,
} from './service-client-seed.service.js';

import { InMemoryUnitOfWork } from '../../../../shared/persistence/memory/in-memory-unit-of-work.js';

let uow: InMemoryUnitOfWork;

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
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    seed = new AdminSeedService(uow, users, fakeHasher);
  });

  it('creates the account on a fresh install and raises the registration event', async () => {
    expect(await seed.seed('admin', 'admin')).toBe('created');

    const user = await users.findByLogin('admin');
    expect(user).toMatchObject({ role: 'admin', status: 'active' });
    expect(users.events.map((event) => event.name)).toEqual([
      'identity.UserRegistered',
    ]);
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
    await uow.run(() => users.save(user));

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
    await uow.run(() => users.save(other));

    expect(await seed.seed('someone@else.test', 'ignored')).toBe('promoted');
    expect((await users.findByLogin('someone@else.test'))!.role).toBe('admin');
  });
});

/**
 * The one question another context asks about the seed.
 *
 * Its own handler rather than a method on the seed service, because a feature
 * service is private to its context and `OperationsBootstrap` was importing
 * this one directly to ask. `Identity` publishes queries; Operations binds a
 * port to this one in its own `infrastructure/`.
 */
describe('the seeded administrator credentials query', () => {
  const envFor = (email: string, password: string) =>
    ({ ADMIN_EMAIL: email, ADMIN_PASSWORD: password }) as never;

  it('reports the shipped password as still default, and stops once it changes', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);
    const seed = new AdminSeedService(uow, users, fakeHasher);
    const query = new AdminCredentialsQueryHandler(
      envFor('admin', DEFAULT_ADMIN_PASSWORD),
      users,
      fakeHasher,
    );

    await seed.seed('admin', DEFAULT_ADMIN_PASSWORD);
    expect(await query.seededAdminIsStillDefault()).toBe(true);

    const user = (await users.findByLogin('admin'))!;
    user.passwordHash = 'hashed:a-real-password';
    await uow.run(() => users.save(user));

    expect(await query.seededAdminIsStillDefault()).toBe(false);
  });

  /**
   * The database is what decides, not `.env`. The seed never resets an existing
   * password, so an installation whose Owner changed it in the portal still has
   * `ADMIN_PASSWORD=admin` in its environment - and reading the environment for
   * the answer would warn there for ever.
   */
  it('reads the stored hash rather than the environment', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);
    const seed = new AdminSeedService(uow, users, fakeHasher);
    const query = new AdminCredentialsQueryHandler(
      envFor('admin', DEFAULT_ADMIN_PASSWORD),
      users,
      fakeHasher,
    );

    await seed.seed('admin', 'a-password-the-operator-chose');

    expect(await query.seededAdminIsStillDefault()).toBe(false);
  });

  /** Both changed means this installation is not running the published pair. */
  it('is false when the operator moved the account and the password', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);
    const query = new AdminCredentialsQueryHandler(
      envFor('owner@example.test', 'a-password-the-operator-chose'),
      users,
      fakeHasher,
    );

    expect(await query.seededAdminIsStillDefault()).toBe(false);
  });

  /** No account yet is not "still default"; there is nothing to sign into. */
  it('is false before the seed has run', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);
    const query = new AdminCredentialsQueryHandler(
      envFor('admin', DEFAULT_ADMIN_PASSWORD),
      users,
      fakeHasher,
    );

    expect(await query.seededAdminIsStillDefault()).toBe(false);
  });
});

describe('n8n service-client seed', () => {
  let clients: InMemoryServiceClientRepository;
  let seed: ServiceClientSeedService;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
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
    expect(
      await clients.verifyToken(hashToken('the-new-token')),
    ).not.toBeNull();
    expect(await clients.verifyToken(hashToken('the-old-token'))).toBeNull();
  });

  it('stores a hash, never the token itself', async () => {
    await seed.seed('an-internal-token');

    const stored = clients.byName.get(N8N_CLIENT_NAME)!;
    expect(stored.tokenHash).toBe(hashToken('an-internal-token'));
    expect(stored.tokenHash).not.toContain('an-internal-token');
  });
});

// ------------------------------------------------- booting without a schema

/**
 * A first install boots before its migrations have run, and must survive it.
 *
 * The documented order is `up -d`, then `node infra/bootstrap.mjs` — and
 * bootstrap applies the migrations by `exec`-ing into the very container these
 * seeds run in. So a seed that throws takes the process down before there is
 * anything to exec into, and the install cannot proceed at all.
 *
 * This has now shipped broken twice. The first fix guarded the seeds behind
 * `seededAdminIsStillDefault()`, which returns early — without touching the
 * database — whenever the operator has changed both `ADMIN_EMAIL` and
 * `ADMIN_PASSWORD` from the shipped pair, which every real installation does.
 * The guard therefore read a clean `false` as "the schema is fine" and the seed
 * died anyway. Nothing caught it because every database it was tried against
 * already had a schema; CI's fresh one killed the whole e2e job for three days.
 *
 * Hence a spec, and one that fails the *original* way too: the repository here
 * throws what PostgreSQL throws, so a guard that never runs the query cannot
 * pass it.
 */
describe('the identity bootstrap on a database with no schema', () => {
  class MissingSchemaError extends Error {
    readonly code = 'P2021';
    constructor() {
      super('The table `public.users` does not exist in the current database.');
    }
  }

  /** Every read and write answers the way Prisma does before `migrate deploy`. */
  const noSchema = {
    async findByLogin(): Promise<never> {
      throw new MissingSchemaError();
    },
    async save(): Promise<never> {
      throw new MissingSchemaError();
    },
  };

  function bootstrapWith(env: Record<string, unknown>) {
    const unit = new InMemoryUnitOfWork();
    const admin = new AdminSeedService(
      unit,
      noSchema as never,
      fakeHasher,
    );
    const credentials = new AdminCredentialsQueryHandler(
      noSchema as never,
      { ADMIN_EMAIL: env.ADMIN_EMAIL, ADMIN_PASSWORD: env.ADMIN_PASSWORD } as never,
      fakeHasher,
    );
    const clients = new ServiceClientSeedService(new InMemoryServiceClientRepository());
    return new IdentityBootstrap(
      { BOTVY_ROLE: 'backend', ...env } as never,
      admin,
      credentials,
      clients,
    );
  }

  it('starts anyway when the operator has changed both admin credentials', async () => {
    // The case the first fix missed, and the only case that exists in
    // production: nobody ships the published address and password.
    const bootstrap = bootstrapWith({
      ADMIN_EMAIL: 'owner@example.invalid',
      ADMIN_PASSWORD: 'not-the-default-one',
      INTERNAL_SERVICE_TOKEN: 'service-token',
    });

    await expect(bootstrap.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('starts anyway when the credentials are still the shipped pair', async () => {
    const bootstrap = bootstrapWith({
      ADMIN_EMAIL: 'owner@botvy.local',
      ADMIN_PASSWORD: DEFAULT_ADMIN_PASSWORD,
      INTERNAL_SERVICE_TOKEN: 'service-token',
    });

    await expect(bootstrap.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('still fails loudly on anything that is not a missing schema', async () => {
    // A wrong password or an unreachable database must stop the boot. Starting
    // half-configured with no administrator is the failure the guard exists to
    // prevent, and a blanket catch would cause it.
    const refused = {
      async findByLogin(): Promise<never> {
        throw new Error('password authentication failed for user "botvy"');
      },
      async save(): Promise<never> {
        throw new Error('password authentication failed for user "botvy"');
      },
    };
    const unit = new InMemoryUnitOfWork();
    const bootstrap = new IdentityBootstrap(
      {
        BOTVY_ROLE: 'backend',
        ADMIN_EMAIL: 'owner@example.invalid',
        ADMIN_PASSWORD: 'whatever',
        INTERNAL_SERVICE_TOKEN: 'service-token',
      } as never,
      new AdminSeedService(unit, refused as never, fakeHasher),
      new AdminCredentialsQueryHandler(refused as never, {} as never, fakeHasher),
      new ServiceClientSeedService(new InMemoryServiceClientRepository()),
    );

    await expect(bootstrap.onApplicationBootstrap()).rejects.toThrow(
      /password authentication failed/,
    );
  });
});
