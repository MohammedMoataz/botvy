import { describe, expect, it, vi } from 'vitest';
import { ApiError, BotvyClient, NotAvailableYetError } from './client.js';
import { SocketClient, type SocketLike } from './socket.js';
import { TokenStore, inMemoryStorage, type TokenPair } from './tokens.js';

const pair = (suffix: string): TokenPair => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('token store', () => {
  it('reports signed out with nothing held', () => {
    const store = new TokenStore();
    expect(store.signedIn).toBe(false);
    expect(store.accessToken).toBeNull();
  });

  it('tells subscribers when the tokens change, so a re-mounted panel catches up', () => {
    const store = new TokenStore();
    const seen: Array<TokenPair | null> = [];
    store.subscribe((tokens) => seen.push(tokens));

    store.set(pair('1'));
    store.clear();

    expect(seen).toEqual([pair('1'), null]);
  });

  /**
   * The rule this class exists for. The API rotates refresh tokens and detects
   * reuse, so three requests each posting the same one look exactly like a
   * stolen token being replayed — and the family is revoked.
   */
  it('spends one refresh token however many callers are waiting', async () => {
    const refreshFn = vi.fn(async () => pair('2'));
    const store = new TokenStore(inMemoryStorage(), refreshFn);
    store.set(pair('1'));

    const [a, b, c] = await Promise.all([
      store.refresh(),
      store.refresh(),
      store.refresh(),
    ]);

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(a).toEqual(pair('2'));
    expect(b).toEqual(pair('2'));
    expect(c).toEqual(pair('2'));
  });

  it('allows a second refresh once the first has finished', async () => {
    const refreshFn = vi.fn(async () => pair('2'));
    const store = new TokenStore(inMemoryStorage(), refreshFn);
    store.set(pair('1'));

    await store.refresh();
    await store.refresh();

    expect(refreshFn).toHaveBeenCalledTimes(2);
  });

  /** A refused credential is gone for good; holding it fails every later call. */
  it('clears the tokens when the refresh is refused', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => null);
    store.set(pair('1'));

    expect(await store.refresh()).toBeNull();
    expect(store.signedIn).toBe(false);
  });

  /** A network failure is not a refusal, so the tokens survive it. */
  it('keeps the tokens when the refresh call itself fails', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => {
      throw new Error('offline');
    });
    store.set(pair('1'));

    expect(await store.refresh()).toBeNull();
    expect(store.signedIn).toBe(true);
  });

  it('does not try to refresh with nothing to refresh', async () => {
    const refreshFn = vi.fn(async () => pair('2'));
    const store = new TokenStore(inMemoryStorage(), refreshFn);

    expect(await store.refresh()).toBeNull();
    expect(refreshFn).not.toHaveBeenCalled();
  });
});

describe('client', () => {
  it('sends the bearer token when there is one', async () => {
    const store = new TokenStore();
    store.set(pair('1'));
    const seen: Array<Record<string, string>> = [];

    const client = new BotvyClient({
      tokens: store,
      fetchImpl: async (_url, init) => {
        seen.push((init as RequestInit).headers as Record<string, string>);
        return jsonResponse({ id: 'p-1' });
      },
    });

    await client.command('/ping', { clientId: 'c-1' });

    expect(seen[0]?.authorization).toBe('Bearer access-1');
  });

  it('carries an idempotency key when given one', async () => {
    const seen: Array<Record<string, string>> = [];
    const client = new BotvyClient({
      fetchImpl: async (_url, init) => {
        seen.push((init as RequestInit).headers as Record<string, string>);
        return jsonResponse({});
      },
    });

    await client.command('/ping', {}, 'key-1');

    expect(seen[0]?.['idempotency-key']).toBe('key-1');
  });

  it('refreshes once and retries after a 401', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => pair('2'));
    store.set(pair('1'));
    let calls = 0;

    const client = new BotvyClient({
      tokens: store,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ message: 'expired' }, 401)
          : jsonResponse({ id: 'ok' });
      },
    });

    expect(await client.command('/ping', {})).toEqual({ id: 'ok' });
    expect(calls).toBe(2);
  });

  /** Retrying more than once risks performing a command twice. */
  it('does not retry a second time when the refresh did not help', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => null);
    store.set(pair('1'));
    let calls = 0;

    const client = new BotvyClient({
      tokens: store,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ message: 'nope' }, 401);
      },
    });

    await expect(client.command('/ping', {})).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  });

  /** P0 ships a wired sign-in form against an endpoint P1 delivers. */
  it('names a missing endpoint as not available yet', async () => {
    const client = new BotvyClient({
      fetchImpl: async () => jsonResponse(null, 404),
    });

    await expect(client.command('/auth/login', {})).rejects.toBeInstanceOf(
      NotAvailableYetError,
    );
  });

  it('surfaces a GraphQL error rather than returning empty data', async () => {
    const client = new BotvyClient({
      fetchImpl: async () =>
        jsonResponse({ errors: [{ message: 'forbidden' }] }, 200),
    });

    await expect(client.query('{ me { id } }')).rejects.toThrow('forbidden');
  });
});

