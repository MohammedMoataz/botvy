import type { Model } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { MongoOutboxStore, type OutboxDoc } from './mongo-outbox.store.js';

/**
 * What the relay does with a resume token it cannot resume from.
 *
 * This is the failure 028's restore rehearsal produced and nothing caught: a
 * `mongorestore --drop` — the procedure `docs/restore.md` prescribes —
 * recreates `outbox` under a new identity, so the token saved against the old
 * one can never be resumed again. MongoDB does not call that
 * `ChangeStreamHistoryLost`; the driver marks the stream closed and iterating
 * it throws a plain `MongoAPIError: ChangeStream is closed`, with no error
 * code. The store used to clear the token only on code 286, so the relay
 * reopened the same dead stream every thirty seconds for eight hours —
 * delivering nothing, on a system where `/health` was the only place it showed.
 *
 * The cases below drive the store with a fake change stream, because what is
 * being pinned down is the store's *reaction* to a stream that dies, and a
 * real replica set would only make that harder to provoke on demand.
 */

/** How the fake stream behaves when the relay iterates it. */
type Ending =
  | { throws: Error }
  /** Ends on the spot, which is what the server does to a bad resume. */
  | { ends: true }
  /** Something happens first — the shutdown path closing the stream. */
  | { first: () => Promise<void> };

function fakeStream(ending: Ending): AsyncIterable<unknown> & {
  closed: boolean;
  close(): Promise<void>;
} {
  const stream = {
    closed: false,
    async close(): Promise<void> {
      stream.closed = true;
    },
    [Symbol.asyncIterator]: () => ({
      async next(): Promise<IteratorResult<unknown>> {
        if ('throws' in ending) throw ending.throws;
        if ('first' in ending) await ending.first();
        return { value: undefined, done: true };
      },
    }),
  };
  return stream;
}

/** The two models the store touches, and a record of what it wrote. */
function storeWith(stream: AsyncIterable<unknown>) {
  const writes: { token: unknown }[] = [];
  const outbox = {
    collection: { watch: () => stream },
  } as unknown as Model<OutboxDoc>;
  const state = {
    updateOne: async (
      _filter: unknown,
      update: { $set: { resumeToken: unknown } },
    ) => {
      writes.push({ token: update.$set.resumeToken });
    },
  };
  return {
    store: new MongoOutboxStore(outbox, state as never),
    writes,
  };
}

/** Runs the watch to exhaustion, keeping whatever it threw. */
async function drive(
  store: MongoOutboxStore,
  token: unknown,
): Promise<Error | null> {
  try {
    for await (const _ of store.watch(token)) {
      // These streams yield nothing; the point is how they end.
    }
    return null;
  } catch (error) {
    return error as Error;
  }
}

const TOKEN = { _data: 'a-saved-resume-token' };

describe('the outbox change stream, when a resume token is no good', () => {
  it('forgets a token whose stream throws, whatever the error says', async () => {
    // No `code` on the error, which is exactly what the restore produced.
    const { store, writes } = storeWith(
      fakeStream({ throws: new Error('ChangeStream is closed') }),
    );

    const thrown = await drive(store, TOKEN);

    expect(thrown?.message).toBe('ChangeStream is closed');
    expect(writes).toEqual([{ token: null }]);
  });

  it('forgets a token whose stream ends the moment it resumes', async () => {
    // The other shape of the same failure: no throw, the server just ends it.
    const { store, writes } = storeWith(fakeStream({ ends: true }));

    expect(await drive(store, TOKEN)).toBeNull();
    expect(writes).toEqual([{ token: null }]);
  });

  it('still forgets one that fell off the oplog', async () => {
    const { store, writes } = storeWith(
      fakeStream({
        throws: Object.assign(
          new Error('resume point may no longer be in the oplog'),
          { code: 286 },
        ),
      }),
    );

    await drive(store, TOKEN);

    expect(writes).toEqual([{ token: null }]);
  });

  it('writes nothing when there was no token to blame', async () => {
    const { store, writes } = storeWith(
      fakeStream({ throws: new Error('ChangeStream is closed') }),
    );

    await drive(store, null);

    // A stream that dies on its own is the runtime's problem to restart. There
    // is no token here, so there is nothing to clear and nothing to write —
    // and a store that wrote anyway would hide the difference between the two.
    expect(writes).toEqual([]);
  });

  it('keeps the token when the shutdown path closed the stream', async () => {
    // `close()` nulls the store's own handle, which is how the watch tells
    // "we stopped this" from "the server did". Clearing here would make every
    // ordinary restart replay from the beginning of the outbox.
    let store!: MongoOutboxStore;
    const built = storeWith(fakeStream({ first: () => store.close() }));
    store = built.store;

    expect(await drive(store, TOKEN)).toBeNull();
    expect(built.writes).toEqual([]);
  });
});
