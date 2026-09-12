import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { GraphQLError } from 'graphql';
import type { Principal } from '../shared/auth/principal.js';
import { REQUIRED_KIND, REQUIRED_ROLES } from '../shared/auth/decorators.js';
import { InMemoryUnitOfWork } from '../shared/persistence/memory/in-memory-unit-of-work.js';
import {
  InMemoryDeviceRepository,
  InMemoryUserRepository,
} from '../contexts/identity/infrastructure/in-memory-identity.repositories.js';
import { User } from '../contexts/identity/domain/user.aggregate.js';
import { Device } from '../contexts/identity/domain/device.aggregate.js';
import { DevicesQueryHandler } from '../contexts/identity/features/devices/devices.query.js';
import { MeQueryHandler } from '../contexts/identity/features/me/me.query.js';
import { MeResolver } from '../contexts/identity/features/me/me.resolver.js';
import { MyDevicesResolver } from '../contexts/identity/features/devices/devices.resolver.js';
import { formatError } from './graphql.module.js';

const now = new Date('2026-09-09T10:00:00.000Z');
const alice: Principal = { kind: 'user', id: 'user-1', role: 'user' };

const env = { MEDIA_SIGNING_SECRET: 'a-secret-long-enough' } as never;

function member(id: string, role: 'user' | 'admin' = 'user'): User {
  return User.register(
    {
      id,
      email: `${id}@example.test`,
      displayName: null,
      passwordHash: 'hashed',
      googleSub: null,
      role,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {},
  );
}

/**
 * The read edge, at the resolver.
 *
 * These specs drive the resolvers directly rather than through Apollo, for the
 * same reason the handler specs drive handlers directly: what is worth checking
 * is which member's rows come back and what is refused, not that the driver can
 * parse a query. What Apollo does is covered by the schema being generated from
 * these same classes — and by `app.module.spec.ts`, which now builds the whole
 * graph including this module.
 */
describe('the me query', () => {
  let uow: InMemoryUnitOfWork;
  let users: InMemoryUserRepository;
  let devices: InMemoryDeviceRepository;
  let resolver: MeResolver;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    users = new InMemoryUserRepository(uow);
    devices = new InMemoryDeviceRepository(uow);
    const devicesQuery = new DevicesQueryHandler(devices, users, env);
    resolver = new MeResolver(new MeQueryHandler(users, devicesQuery));

    await uow.run(() => users.save(member('user-1')));
  });

  it('answers with the caller, and counts their devices', async () => {
    await uow.run(() =>
      devices.save(
        Device.register({
          id: 'device-1',
          userId: 'user-1',
          installId: 'install-1',
          kind: 'android',
          name: null,
          pushToken: null,
          lastSeenAt: now,
          createdAt: now,
        }),
      ),
    );

    const view = await resolver.me(alice);

    expect(view.email).toBe('user-1@example.test');
    expect(view.deviceCount).toBe(1);
  });

  /**
   * The row stays after a delete so the id keeps resolving for the Mongo
   * contexts that hold it as a plain string. The member is gone all the same,
   * and showing them an account they deleted is worse than a 404.
   */
  it('reports a deleted account as gone', async () => {
    const user = await users.findById('user-1', 'user-1');
    user?.softDelete();
    if (user) await uow.run(() => users.save(user));

    await expect(resolver.me(alice)).rejects.toBeInstanceOf(NotFoundException);
  });

  /** A machine caller has no member row, no profile and no devices. */
  it('is member-only', () => {
    expect(Reflect.getMetadata(REQUIRED_KIND, MeResolver.prototype.me)).toBe('user');
  });
});

describe('the devices queries', () => {
  let uow: InMemoryUnitOfWork;
  let resolver: MyDevicesResolver;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);
    const devices = new InMemoryDeviceRepository(uow);
    resolver = new MyDevicesResolver(new DevicesQueryHandler(devices, users, env));

    await uow.run(async () => {
      await users.save(member('user-1'));
      await users.save(member('user-2'));
      await devices.save(
        Device.register({
          id: 'device-1',
          userId: 'user-1',
          installId: 'install-1',
          kind: 'android',
          name: null,
          pushToken: 'a-push-token',
          lastSeenAt: now,
          createdAt: now,
        }),
      );
      await devices.save(
        Device.register({
          id: 'device-2',
          userId: 'user-2',
          installId: 'install-2',
          kind: 'ios',
          name: null,
          pushToken: null,
          lastSeenAt: now,
          createdAt: now,
        }),
      );
    });
  });

  it("returns only the caller's own devices", async () => {
    const mine = await resolver.myDevices(alice);

    expect(mine.map((device) => device.id)).toEqual(['device-1']);
  });

  /**
   * Whether a device can be reached is what a client renders. The token is a
   * credential for somebody else's service, and a read edge that hands it out
   * has published it to every extension the member has installed.
   */
  it('reports whether push works, never the token', async () => {
    const [mine] = await resolver.myDevices(alice);

    expect(mine?.hasPush).toBe(true);
    expect(JSON.stringify(mine)).not.toContain('a-push-token');
  });

  /**
   * `myDevices` cannot be asked about somebody else; this one can, which is
   * exactly why it carries the role.
   */
  it('guards the by-user variant with the admin role', () => {
    expect(Reflect.getMetadata(REQUIRED_ROLES, MyDevicesResolver.prototype.devicesOf)).toEqual([
      'admin',
    ]);
    expect(Reflect.getMetadata(REQUIRED_ROLES, MyDevicesResolver.prototype.myDevices)).toBeUndefined();
  });
});

/**
 * The codes a client branches on, kept the same across transports.
 *
 * The SDK refreshes on `token_expired` and signs out on anything else. If this
 * transport reported an expired token as a bare error, an expired token would
 * refresh on a command and sign the member out on a query — a difference nobody
 * debugs twice.
 */
describe('graphql error codes', () => {
  const wrap = (status: number, message: string) =>
    new GraphQLError('boom', {
      originalError: Object.assign(new Error(message), { status, response: { message } }),
    });

  it('marks an expired token so the client refreshes rather than signing out', () => {
    const formattedError = formatError(
      { message: 'boom' },
      wrap(401, 'token_expired'),
    );

    expect(formattedError.extensions?.code).toBe('token_expired');
  });

  it('tells an invalid token apart from an expired one', () => {
    expect(formatError({ message: 'boom' }, wrap(401, 'token_invalid')).extensions?.code).toBe(
      'unauthorized',
    );
  });

  it('maps a refusal and a miss to their own codes', () => {
    expect(formatError({ message: 'boom' }, wrap(403, 'nope')).extensions?.code).toBe('forbidden');
    expect(formatError({ message: 'boom' }, wrap(404, 'gone')).extensions?.code).toBe('not_found');
  });

  /**
   * Relabelling an unrecognised error `internal` is how a fixable client
   * mistake becomes an unexplained 500 in a log nobody reads.
   */
  it('leaves anything else as it found it', () => {
    const untouched = { message: 'boom', extensions: { code: 'BAD_USER_INPUT' } };

    expect(formatError(untouched, new Error('not a graphql error')).extensions?.code).toBe(
      'BAD_USER_INPUT',
    );
  });
});
