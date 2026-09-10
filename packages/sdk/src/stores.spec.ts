import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthStore,
  EmailTaken,
  GoogleLinkRequired,
  RegistrationClosed,
} from './auth-store.js';
import { ApiError, BotvyClient } from './client.js';
import { newId } from './ids.js';
import { DuplicateLabelName, LabelsStore } from './labels-store.js';
import { ProfileStore } from './profile-store.js';
import {
  MAX_PUSH_ATTEMPTS,
  MemorySyncTable,
  SyncStore,
  type PendingPush,
  type SyncResponse,
} from './sync-store.js';
import { TasksStore, type TaskRow } from './tasks-store.js';
import { TokenStore, inMemoryStorage } from './tokens.js';

/** `fetch` accepts three shapes for its first argument; only one is a string. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.toString() : input.url;
}

interface Reply {
  status?: number;
  body?: unknown;
}

/** Records every call, and answers whatever the test queued for that path. */
class FakeApi {
  readonly calls: Array<{ method: string; path: string; body: unknown }> = [];
  #replies = new Map<string, Reply[]>();

  #graphql = new Map<string, Reply[]>();

  on(method: string, path: string, ...replies: Reply[]): this {
    this.#replies.set(`${method} ${path}`, replies);
    return this;
  }

  /**
   * Answers a read, keyed on its operation name rather than on a path.
   *
   * Every GraphQL request is a POST to the same `/graphql`, so a path-keyed
   * fake cannot tell one read from another. The operation name is what the
   * documents in the stores already carry, and naming them is what makes this
   * possible - an anonymous `query { ... }` would be unmockable here, which is
   * a small reason to keep naming them.
   */
  onQuery(operation: string, ...replies: Reply[]): this {
    this.#graphql.set(operation, replies);
    return this;
  }

  /**
   * Accepts every shape `fetch` does, so the fake is substitutable for the real
   * thing rather than for the narrower one the tests happen to call.
   */
  readonly fetch: typeof fetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    const path = requestUrl(url).replace(/^.*\/api\/v1/, '');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    this.calls.push({ method, path, body });

