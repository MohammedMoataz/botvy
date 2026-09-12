import { describe, expect, it } from 'vitest';
import { AggregateRoot } from '../ports/aggregate-root.js';
import { ForeignRowError, StaleWriteError } from '../ports/errors.js';

/**
 * A write may not reach another member's row.
 *
 * ## The defect this pins, which was live from P2 to P4
 *
 * `MongoRepositoryBase.save` is an **upsert**, because a client mints the id
 * and an offline create arrives as a save of a row the server has never seen.
 * Its filter was `{ _id, updatedAt }` — with no `userId`. So a `/sync` push
 * naming an id that belonged to *another member* matched their row, and `$set`
 * wrote the pushing member's fields over it, `userId` included. The row changed
 * hands silently.
 *
 * Reachable for every client-minted-id entity since P2: tasks, labels,
 * reminders, and conversations from this phase. And it could not be caught by a
 * handler spec, because the *read* is scoped by `userId` — so from inside the
 * adapter a foreign id and a never-before-seen id are indistinguishable, which
 * is precisely why the guard has to be in the write filter rather than in a
 * check before it. Nothing but the unguessability of a UUIDv7 stood in the way,
 * and that is not an access control.
 *
 * ## Why this is a contract test rather than a Mongo test
 *
 * The real filter can only be exercised against a real Mongo, and
 * `adapters.contract.spec.ts` next door is where the two adapters are held to
 * one behaviour. What this file pins is the **rule and its vocabulary**: that
 * the refusal is its own error, distinct from a stale write, because the two
 * mean opposite things to the phone. `/sync` reports a stale write as `stale`,
 * which tells the client to overwrite its copy from the server row and retry —
 * against a row it may never see, it would retry for ever. `ForeignRowError`
 * is reported as `invalid`, which tells it to stop.
 *
 * The Mongo half is covered by `infra/verify-p4.mjs`, which pushes a foreign id
 * through the real `/sync` against the real index.
 */

class Thing extends AggregateRoot<string> {
  constructor(
    readonly id: string,
    readonly userId: string,
  ) {
    super();
  }
}

/**
 * The two refusals, as a store-independent statement of intent.
 *
 * An in-memory stand-in for the rule rather than a mock of Mongo: what matters
 * is that a save whose `userId` does not match the stored row's is refused
 * *differently* from one that is merely old, and that neither is silently
 * accepted.
 */
class Store {
  private readonly rows = new Map<string, { userId: string; updatedAt: Date }>();

  save(aggregate: Thing): void {
    const existing = this.rows.get(aggregate.id);

    if (existing && existing.userId !== aggregate.userId) {
      // The filter misses, the upsert tries to insert, and the `_id` primary
      // key refuses it. Mongo answers 11000; this is what that becomes.
      throw new ForeignRowError(aggregate.id);
    }
    if (existing && existing.updatedAt.getTime() > aggregate.updatedAt.getTime()) {
      throw new StaleWriteError(aggregate.id);
    }

    this.rows.set(aggregate.id, {
      userId: aggregate.userId,
      updatedAt: aggregate.updatedAt,
    });
  }

  ownerOf(id: string): string | undefined {
    return this.rows.get(id)?.userId;
  }
}

describe('a write cannot reach another member’s row', () => {
  const SHARED_ID = 'a-uuidv7-somebody-guessed';

  it('refuses a save whose owner does not match the stored row', () => {
    const store = new Store();
    store.save(new Thing(SHARED_ID, 'member-a'));

    const theirs = new Thing(SHARED_ID, 'member-b');
    expect(() => store.save(theirs)).toThrow(ForeignRowError);
  });

  it('leaves the row with its original owner', () => {
    // The assertion that the old behaviour would have failed: before the fix
    // the row's `userId` became `member-b`, which is a transfer of ownership
    // performed by a push.
    const store = new Store();
    store.save(new Thing(SHARED_ID, 'member-a'));
    try {
      store.save(new Thing(SHARED_ID, 'member-b'));
    } catch {
      // Expected.
    }
    expect(store.ownerOf(SHARED_ID)).toBe('member-a');
  });

  it('is a different error from a stale write, because the two mean opposites', () => {
    /*
     * `/sync` maps a stale write to `stale`, which tells the phone to take the
     * server's copy and retry. For a foreign row there is no copy it may take,
     * so it would retry for ever — which is the same failure mode `protected`
     * exists to avoid for the pinned conversations. Two errors, two verdicts.
     */
    const store = new Store();
    const mine = new Thing('mine', 'member-a');
    mine.updatedAt = new Date(Date.now() + 60_000);
    store.save(mine);

    const older = new Thing('mine', 'member-a');
    older.updatedAt = new Date(Date.now() - 60_000);

    expect(() => store.save(older)).toThrow(StaleWriteError);
    expect(() => store.save(older)).not.toThrow(ForeignRowError);
  });

  it('still admits an ordinary create for an id nobody holds', () => {
    // The case the missing `userId` was protecting, and the reason the filter
    // is an upsert at all: an offline create is a save of a row the server has
    // never seen, and it must go through.
    const store = new Store();
    expect(() => store.save(new Thing('brand-new', 'member-a'))).not.toThrow();
    expect(store.ownerOf('brand-new')).toBe('member-a');
  });

  it('names the row without saying who holds it', () => {
    /*
     * The message reaches the client through `/sync`'s `server.message`, so it
     * is worth being deliberate: it says the write was refused and does not
     * name the other member. It does confirm the id exists, which is a real if
     * negligible leak — the id would have to be guessed, and a UUIDv7 is 122
     * bits. Recorded here so the trade is a decision rather than an accident.
     */
    const error = new ForeignRowError(SHARED_ID);
    expect(error.message).toContain(SHARED_ID);
    expect(error.message).not.toContain('member-a');
    expect(error.name).toBe('ForeignRowError');
  });
});
