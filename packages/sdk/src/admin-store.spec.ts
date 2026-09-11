import { describe, expect, it } from 'vitest';
import { AdminStore, MemberGone, type MemberSummary } from './admin-store.js';
import { ApiError, type BotvyClient } from './client.js';

function member(id: string, over: Partial<MemberSummary> = {}): MemberSummary {
  return {
    id,
    email: `${id}@example.invalid`,
    displayName: null,
    role: 'user',
    status: 'active',
    createdAt: '2026-09-01T00:00:00.000Z',
    lastLoginAt: null,
    deviceCount: 0,
    ...over,
  };
}

/** A client that answers the members query and whatever the act asks for. */
function fakeClient(act: () => Promise<unknown>, members: MemberSummary[]): BotvyClient {
  return {
    async query() {
      return { users: { nodes: members, endCursor: null } };
    },
    async rest() {
      return act();
    },
  } as unknown as BotvyClient;
}

describe('AdminStore, acting on one member', () => {
  it('drops the row and says so when the account has gone (T1021)', async () => {
    const store = new AdminStore(
      fakeClient(
        () => Promise.reject(new ApiError(404, null, 'no such account')),
        [member('a'), member('b')],
      ),
    );
    await store.search({});
    expect(store.members.map((row) => row.id)).toEqual(['a', 'b']);

    /*
     * The Owner's list is a snapshot. Between it being drawn and a button being
     * pressed, the member can delete their own account — so the act has to be
     * able to say "that row is wrong" rather than only "no".
     */
    await expect(store.ban('a')).rejects.toBeInstanceOf(MemberGone);

    expect(store.members.map((row) => row.id)).toEqual(['b']);
  });

  it('keeps the row when the refusal is a guard rail', async () => {
    // 409 is "the rule says no", not "the row is wrong". Dropping the row here
    // would delete the last administrator from the Owner's screen for trying to
    // demote them, which is the opposite of what the refusal means.
    const store = new AdminStore(
      fakeClient(
        () => Promise.reject(new ApiError(409, null, 'this is the only administrator')),
        [member('a', { role: 'admin' })],
      ),
    );
    await store.search({});

    await expect(store.setRole('a', 'user')).rejects.toThrow('only administrator');

    expect(store.members.map((row) => row.id)).toEqual(['a']);
    expect(store.members[0]?.role).toBe('admin');
  });

  it('applies the act locally rather than re-reading the list', async () => {
    // Re-reading would reshuffle a cursor-paged list under the Owner's cursor,
    // and page two of a changed list is not the same page two.
    const store = new AdminStore(
      fakeClient(() => Promise.resolve({ sessionsEnded: 2 }), [member('a')]),
    );
    await store.search({});

    const result = await store.ban('a');

    expect(result).toEqual({ sessionsEnded: 2 });
    expect(store.members[0]?.status).toBe('banned');
  });
});