    if (path === '/graphql') {
      const document = String((body as { query?: unknown } | undefined)?.query ?? '');
      const operation = /query\s+(\w+)/.exec(document)?.[1] ?? '';
      const pending = this.#graphql.get(operation);
      const answer = (pending && (pending.length > 1 ? pending.shift() : pending[0])) ?? {
        status: 200,
      };
      // Wrapped in `data`, because that is the envelope the real server sends
      // and the client unwraps. A fake that returned the bare object would let
      // a client that forgot to unwrap pass its tests.
      return new Response(JSON.stringify({ data: answer.body ?? {} }), {
        status: answer.status ?? 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const queued = this.#replies.get(`${method} ${path}`);
    const reply = (queued && (queued.length > 1 ? queued.shift() : queued[0])) ?? { status: 200 };

    const status = reply.status ?? 200;
    // A 204 may not carry a body — `new Response('{}', {status: 204})` throws,
    // which is the runtime telling you the fake was lying about the protocol.
    if (status === 204 || status === 304) return new Response(null, { status });

    return new Response(reply.body === undefined ? '{}' : JSON.stringify(reply.body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

const session = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  userId: 'user-1',
  email: 'member@example.test',
  role: 'user' as const,
  deviceId: null,
  mustChangePassword: false,
};

function build(api: FakeApi) {
  const tokens = new TokenStore(inMemoryStorage());
  const client = new BotvyClient({ baseUrl: '', tokens, fetchImpl: api.fetch });
  const auth = new AuthStore(client, tokens);
  return { tokens, client, auth };
}

/**
 * The wiring the frontend and the extension both use.
 *
 * One store, whose `refreshFn` reaches the auth store through a closure — the
 * cycle broken exactly as `stores/root.ts` and `lib/store.ts` break it. Tests
 * that build two stores cannot see the re-entrant path at all.
 */
function buildWired(api: FakeApi) {
  let auth: AuthStore;
  const tokens = new TokenStore(inMemoryStorage(), (refreshToken) =>
    auth.refreshFn(refreshToken),
  );
  const client = new BotvyClient({ baseUrl: '', tokens, fetchImpl: api.fetch });
  auth = new AuthStore(client, tokens);
  return { tokens, client, auth };
}

describe('AuthStore', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();
  });

  it('adopts the tokens and the member on a successful sign-in', async () => {
    api.on('POST', '/auth/login', { body: session });
    const { auth, tokens } = build(api);

    const member = await auth.login('member@example.test', 'a-password');

    expect(member.userId).toBe('user-1');
    expect(auth.signedIn).toBe(true);
    expect(tokens.accessToken).toBe('access-1');
  });

  it('tells subscribers when somebody signs in and out', async () => {
    api.on('POST', '/auth/login', { body: session });
    api.on('POST', '/auth/logout', { body: { signedOut: true } });
    const { auth } = build(api);
    const seen: Array<string | null> = [];
    auth.subscribe((member) => seen.push(member?.userId ?? null));

    await auth.login('member@example.test', 'a-password');
    await auth.logout();

    expect(seen).toEqual(['user-1', null]);
  });

  it('sends the device when one is given, so the session is bound to it', async () => {
    api.on('POST', '/auth/login', { body: { ...session, deviceId: 'dev-1' } });
    const { auth } = build(api);

    await auth.login('member@example.test', 'a-password', {
      installId: 'install-1',
      kind: 'android',
    });

    expect(api.calls[0]?.body).toMatchObject({
      device: { installId: 'install-1', kind: 'android' },
    });
  });

  /**
   * A member who pressed sign-out on a flaky connection must not be left
   * looking at their own data.
   */
  it('clears the session even when the logout request fails', async () => {
    api.on('POST', '/auth/login', { body: session });
    api.on('POST', '/auth/logout', { status: 500, body: { message: 'nope' } });
    const { auth, tokens } = build(api);
    await auth.login('member@example.test', 'a-password');

    await auth.logout().catch(() => undefined);

    expect(auth.signedIn).toBe(false);
    expect(tokens.tokens).toBeNull();
  });

  /**
   * The API revokes every session on a password change, including this one, so
   * the tokens in hand are already dead — keeping them would make the next
   * request look like a replay.
   */
  it('signs out after changing the password', async () => {
    api.on('POST', '/auth/login', { body: session });
    api.on('POST', '/auth/password', { body: { changed: true, sessionsEnded: 2 } });
    const { auth } = build(api);
    await auth.login('member@example.test', 'a-password');

    await auth.changePassword('a-password', 'a-longer-password');

    expect(auth.signedIn).toBe(false);
  });

  it('reports a closed installation distinctly from a taken address', async () => {
    api.on('POST', '/auth/register', { status: 403, body: { message: 'closed' } });
    const closed = build(api);
    await expect(
      closed.auth.register({ email: 'a@b.test', password: 'x'.repeat(8), passwordConfirm: 'x'.repeat(8) }),
    ).rejects.toBeInstanceOf(RegistrationClosed);

    api.on('POST', '/auth/register', { status: 409, body: { message: 'taken' } });
    const taken = build(api);
    await expect(
      taken.auth.register({ email: 'a@b.test', password: 'x'.repeat(8), passwordConfirm: 'x'.repeat(8) }),
    ).rejects.toBeInstanceOf(EmailTaken);
  });

  /**
   * The caller has something specific to do about this one: collect the
   * password and call `googleLink`. A flat 409 leaves the UI telling the member
   * the address is taken, and they go and register a second account.
   */
  it('turns a link_required conflict into a typed error carrying the address', async () => {
    api.on('POST', '/auth/google', {
      status: 409,
      body: { code: 'link_required', email: 'member@example.test' },
    });
    const { auth } = build(api);

    const refused = await auth.google('id-token').catch((error: Error) => error);

    expect(refused).toBeInstanceOf(GoogleLinkRequired);
    expect((refused as GoogleLinkRequired).email).toBe('member@example.test');
  });

  it('signs in through the link path once the password is supplied', async () => {
    api.on('POST', '/auth/google/link', { body: session });
    const { auth } = build(api);

    await auth.googleLink('id-token', 'a-password');

    expect(auth.signedIn).toBe(true);
  });

  /**
   * The whole reason the refresh function lives here: a refusal must sign the
   * store out too, or the tokens are gone while the UI still believes somebody
   * is logged in.
   */
  /**
   * Wired the way the surfaces actually wire it: **one** token store, whose
   * `refreshFn` is the auth store's, and whose client is the same client the
   * auth store refreshes through.
   *
   * The previous version of this test built two stores — the one handed to the
   * client had no `refreshFn` — so the re-entrant path never ran and it passed
   * against a client that deadlocked in production. The comment claimed the
   * opposite. Sharing one store is the whole test.
   */
  it('signs out when a refresh is refused, and says why', async () => {
    api.on('POST', '/auth/login', { body: session });
    api.on('POST', '/auth/refresh', { status: 401, body: { code: 'session_replay' } });

    const { auth, tokens } = buildWired(api);
    await auth.login('member@example.test', 'a-password');

    expect(await tokens.refresh()).toBeNull();
    expect(auth.signedIn).toBe(false);
    expect(auth.lastSignOutReason).toBe('session_replay');
  });

  /**
   * The deadlock itself, asserted by a timeout rather than by reasoning.
   *
   * A 401 from `/auth/refresh` used to trigger a refresh, which returned the
   * in-flight promise that was waiting on that very response. Nothing settled,
   * `#inFlight` stayed poisoned, and every later request hung too — silently,
   * which is why it survived review.
   */
  it('does not hang when the refresh itself is refused', async () => {
    api.on('POST', '/auth/login', { body: session });
    api.on('POST', '/auth/refresh', { status: 401, body: { code: 'token_expired' } });

    const { auth, tokens } = buildWired(api);
    await auth.login('member@example.test', 'a-password');

    const settled = await Promise.race([
      tokens.refresh().then(() => 'settled' as const),
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 250)),
    ]);

    expect(settled).toBe('settled');
  });

  /** And the store is usable afterwards, rather than poisoned for good. */
  it('leaves the token store working after a refused refresh', async () => {
    api.on('POST', '/auth/login', { body: session });
    api.on('POST', '/auth/refresh', { status: 401, body: { code: 'token_expired' } });

    const { auth, tokens } = buildWired(api);
    await auth.login('member@example.test', 'a-password');
    await tokens.refresh();

    expect(tokens.refreshing).toBe(false);
    expect(await tokens.refresh()).toBeNull();
  });

  it('returns the rotated pair when a refresh succeeds', async () => {
    api.on('POST', '/auth/refresh', {
      body: { accessToken: 'access-2', refreshToken: 'refresh-2' },
    });
    const { auth } = build(api);

    expect(await auth.refreshFn('refresh-1')).toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
  });

  it('knows an administrator from a member', async () => {
    api.on('POST', '/auth/login', { body: { ...session, role: 'admin' } });
    const { auth } = build(api);

    await auth.login('owner@example.test', 'a-password');

    expect(auth.isAdmin).toBe(true);
  });

  it('escapes a device id in the path rather than pasting it in', async () => {
    api.on('DELETE', '/auth/devices/a%2Fb', { status: 204 });
    const { auth } = build(api);

    await auth.removeDevice('a/b');

    expect(api.calls.at(-1)?.path).toBe('/auth/devices/a%2Fb');
  });
});

