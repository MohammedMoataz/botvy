import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthStore,
  EmailTaken,
  GoogleLinkRequired,
  RegistrationClosed,
} from './auth-store.js';
import { BotvyClient } from './client.js';
import { ProfileStore } from './profile-store.js';
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

  on(method: string, path: string, ...replies: Reply[]): this {
    this.#replies.set(`${method} ${path}`, replies);
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
  it('signs out when a refresh is refused, and says why', async () => {
    api.on('POST', '/auth/login', { body: session });
    api.on('POST', '/auth/refresh', { status: 401, body: { code: 'session_replay' } });
    const tokens = new TokenStore(inMemoryStorage());
    const client = new BotvyClient({ baseUrl: '', tokens, fetchImpl: api.fetch });
    const auth = new AuthStore(client, tokens);
    // Wired the way the surfaces wire it.
    const wired = new TokenStore(inMemoryStorage(), auth.refreshFn);
    await auth.login('member@example.test', 'a-password');
    wired.set({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(await wired.refresh()).toBeNull();
    expect(auth.signedIn).toBe(false);
    expect(auth.lastSignOutReason).toBe('session_replay');
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
      .on('GET', '/profile', { body: profile })
      .on('GET', '/preferences', { body: preferences });
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
    api.on('GET', '/preferences', { body: preferences }, { body: { ...preferences, endOfDayTime: '23:00' } });
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
