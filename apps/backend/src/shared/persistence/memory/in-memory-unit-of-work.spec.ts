import { describe, expect, it } from 'vitest';
import { InMemoryUserRepository } from '../../../contexts/identity/infrastructure/in-memory-identity.repositories.js';
import { User } from '../../../contexts/identity/domain/user.aggregate.js';
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.js';

const now = new Date('2026-09-09T10:00:00.000Z');

function member(id: string): User {
  return User.register(
    {
      id,
      email: `${id}@example.test`,
      displayName: null,
      passwordHash: 'hashed',
      googleSub: null,
      role: 'user',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {},
  );
}

/**
 * The unit of work the handler specs bind, specified directly.
 *
 * It matters more than an in-memory helper usually would, because it is the only
 * thing in the repository that can tell a handler which writes its store will
 * commit together. Three reviews in a row found comments claiming "in the same
 * transaction" above code that opened none — the row went in, the outbox entry
 * went in separately, and a crash between them dropped a domain event with no
 * trace that it was ever owed. Nothing failed, because nothing checked.
 */
describe('the in-memory unit of work', () => {
  it('refuses a write that raises events outside a transaction', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);

    // This is the shape of the defect, reproduced: a handler calls `save` with
    // no `run` around it. Against PostgreSQL it would succeed twice over and
    // look fine; here it says what is wrong with it.
    await expect(users.save(member('user-1'))).rejects.toThrow(/outside a unit of work/);
  });

  it('rolls the row and its events back together', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);

    const failed = uow.run(async () => {
      await users.save(member('user-1'));
      throw new Error('the second write failed');
    });
    await expect(failed).rejects.toThrow('the second write failed');

    // Both, and this is the pairing the outbox exists for: a surviving event
    // for a row that was rolled back is the same bug from the other side.
    expect(users.byId.size).toBe(0);
    expect(users.events).toEqual([]);
    expect(uow.rolledBack).toBe(true);
  });

  it('keeps both when the transaction commits', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);

    await uow.run(() => users.save(member('user-1')));

    expect([...users.byId.keys()]).toEqual(['user-1']);
    expect(users.events.map((event) => event.name)).toEqual(['identity.UserRegistered']);
    expect(uow.rolledBack).toBe(false);
  });

  it('joins a nested run rather than committing half way through', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);

    // `sign-in` nests three handlers this way, and `google-sign-in` nests four.
    // If the inner `run` committed on its own, the outer failure below would
    // leave the first member behind.
    const failed = uow.run(async () => {
      await uow.run(() => users.save(member('user-1')));
      await users.save(member('user-2'));
      throw new Error('the outer work failed');
    });
    await expect(failed).rejects.toThrow('the outer work failed');

    expect(users.byId.size).toBe(0);
  });

  it('runs an onCommit callback after the commit, and not at all without one', async () => {
    const uow = new InMemoryUnitOfWork();
    const users = new InMemoryUserRepository(uow);
    const sideEffects: string[] = [];

    await uow.run(async () => {
      uow.onCommit(async () => {
        sideEffects.push('sent');
      });
      await users.save(member('user-1'));
      // Not yet: a nudge for a row that is still uncommitted is the thing
      // `onCommit` exists to prevent.
      expect(sideEffects).toEqual([]);
    });
    expect(sideEffects).toEqual(['sent']);

    const failed = uow.run(async () => {
      uow.onCommit(async () => {
        sideEffects.push('should not happen');
      });
      throw new Error('rolled back');
    });
    await expect(failed).rejects.toThrow('rolled back');

    // The photo deletion in `purge-on-deleted` hangs off this. It is the one
    // step there that cannot be undone, so it must never run for a transaction
    // that failed.
    expect(sideEffects).toEqual(['sent']);
  });
});