/**
 * The read edge, as the stores meet it.
 *
 * GraphQL answers 200 with an `errors` array, so a caller branching on the HTTP
 * status alone reads every refusal as success. The server sets
 * `extensions.code` precisely so both transports can be branched on the same
 * way, and these pin that translation - `AuthStore` reads `error.body.code` to
 * decide between refreshing and signing the member out, and a read that
 * reported an expired token differently from a command would end a session that
 * was still good.
 */
describe('a refused read', () => {
  const errorReply = (code: string, message = 'nope') =>
    new Response(
      JSON.stringify({ errors: [{ message, extensions: { code } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  const clientAnswering = (response: Response) =>
    new BotvyClient({
      baseUrl: '',
      fetchImpl: async () => response.clone(),
    });

  it('carries the code where the stores already look for it', async () => {
    const client = clientAnswering(errorReply('token_expired', 'jwt expired'));

    const error = await client.query('query Me { me { id } }').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(((error as ApiError).body as { code?: string }).code).toBe('token_expired');
  });

  it('maps a refusal and a miss to the statuses a caller branches on', async () => {
    for (const [code, status] of [
      ['forbidden', 403],
      ['not_found', 404],
      ['unauthorized', 401],
    ] as const) {
      const error = await clientAnswering(errorReply(code))
        .query('query Me { me { id } }')
        .catch((e: unknown) => e);
      expect((error as ApiError).status).toBe(status);
    }
  });

  /** A 200 with an unrecognised code is still a failure, not an empty answer. */
  it('does not pass an unknown error off as success', async () => {
    const error = await clientAnswering(errorReply('BAD_USER_INPUT'))
      .query('query Me { me { id } }')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
  });

  /**
   * A 502 from the edge is an HTML page, not a GraphQL document. Parsing it as
   * one throws a `SyntaxError` that tells the caller nothing about what failed.
   */
  it('reports a transport failure as one', async () => {
    const client = new BotvyClient({
      baseUrl: '',
      fetchImpl: async () =>
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
    });

    const error = await client.query('query Me { me { id } }').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as Error).message).toContain('/graphql');
  });
});

describe('ProfileStore', () => {
  let api: FakeApi;

  const profile = {
    userId: 'user-1',
    timezone: 'Africa/Cairo',
    locale: 'en',
    metrics: [],
  };
  const preferences = {
    userId: 'user-1',
    planTomorrowTime: '21:00',
    endOfDayTime: '22:00',
    morningBriefingTime: '08:00',
    nextPracticeCutoff: '21:00',
    leadTimes: ['1h', '0m'],
    quietHours: { from: '22:00', to: '07:00' },
    weekStartsOn: 'monday',
    checkinEnabled: true,
    meetingDurationMin: 30,
    mealMode: 'llm',
    aiSuggestions: true,
  };

  beforeEach(() => {
    api = new FakeApi()
      .onQuery('ProfileAndPreferences', { body: { profile, preferences } });
  });

  const store = () =>
    new ProfileStore(new BotvyClient({ baseUrl: '', fetchImpl: api.fetch }));

  /** Two round trips for one render is two chances to show a half-loaded form. */
  it('fetches both halves together', async () => {
    const profiles = store();

    await profiles.load();

    expect(profiles.ready).toBe(true);
    expect(profiles.profile?.timezone).toBe('Africa/Cairo');
    expect(profiles.preferences?.endOfDayTime).toBe('22:00');
  });

  it('is not ready until both have arrived', () => {
    expect(store().ready).toBe(false);
  });

  it('notifies subscribers around a load', async () => {
    const profiles = store();
    let notifications = 0;
    profiles.subscribe(() => {
      notifications += 1;
    });

    await profiles.load();

    expect(notifications).toBeGreaterThanOrEqual(2);
  });

  /**
   * The server normalises: it lower-cases and de-duplicates the tag lists. A
   * store that echoed the request back would show `Peanuts` while the server
   * holds `peanuts`, and the next save would look like a change when it is not.
   */
  it('takes the server\'s normalised answer, not the values it sent', async () => {
    api.on('PATCH', '/profile', {
      body: { ...profile, allergies: ['peanuts'] },
    });
    const profiles = store();

    const updated = await profiles.updateProfile({ allergies: ['  Peanuts '] });

    expect(updated.allergies).toEqual(['peanuts']);
    expect(profiles.profile?.allergies).toEqual(['peanuts']);
  });

  it('drops userId from a preferences patch, which the API would refuse', async () => {
    api.on('PATCH', '/preferences', { body: { changed: ['endOfDayTime'] } });
    const profiles = store();
    await profiles.load();

    await profiles.updatePreferences({ userId: 'user-1', endOfDayTime: '23:00' });

    const patch = api.calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({ endOfDayTime: '23:00' });
  });

  it('re-reads the preferences after a patch rather than guessing', async () => {
    api.on('PATCH', '/preferences', { body: { changed: ['endOfDayTime'] } });
    api.onQuery('Preferences', { body: { preferences: { ...preferences, endOfDayTime: '23:00' } } });
    const profiles = store();
    await profiles.load();

    const after = await profiles.updatePreferences({ endOfDayTime: '23:00' });

    expect(after.endOfDayTime).toBe('23:00');
  });

  it('forgets everything on clear, so the next member sees nothing of the last', async () => {
    const profiles = store();
    await profiles.load();

    profiles.clear();

    expect(profiles.profile).toBeNull();
    expect(profiles.ready).toBe(false);
  });

  it('stamps a metric with now when the caller does not', async () => {
    api.on('POST', '/profile/metrics', { body: profile });
    const profiles = store();

    await profiles.recordMetric({ weightKg: 81 });

    const sent = api.calls.at(-1)?.body as { weightKg: number; recordedAt: string } | undefined;
    expect(sent).toMatchObject({ weightKg: 81 });
    expect(sent?.recordedAt).toBeTypeOf('string');
  });
});

/** A task row with every field, so a test only says the part it cares about. */
function taskRow(over: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    title: 'a task',
    notes: null,
    dueAt: null,
    allDay: false,
    priority: 4,
    labelId: null,
    label: null,
    status: 'open',
    completedAt: null,
    repeats: false,
    recurrenceMode: null,
    recurrenceText: null,
    estimatedMinutes: null,
    deferCount: 0,
    source: 'app',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

/** A label row, likewise. */
function labelRow(over: { id: string } & Record<string, unknown>) {
  return {
    name: 'Work',
    color: '#123456',
    sortOrder: 0,
    openTaskCount: 0,
    updatedAt: '2026-09-01T08:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

/** A response with the whole envelope, so nothing is undefined by accident. */
function syncReply(over: Partial<SyncResponse> = {}): { body: SyncResponse } {
  return {
    body: {
      now: '2026-09-10T12:00:00.000Z',
      full: false,
      pull: {},
      accepted: {},
      rejections: [],
      pendingAlerts: [],
      ...over,
    },
  };
}

/**
 * The surfaces' own wiring: two stores, and the engine writing through their
 * tables.
 *
 * `labels` is registered before `tasks` deliberately — the protocol applies
 * parents before children so that a task snapshot can never name a label the
 * server has not heard of, and the request's `entities` array is this object's
 * key order.
 */
function buildSync(api: FakeApi) {
  const client = new BotvyClient({ baseUrl: '', fetchImpl: api.fetch });
  const labels = new LabelsStore(client);
  const tasks = new TasksStore(client);
  const sync = new SyncStore(client, {
    installId: 'install-1',
    tables: { labels: labels.table, tasks: tasks.table },
  });
  return { client, labels, tasks, sync };
}

/** The `push` map of the last request the fake saw. */
function lastPush(api: FakeApi): Record<string, PendingPush[]> {
  const body = api.calls.at(-1)?.body as { push?: Record<string, PendingPush[]> } | undefined;
  return body?.push ?? {};
}

describe('SyncStore', () => {
  let api: FakeApi;

  beforeEach(() => {
    api = new FakeApi();
  });

  it('asks for everything the first time and echoes the cursor after that', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ now: '2026-09-10T12:00:00.000Z' }),
      syncReply({ now: '2026-09-10T12:05:00.000Z' }),
    );
    const { sync } = buildSync(api);

    await sync.sync();
    const first = api.calls.at(-1)?.body as { since: string | null; entities: string[] };
    expect(first.since).toBeNull();
    expect(first.entities).toEqual(['labels', 'tasks']);
    expect(sync.cursor).toBe('2026-09-10T12:00:00.000Z');

    await sync.sync();
    const second = api.calls.at(-1)?.body as { since: string | null };
    expect(second.since).toBe('2026-09-10T12:00:00.000Z');
    expect(sync.cursor).toBe('2026-09-10T12:05:00.000Z');
  });

  /**
   * `baseUpdatedAt` is the server's own value for the version this surface last
   * pulled; `updatedAt` is when this surface edited the row. Sending the local
   * time in the base field turns every offline edit into a clock comparison,
   * which a slow handset loses.
   */
  it('takes baseUpdatedAt from the pulled server row, never from the local edit', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({
        pull: { tasks: [taskRow({ id: 't1', updatedAt: '2026-09-10T10:00:00.000Z' })] },
      }),
      syncReply(),
    );
    const { sync, tasks } = buildSync(api);
    await sync.sync();

    await sync.queue('tasks', {
      op: 'update',
      id: 't1',
      updatedAt: '2026-09-10T11:30:00.000Z',
      data: { title: 'edited offline' },
    });
    await sync.sync();

    const pushed = lastPush(api).tasks?.[0];
    expect(pushed?.baseUpdatedAt).toBe('2026-09-10T10:00:00.000Z');
    expect(pushed?.updatedAt).toBe('2026-09-10T11:30:00.000Z');
    // `attempts` is this client's bookkeeping. The API refuses unknown fields
    // rather than ignoring them, so it must not be on the wire.
    expect(pushed).not.toHaveProperty('attempts');
    expect(tasks.byId('t1')?.pendingOp).toBe('update');
  });

  it('overwrites the local row with the server row a rejection carries', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ pull: { tasks: [taskRow({ id: 't1', title: 'mine' })] } }),
      syncReply({
        rejections: [
          {
            entity: 'tasks',
            id: 't1',
            reason: 'stale',
            server: taskRow({ id: 't1', title: 'theirs', updatedAt: '2026-09-10T11:00:00.000Z' }),
          },
        ],
      }),
    );
    const { sync, tasks } = buildSync(api);
    await sync.sync();
    await sync.queue('tasks', { op: 'update', id: 't1', data: { title: 'mine' } });

    await sync.sync();

    expect(tasks.byId('t1')?.title).toBe('theirs');
    // And its base is the version it was just handed, so the retry's fast path
    // compares against the right thing.
    expect(tasks.byId('t1')?.baseUpdatedAt).toBe('2026-09-10T11:00:00.000Z');
  });

  it('deletes the local row when a rejection carries no server row', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ pull: { tasks: [taskRow({ id: 't1' })] } }),
      syncReply({ rejections: [{ entity: 'tasks', id: 't1', reason: 'gone', server: null }] }),
    );
    const { sync, tasks } = buildSync(api);
    await sync.sync();
    await sync.queue('tasks', { op: 'update', id: 't1' });

    await sync.sync();

    expect(tasks.byId('t1')).toBeNull();
  });

  /**
   * Every entity shares the rejection shape, which is exactly why the branch
   * has to come first: a refused label written through the task path corrupts
   * rather than crashes, and nothing tells you.
   */
  it('branches on entity before it touches a table', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ pull: { tasks: [taskRow({ id: 'shared-id', title: 'a task' })] } }),
      syncReply({
        rejections: [
          {
            entity: 'labels',
            id: 'shared-id',
            reason: 'stale',
            server: labelRow({ id: 'shared-id', updatedAt: '2026-09-10T11:00:00.000Z' }),
          },
        ],
      }),
    );
    const { sync, tasks, labels } = buildSync(api);
    await sync.sync();

    await sync.sync();

    expect(tasks.byId('shared-id')?.title).toBe('a task');
    expect(labels.byId('shared-id')?.name).toBe('Work');
  });

  /** A pull is later in the apply order than a rejection, so it has the last word. */
  it('applies rejections before pulls', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({
        rejections: [
          {
            entity: 'tasks',
            id: 't1',
            reason: 'stale',
            server: taskRow({ id: 't1', title: 'from the rejection' }),
          },
        ],
        pull: { tasks: [taskRow({ id: 't1', title: 'from the pull' })] },
      }),
    );
    const { sync, tasks } = buildSync(api);

    await sync.sync();

    expect(tasks.byId('t1')?.title).toBe('from the pull');
  });

  it('clears the pending marker only for the ids the server accepted', async () => {
    api.on('POST', '/sync', syncReply({ accepted: { tasks: ['t1'] } }));
    const { sync, tasks } = buildSync(api);
    tasks.table.applyServerRows([taskRow({ id: 't1' }), taskRow({ id: 't2' })]);
    await sync.queue('tasks', { op: 'update', id: 't1' });
    await sync.queue('tasks', { op: 'update', id: 't2' });

    await sync.sync();

    expect(tasks.table.pending().map((push) => push.id)).toEqual(['t2']);
    expect(tasks.byId('t1')?.pendingOp).toBeNull();
    expect(tasks.byId('t2')?.pendingOp).toBe('update');
  });

  /**
   * A delta lists what changed. Treating it as the complete set deletes every
   * row that simply did not change — which, on a quiet day, is all of them.
   */
  it('does not sweep on a delta pull', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ full: true, pull: { tasks: [taskRow({ id: 't1' }), taskRow({ id: 't2' })] } }),
      syncReply({ full: false, pull: { tasks: [taskRow({ id: 't1', title: 'edited' })] } }),
    );
    const { sync, tasks } = buildSync(api);
    await sync.sync();

    const outcome = await sync.sync();

    expect(tasks.tasks.map((row) => row.id).sort()).toEqual(['t1', 't2']);
    expect(outcome.swept).toEqual({});
  });

  it('sweeps rows the server did not send, but only on a full pull', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ full: true, pull: { tasks: [taskRow({ id: 't1' }), taskRow({ id: 't2' })] } }),
      syncReply({ full: true, pull: { tasks: [taskRow({ id: 't1' })] } }),
    );
    const { sync, tasks } = buildSync(api);
    await sync.sync();

    const outcome = await sync.sync();

    expect(tasks.tasks.map((row) => row.id)).toEqual(['t1']);
    expect(outcome.swept.tasks).toEqual(['t2']);
  });

  /**
   * The server has not seen the pending edit yet, so its silence about the row
   * is not evidence the row is gone. Sweeping it takes the member's unsent work
   * with it.
   */
  it('leaves a row with a pending operation alone during a sweep', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ full: true, pull: { tasks: [taskRow({ id: 't1' })] } }),
      syncReply({ full: true, pull: { tasks: [taskRow({ id: 't1' })] } }),
    );
    const { sync, tasks } = buildSync(api);
    await sync.sync();
    // A task created locally that the server has never heard of.
    tasks.table.applyLocal(taskRow({ id: 'local-1' }), 'create');
    await sync.queue('tasks', { op: 'create', id: 'local-1' });

    const outcome = await sync.sync();

    expect(tasks.byId('local-1')).not.toBeNull();
    expect(outcome.swept.tasks).toBeUndefined();
  });

  /** An entity the server said nothing about is not an entity the member emptied. */
  it('does not sweep an entity the response left out entirely', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({ full: true, pull: { tasks: [taskRow({ id: 't1' })] } }),
      syncReply({ full: true, pull: { tasks: [taskRow({ id: 't1' })] } }),
    );
    const { sync, labels } = buildSync(api);
    await sync.sync();
    labels.table.applyServerRows([labelRow({ id: 'l1' })]);

    await sync.sync();

    expect(labels.byId('l1')).not.toBeNull();
  });

  /**
   * Five refusals stop the re-sending. They do not throw the edit away — the
   * push stays queued and turns up in `blocked`, which is what a badge and a
   * tap-to-retry are built from. Discarding it silently is the one outcome the
   * contract forbids: the member typed something and would never learn it did
   * not survive.
   */
  it('stops re-sending after five attempts without discarding the edit', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({
        rejections: [
          {
            entity: 'tasks',
            id: 't1',
            reason: 'protected',
            server: taskRow({ id: 't1', title: 'theirs' }),
          },
        ],
      }),
      syncReply(),
    );
    const { sync, tasks } = buildSync(api);
    tasks.table.applyServerRows([taskRow({ id: 't1' })]);
    // Four refusals already behind it; this pass is the fifth.
    tasks.table.enqueue({
      op: 'update',
      id: 't1',
      baseUpdatedAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-10T11:00:00.000Z',
      attempts: MAX_PUSH_ATTEMPTS - 1,
      data: { title: 'mine' },
    });

    const refused = await sync.sync();
    expect(refused.blocked.map((push) => push.id)).toEqual(['t1']);
    expect(tasks.table.pending()).toHaveLength(1);

    // And it is off the wire from here on.
    await sync.sync();
    expect(lastPush(api).tasks).toBeUndefined();

    // Until the member asks for it again.
    await sync.retryBlocked();
    expect(tasks.table.pending()[0]?.attempts).toBe(0);
    expect(sync.blocked).toEqual([]);
  });

  /**
   * The cursor is the claim "I hold everything up to here". A failed pass holds
   * nothing, and a cursor advanced past rows that were never applied names rows
   * this client will never ask for again.
   */
  it('leaves the cursor and the queue alone when the request fails', async () => {
    api.on('POST', '/sync', syncReply(), { status: 500, body: { message: 'nope' } });
    const { sync, tasks } = buildSync(api);
    await sync.sync();
    await sync.queue('tasks', { op: 'create', id: 't1' });

    await expect(sync.sync()).rejects.toBeInstanceOf(ApiError);

    expect(sync.cursor).toBe('2026-09-10T12:00:00.000Z');
    expect(tasks.table.pending()).toHaveLength(1);
    // A pass that could not reach the server is not an attempt the server
    // judged, so nothing counts against the cap — five flights through a tunnel
    // must not badge an edit the server has no opinion about.
    expect(tasks.table.pending()[0]?.attempts).toBe(0);
    expect(sync.lastError).toBeInstanceOf(ApiError);
  });

  /**
   * A change queued while a request is on the wire is not in that request, so a
   * caller that joined the in-flight pass would be told its edit had synced
   * when the server has never seen it.
   */
  it('runs a second pass behind the one in flight rather than joining it', async () => {
    api.on('POST', '/sync', syncReply(), syncReply({ now: '2026-09-10T12:05:00.000Z' }));
    const { sync } = buildSync(api);

    const first = sync.sync();
    const second = sync.sync();
    await Promise.all([first, second]);

    expect(api.calls.filter((call) => call.path === '/sync')).toHaveLength(2);
    expect(sync.cursor).toBe('2026-09-10T12:05:00.000Z');
  });

  it('holds the pending alerts for whoever can schedule them', async () => {
    api.on(
      'POST',
      '/sync',
      syncReply({
        pendingAlerts: [
          {
            source: { kind: 'task', id: 't1', occurrenceAt: null },
            label: '1h',
            notifyAt: '2026-09-10T17:00:00.000Z',
            title: 'a task',
            body: 'in an hour',
          },
        ],
      }),
    );
    const { sync } = buildSync(api);

    await sync.sync();

    expect(sync.pendingAlerts).toHaveLength(1);
    expect(sync.pendingAlerts[0]?.label).toBe('1h');
  });

  it('forgets the cursor on reset, so the next pass is a full pull', async () => {
    api.on('POST', '/sync', syncReply());
    const { sync } = buildSync(api);
    await sync.sync();

    sync.reset();

    expect(sync.cursor).toBeNull();
  });

  it('refuses to queue a change for an entity this surface does not hold', async () => {
    const { sync } = buildSync(api);

    await expect(sync.queue('meals', { op: 'create', id: 'm1' })).rejects.toThrow(/meals/);
  });
});