type FakeSocket = SocketLike & {
  handlers: Map<string, (payload: unknown) => void>;
  connects: number;
};

/** A socket that records what was registered on it instead of opening one. */
function fakeSocket(): FakeSocket {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    connected: false,
    auth: {},
    connects: 0,
    handlers,
    connect() {
      this.connects += 1;
    },
    disconnect() {
      this.connected = false;
    },
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit() {},
  };
}

describe('socket', () => {
  it('will not connect while signed out', () => {
    const states: string[] = [];
    const client = new SocketClient({
      tokens: new TokenStore(),
      connect: () => fakeSocket(),
      onState: (state) => states.push(state),
    });

    client.connect();

    expect(states).toEqual(['signed-out']);
  });

  it('puts the token in the handshake payload, never a query string', () => {
    const store = new TokenStore();
    store.set(pair('1'));
    let handshake: Record<string, unknown> = {};

    const client = new SocketClient({
      tokens: store,
      installId: 'install-9',
      connect: (_url, auth) => {
        handshake = auth;
        return fakeSocket();
      },
    });
    client.connect();

    expect(handshake).toEqual({ token: 'access-1', installId: 'install-9' });
  });

  /**
   * An expired token is ordinary — a socket open for an afternoon outlives
   * several. Refreshing and reconnecting is the answer; signing the member out
   * every fifteen minutes is not.
   */
  it('refreshes and reconnects when the server says the token expired', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => pair('2'));
    store.set(pair('1'));
    const sockets: FakeSocket[] = [];

    const client = new SocketClient({
      tokens: store,
      connect: () => {
        const socket = fakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.connect();

    sockets[0]!.handlers.get('token_expired')?.(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sockets).toHaveLength(2);
    expect(client.state).toBe('reconnecting');
  });

  /** A refusal that a refresh cannot fix means signing in again, not looping. */
  it('stops and reports signed out when the refresh fails', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => null);
    store.set(pair('1'));
    const sockets: FakeSocket[] = [];

    const client = new SocketClient({
      tokens: store,
      connect: () => {
        const socket = fakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.connect();

    sockets[0]!.handlers.get('token_expired')?.(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.state).toBe('signed-out');
    expect(sockets).toHaveLength(1);
  });

  /**
   * The refusal that actually arrives.
   *
   * A handshake the server rejects reaches the client as `connect_error` with
   * an `Error`, not a string - so the old `String(payload) === 'token_expired'`
   * check never matched and every expired token signed the member out of an app
   * they were still entitled to use. The server puts the code on `err.data`.
   */
  it('refreshes when the handshake is refused for an expired token', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => pair('2'));
    store.set(pair('1'));
    const sockets: FakeSocket[] = [];
    const client = new SocketClient({
      tokens: store,
      connect: () => {
        const socket = fakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.connect();

    const refusal = Object.assign(new Error('token_expired'), {
      data: { code: 'token_expired' },
    });
    sockets[0]!.handlers.get('connect_error')?.(refusal);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sockets).toHaveLength(2);
    expect(client.state).toBe('reconnecting');
  });

  /** A refusal a refresh cannot fix still means signing in again. */
  it('signs out when the handshake is refused as unauthorized', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => pair('2'));
    store.set(pair('1'));
    const sockets: FakeSocket[] = [];
    const client = new SocketClient({
      tokens: store,
      connect: () => {
        const socket = fakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    client.connect();

    sockets[0]!.handlers.get('connect_error')?.(
      Object.assign(new Error('unauthorized'), {
        data: { code: 'unauthorized' },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.state).toBe('signed-out');
    expect(sockets).toHaveLength(1);
  });

  it('keeps its handlers across a reconnect', async () => {
    const store = new TokenStore(inMemoryStorage(), async () => pair('2'));
    store.set(pair('1'));
    const sockets: FakeSocket[] = [];
    const client = new SocketClient({
      tokens: store,
      connect: () => {
        const socket = fakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const received: unknown[] = [];
    client.on('sync.nudge', (payload) => received.push(payload));
    client.connect();

    sockets[0]!.handlers.get('token_expired')?.(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    sockets[1]!.handlers.get('sync.nudge')?.({ entities: ['tasks'] });
    expect(received).toEqual([{ entities: ['tasks'] }]);
  });
});