describe('MemorySyncTable', () => {
  /**
   * The one rule the port cannot express, asserted where it is implemented: a
   * local edit moves `updatedAt` and must leave `baseUpdatedAt` naming the
   * server version the row was pulled at.
   */
  it('does not let a local edit touch baseUpdatedAt', () => {
    const table = new MemorySyncTable<TaskRow>();
    table.applyServerRows([taskRow({ id: 't1', updatedAt: '2026-09-10T10:00:00.000Z' })]);

    table.applyLocal(
      taskRow({ id: 't1', title: 'edited', updatedAt: '2026-09-10T11:00:00.000Z' }),
      'update',
    );

    expect(table.byId('t1')?.updatedAt).toBe('2026-09-10T11:00:00.000Z');
    expect(table.baseVersion('t1')).toBe('2026-09-10T10:00:00.000Z');
  });

  /** Three quick edits to one row are one push, not three. */
  it('collapses repeated enqueues for the same id', () => {
    const table = new MemorySyncTable<TaskRow>();
    const push = (title: string): PendingPush => ({
      op: 'update',
      id: 't1',
      baseUpdatedAt: null,
      updatedAt: '2026-09-10T11:00:00.000Z',
      data: { title },
      attempts: 0,
    });

    table.enqueue(push('one'));
    table.enqueue(push('two'));

    expect(table.pending()).toHaveLength(1);
    expect(table.pending()[0]?.data?.title).toBe('two');
  });
});

describe('TasksStore', () => {
  let api: FakeApi;

  const store = () => new TasksStore(new BotvyClient({ baseUrl: '', fetchImpl: api.fetch }));

  beforeEach(() => {
    api = new FakeApi();
  });

  /** The id is the idempotency key: the route answers 200 and `replayed`, not 201. */
  it('mints a UUIDv7 a retry of which is the same task', async () => {
    api.on('POST', '/tasks', {
      body: { id: 'echoed', updatedAt: '2026-09-10T12:00:00.000Z', replayed: false },
    });
    const tasks = store();

    const ack = await tasks.create({ title: 'buy milk' });

    const sent = api.calls.at(-1)?.body as { id: string };
    expect(sent.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(ack.replayed).toBe(false);
    expect(tasks.byId(sent.id)?.title).toBe('buy milk');
    // The acknowledgement's `updatedAt` is the server's own row version, which
    // is exactly what `baseUpdatedAt` may be set from — unlike a local clock.
    expect(tasks.byId(sent.id)?.baseUpdatedAt).toBe('2026-09-10T12:00:00.000Z');
  });

  it('accepts an id the caller minted, for a row created offline', async () => {
    api.on('POST', '/tasks', {
      body: { id: 'mine', updatedAt: '2026-09-10T12:00:00.000Z', replayed: true },
    });
    const tasks = store();
    const id = newId();

    await tasks.create({ id, title: 'buy milk' });

    const sent = api.calls.at(-1)?.body as { id: string } | undefined;
    expect(sent?.id).toBe(id);
  });

  /**
   * The status is the only record of whether the task was completed, cancelled
   * or never dealt with, and the Deleted view exists to show exactly that.
   */
  it('leaves the status untouched when a task is deleted', async () => {
    api.on('POST', '/tasks/t1/complete', {
      body: { updatedAt: '2026-09-10T12:00:00.000Z', recurrenceAdvancedTo: null },
    });
    api.on('DELETE', '/tasks/t1', { body: { updatedAt: '2026-09-10T12:01:00.000Z' } });
    const tasks = store();
    tasks.table.applyServerRows([taskRow({ id: 't1' })]);

    await tasks.complete('t1');
    await tasks.remove('t1');

    expect(tasks.byId('t1')?.status).toBe('completed');
    expect(tasks.byId('t1')?.deletedAt).toBe('2026-09-10T12:01:00.000Z');
    expect(tasks.view('deleted', { timezone: 'Africa/Cairo' }).map((row) => row.id)).toEqual([
      't1',
    ]);
  });

  /**
   * A series that advanced is still open, at its new moment. The client shows
   * "done" for a one-off and "done — next Tuesday" for a series, which is why
   * the acknowledgement carries where the series went.
   */
  it('re-arms a repeating task instead of completing it', async () => {
    api.on('POST', '/tasks/t1/complete', {
      body: {
        updatedAt: '2026-09-10T12:00:00.000Z',
        recurrenceAdvancedTo: '2026-09-17T09:00:00.000Z',
      },
    });
    const tasks = store();
    tasks.table.applyServerRows([
      taskRow({ id: 't1', repeats: true, dueAt: '2026-09-10T09:00:00.000Z' }),
    ]);

    await tasks.complete('t1');

    expect(tasks.byId('t1')?.status).toBe('open');
    expect(tasks.byId('t1')?.dueAt).toBe('2026-09-17T09:00:00.000Z');
  });

  /**
   * Today is the member's day, not the machine's. The same instant is a
   * different calendar date in Cairo and in Los Angeles, and reading the host's
   * own zone here is the mistake that once shifted every extracted reminder by
   * three hours.
   */
  it('decides Today against the member zone it is given', () => {
    const tasks = store();
    // 01:00 UTC on the 11th: already the 11th in Cairo (+03), still the 10th in
    // Los Angeles (-07). The task is due at 18:00 UTC on the 11th, which is the
    // 11th in both zones — so it is *today* for the member in Cairo and *still
    // to come* for the member in Los Angeles. One row, two right answers, and
    // the only thing that decides between them is the zone passed in.
    const now = new Date('2026-09-11T01:00:00.000Z');
    tasks.table.applyServerRows([taskRow({ id: 'due-11th', dueAt: '2026-09-11T18:00:00.000Z' })]);

    const cairo = tasks.view('today', { timezone: 'Africa/Cairo', now });
    const la = tasks.view('today', { timezone: 'America/Los_Angeles', now });

    expect(cairo.map((row) => row.id)).toEqual(['due-11th']);
    expect(la).toEqual([]);
    expect(
      tasks.view('upcoming', { timezone: 'America/Los_Angeles', now }).map((row) => row.id),
    ).toEqual(['due-11th']);
  });

  /** A task the member has not dealt with is still theirs to deal with today. */
  it('keeps the overdue ones in Today, and in Overdue too', () => {
    const tasks = store();
    const now = new Date('2026-09-10T09:00:00.000Z');
    tasks.table.applyServerRows([
      taskRow({ id: 'yesterday', dueAt: '2026-09-09T09:00:00.000Z' }),
      taskRow({ id: 'today', dueAt: '2026-09-10T18:00:00.000Z' }),
      taskRow({ id: 'tomorrow', dueAt: '2026-09-11T09:00:00.000Z' }),
      taskRow({ id: 'no-date' }),
      taskRow({ id: 'done', dueAt: '2026-09-10T07:00:00.000Z', status: 'completed' }),
      taskRow({
        id: 'binned',
        dueAt: '2026-09-10T07:00:00.000Z',
        deletedAt: '2026-09-10T08:00:00.000Z',
      }),
    ]);
    const filter = { timezone: 'Africa/Cairo', now };

    expect(tasks.view('today', filter).map((row) => row.id)).toEqual(['yesterday', 'today']);
    expect(tasks.view('overdue', filter).map((row) => row.id)).toEqual(['yesterday']);
    expect(tasks.view('upcoming', filter).map((row) => row.id)).toEqual(['tomorrow']);
    expect(tasks.view('completed', filter).map((row) => row.id)).toEqual(['done']);
    expect(tasks.view('deleted', filter).map((row) => row.id)).toEqual(['binned']);
  });

  it('does not write a recurrence rule onto the row as a rule', async () => {
    api.on('POST', '/tasks', {
      body: { id: 't1', updatedAt: '2026-09-10T12:00:00.000Z', replayed: false },
    });
    const tasks = store();

    await tasks.create({
      id: 't1',
      title: 'every week',
      recurrence: { dtstart: '2026-09-10T09:00:00.000Z', rrule: 'FREQ=WEEKLY', mode: 'schedule' },
    });

    const row = tasks.byId('t1');
    expect(row?.repeats).toBe(true);
    expect(row?.recurrenceMode).toBe('schedule');
    // The sentence is the server's to render: three surfaces show it and none
    // should carry an RRULE parser to produce it.
    expect(row?.recurrenceText).toBeNull();
    expect(row).not.toHaveProperty('recurrence');
  });

  it('only moves the tasks a rollover says it moved', async () => {
    api.on('POST', '/tasks/rollover', { body: { moved: ['t1'], skipped: ['t2'] } });
    const tasks = store();
    tasks.table.applyServerRows([
      taskRow({ id: 't1', dueAt: '2026-09-09T09:00:00.000Z' }),
      taskRow({ id: 't2', dueAt: '2026-09-09T09:00:00.000Z' }),
    ]);

    await tasks.rollover(['t1', 't2'], '2026-09-11T09:00:00.000Z');

    expect(tasks.byId('t1')?.dueAt).toBe('2026-09-11T09:00:00.000Z');
    expect(tasks.byId('t2')?.dueAt).toBe('2026-09-09T09:00:00.000Z');
  });

  it('escapes an id in the path rather than pasting it in', async () => {
    api.on('DELETE', '/tasks/a%2Fb', { body: { updatedAt: '2026-09-10T12:00:00.000Z' } });
    const tasks = store();

    await tasks.remove('a/b');

    expect(api.calls.at(-1)?.path).toBe('/tasks/a%2Fb');
  });
});

describe('LabelsStore', () => {
  let api: FakeApi;

  const store = () => new LabelsStore(new BotvyClient({ baseUrl: '', fetchImpl: api.fetch }));

  beforeEach(() => {
    api = new FakeApi();
  });

  /** The caller has something specific to do about this one: put the cursor back. */
  it('turns the duplicate-name conflict into a typed error', async () => {
    api.on('POST', '/labels', {
      status: 409,
      body: { code: 'duplicate_label_name', message: 'taken' },
    });
    const labels = store();

    const refused = await labels.create({ name: 'Work' }).catch((error: Error) => error);

    expect(refused).toBeInstanceOf(DuplicateLabelName);
    expect((refused as DuplicateLabelName).labelName).toBe('Work');
  });

  /** Every other refusal stays what it was — this store is not a catch-all. */
  it('leaves any other refusal alone', async () => {
    api.on('POST', '/labels', { status: 400, body: { code: 'invalid_id', message: 'nope' } });
    const labels = store();

    const refused = await labels.create({ name: 'Work' }).catch((error: Error) => error);

    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).not.toBeInstanceOf(DuplicateLabelName);
  });

  /**
   * The palette is `settings.labels.palette`, an operator knob. A client that
   * shipped its own copy would be a hard-coded default, which is a bug by house
   * rule — so the colour is left out and the server picks.
   */
  it('omits the colour so the server picks from its own palette', async () => {
    api.on('POST', '/labels', {
      body: { id: 'l1', updatedAt: '2026-09-10T12:00:00.000Z', replayed: false },
    });
    const labels = store();

    await labels.create({ id: 'l1', name: 'Work' });

    expect(api.calls.at(-1)?.body).not.toHaveProperty('color');
    expect(labels.byId('l1')?.name).toBe('Work');
  });

  it("offers the live labels in the member's own order and hides the tombstones", () => {
    const labels = store();
    labels.table.applyServerRows([
      labelRow({ id: 'l2', name: 'Home', sortOrder: 2 }),
      labelRow({ id: 'l1', name: 'Work', sortOrder: 1 }),
      labelRow({ id: 'l3', name: 'Gone', sortOrder: 0, deletedAt: '2026-09-05T08:00:00.000Z' }),
    ]);

    expect(labels.labels.map((row) => row.id)).toEqual(['l1', 'l2']);
    expect(labels.deleted.map((row) => row.id)).toEqual(['l3']);
  });
});
