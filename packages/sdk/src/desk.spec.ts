import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { BotvyClient } from './client.js';
import { addDays, dayWindow, todayIn, within } from './day.js';
import {
  NUDGE_DEBOUNCE_MS,
  RECONNECT_BACKOFF_MS,
  SocketClient,
  type SocketLike,
  type SocketOptions,
} from './socket.js';
import type { TokenStore } from './tokens.js';

/**
 * What the desk companion needs from the SDK (P9, T902 and T903).
 *
 * Two things the phone never had to care about and the extension cannot work
 * without: a socket that behaves in a service worker — which has no `window`,
 * is evicted between tasks, and must not spin against a Botvy that is switched
 * off — and a day that belongs to the member rather than to whichever machine
 * the browser is sitting on.
 */

// ---------------------------------------------------------------- the socket

class FakeSocket implements SocketLike {
  connected = false;
  auth: Record<string, unknown> = {};
  readonly emitted: Array<{ event: string; payload?: unknown }> = [];
  readonly handlers = new Map<string, (payload: unknown) => void>();
  connects = 0;

  connect(): void {
    this.connects += 1;
  }

  disconnect(): void {
    this.connected = false;
  }

  on(event: string, handler: (payload: unknown) => void): void {
    this.handlers.set(event, handler);
  }

  emit(event: string, payload?: unknown): void {
    this.emitted.push({ event, payload });
  }

  /** Drive the client the way the server would. */
  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

function tokens(access: string | null = 'access-1'): TokenStore {
  return {
    accessToken: access,
    refreshToken: 'refresh-1',
    refresh: vi.fn(async () => true),
  } as unknown as TokenStore;
}

function harness(options: Partial<SocketOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const timers: Array<{ fn: () => void; delayMs: number }> = [];

  const client = new SocketClient({
    tokens: tokens(),
    connect: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    baseUrl: 'http://botvy.test',
    schedule: (fn, delayMs) => timers.push({ fn, delayMs }),
    ...options,
  });

  return {
    client,
    sockets,
    timers,
    get last(): FakeSocket {
      return sockets[sockets.length - 1]!;
    },
    /** Run every scheduled callback, as a timer would. */
    tick(): void {
      const due = timers.splice(0, timers.length);
      for (const timer of due) timer.fn();
    },
  };
}

describe('the live connection, from a service worker', () => {
  it('asks to be nudged about its own entities on every connect', () => {
    const b = harness({ entities: ['tasks', 'labels'] });

    b.client.connect();
    b.last.fire('connect');
    expect(b.last.emitted).toEqual([
      { event: 'sync.subscribe', payload: { entities: ['tasks', 'labels'] } },
    ]);

    // A reconnect is a **new server-side socket**, which knows nothing about
    // what the last one asked for. Subscribing only on the first connect is how
    // a panel goes quiet after its first network blip.
    b.last.fire('disconnect');
    b.client.connect();
    b.last.fire('connect');
    expect(b.last.emitted).toEqual([
      { event: 'sync.subscribe', payload: { entities: ['tasks', 'labels'] } },
    ]);
  });

  it('says nothing when the surface asked for no entities', () => {
    const b = harness();
    b.client.connect();
    b.last.fire('connect');
    expect(b.last.emitted).toEqual([]);
  });

  it('collapses a burst of nudges into one sync', () => {
    const synced: string[][] = [];
    const b = harness({
      entities: ['tasks'],
      onNudge: (entities) => synced.push(entities),
    });

    b.client.connect();
    b.last.fire('connect');
    b.last.fire('sync.nudge', { entities: ['tasks'], reason: 'remote_edit' });
    b.last.fire('sync.nudge', { entities: ['tasks'], reason: 'remote_edit' });
    b.last.fire('sync.nudge', { entities: ['labels'], reason: 'remote_edit' });

    // Nothing yet: the window is open.
    expect(synced).toEqual([]);
    expect(b.timers[0]?.delayMs).toBe(NUDGE_DEBOUNCE_MS);

    b.tick();

    // One pass, naming everything the burst mentioned — not only the entities
    // on the last nudge, which would leave the rest until something else
    // happened to run a sync.
    expect(synced).toHaveLength(1);
    expect([...synced[0]!].sort()).toEqual(['labels', 'tasks']);
  });

  it('starts a fresh window for the next burst', () => {
    const synced: string[][] = [];
    const b = harness({ onNudge: (entities) => synced.push(entities) });

    b.client.connect();
    b.last.fire('connect');
    b.last.fire('sync.nudge', { entities: ['tasks'] });
    b.tick();
    b.last.fire('sync.nudge', { entities: ['meetings'] });
    b.tick();

    expect(synced).toEqual([['tasks'], ['meetings']]);
  });

  it('backs off further after each failed attempt, up to the ceiling', () => {
    const b = harness();
    b.client.connect();

    expect(b.client.reconnectDelayMs).toBe(RECONNECT_BACKOFF_MS[0]);

    for (let attempt = 1; attempt < RECONNECT_BACKOFF_MS.length; attempt += 1) {
      b.last.fire('connect_error', { message: 'xhr poll error' });
      expect(b.client.reconnectDelayMs).toBe(RECONNECT_BACKOFF_MS[attempt]);
    }

    // And it stops there. A worker retrying every second against a Botvy that
    // is off for the weekend keeps itself awake doing nothing.
    b.last.fire('connect_error', { message: 'xhr poll error' });
    expect(b.client.reconnectDelayMs).toBe(
      RECONNECT_BACKOFF_MS[RECONNECT_BACKOFF_MS.length - 1],
    );
  });

  it('resets the backoff only after a connection actually holds', () => {
    const b = harness();
    b.client.connect();
    b.last.fire('connect_error', { message: 'xhr poll error' });
    b.last.fire('connect_error', { message: 'xhr poll error' });
    expect(b.client.failures).toBe(2);

    b.last.fire('connect');
    expect(b.client.failures).toBe(0);
    expect(b.client.reconnectDelayMs).toBe(RECONNECT_BACKOFF_MS[0]);
  });

  it('keeps a member signed in when their Botvy is merely unreachable', () => {
    const states: string[] = [];
    const b = harness({ onState: (state) => states.push(state) });

    b.client.connect();
    b.last.fire('connect_error', { message: 'xhr poll error' });

    // The machine is unplugged; the tokens are good. Signing the member out
    // here — which is what this did — turns a switched-off desktop into a
    // sign-in prompt, and the panel's status strip has an "offline" state for
    // exactly this.
    expect(states).not.toContain('signed-out');
    expect(b.client.state).toBe('reconnecting');
  });

  it('signs out when the credential itself is refused', () => {
    const b = harness();
    b.client.connect();
    b.last.fire('connect_error', { data: { code: 'unauthorized' } });
    expect(b.client.state).toBe('signed-out');
  });

  it('refreshes rather than counting an expired token as a failure', async () => {
    const store = tokens();
    const b = harness({ tokens: store });

    b.client.connect();
    b.last.fire('connect_error', { data: { code: 'token_expired' } });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.refresh).toHaveBeenCalledTimes(1);
    // An expiry is not a reachability problem, so it must not push the backoff
    // out: fifteen minutes of ordinary use would otherwise reconnect at the
    // ceiling.
    expect(b.client.failures).toBe(0);
  });

  it('touches no browser-page global, anywhere in the module', () => {
    /*
     * Read from disk rather than from `SocketClient.toString()`, which returns
     * the class body alone and would miss a module-level `window` — the exact
     * shape that throws on import in a service worker and leaves the panel
     * silently never updating. Comments are stripped first, because this file's
     * own prose says "window" and a rule that a comment may not name the thing
     * it explains is a rule nobody can work under.
     */
    const here = fileURLToPath(new URL('./socket.ts', import.meta.url));
    const source = readFileSync(here, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(source).not.toMatch(/\bwindow\b/);
    expect(source).not.toMatch(/\bdocument\b/);
    expect(source).not.toMatch(/\blocalStorage\b/);
  });
});

// ------------------------------------------------------------- the member's day

describe('the member’s own day', () => {
  /**
   * 23:30 UTC, which is the case worth pinning: Riyadh is already on the next
   * calendar day and New York is still on this one, so a surface that read the
   * *browser's* zone would show one of them the wrong Today.
   *
   * Built from a fixed instant rather than from `Date.now()` — the assertion is
   * about the difference between two zones at one moment, and a fixture that
   * moved would be asserting the clock.
   */
  const lateEvening = new Date('2026-03-10T23:30:00.000Z');

  it('rolls over east of UTC before it rolls over west', () => {
    expect(todayIn('Asia/Riyadh', lateEvening)).toBe('2026-03-11');
    expect(todayIn('America/New_York', lateEvening)).toBe('2026-03-10');
  });

  it('gives seven days counted from the member’s today, inclusive', () => {
    const week = dayWindow('Asia/Riyadh', 7, lateEvening);

    expect(week.from).toBe('2026-03-11');
    expect(week.to).toBe('2026-03-17');
    // Riyadh is UTC+3 with no daylight saving, so its midnight is 21:00 UTC the
    // evening before.
    expect(week.start.toISOString()).toBe('2026-03-10T21:00:00.000Z');
    // The last millisecond of the member's `to` day, not the first of the next:
    // a meeting at exactly tomorrow's midnight must belong to one day only.
    expect(week.end.toISOString()).toBe('2026-03-17T20:59:59.999Z');
  });

  it('measures a day by the calendar, not by 24 hours', () => {
    /*
     * New York springs forward on 8 March 2026, so that day is 23 hours long.
     * A window built by adding milliseconds would end an hour early for the
     * rest of the week — which on a seven-day meeting list means the last
     * evening's meetings silently disappear.
     */
    const beforeTheChange = new Date('2026-03-07T17:00:00.000Z');
    const week = dayWindow('America/New_York', 3, beforeTheChange);

    expect(week.from).toBe('2026-03-07');
    expect(week.to).toBe('2026-03-09');
    expect(week.start.toISOString()).toBe('2026-03-07T05:00:00.000Z');
    // EDT by the 9th: midnight is 04:00 UTC, not 05:00.
    expect(week.end.toISOString()).toBe('2026-03-10T03:59:59.999Z');
  });

  it('answers one day for a window of one', () => {
    const day = dayWindow('Asia/Riyadh', 1, lateEvening);
    expect(day.from).toBe(day.to);
    expect(day.from).toBe('2026-03-11');
  });

  it('says whether an instant belongs to the window', () => {
    const week = dayWindow('Asia/Riyadh', 7, lateEvening);

    expect(within(week, '2026-03-11T08:00:00.000Z')).toBe(true);
    expect(within(week, week.start)).toBe(true);
    expect(within(week, week.end)).toBe(true);
    // A millisecond past the end is the next member-day, and belongs to it.
    expect(within(week, new Date(week.end.getTime() + 1))).toBe(false);
    expect(within(week, '2026-03-01T08:00:00.000Z')).toBe(false);
  });

  it('adds days as calendar dates, across a month and a leap year', () => {
    expect(addDays('2026-03-11', 7)).toBe('2026-03-18');
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

// ------------------------------------------------------------------ the client

describe('the client’s fetch', () => {
  it('calls the platform fetch with the platform as its receiver', async () => {
    /*
     * The regression this exists for threw *before any request was sent*.
     *
     * A browser's `fetch` is a method of the window: assigning it to a field and
     * calling `this.fetchImpl(...)` invokes it with the client as the receiver,
     * and Chrome answers `Illegal invocation`. Node does not check, so the whole
     * suite passed while every request from a real browser failed with a
     * sign-in form saying the server was unreachable — which it never was.
     *
     * The strict receiver below is what a browser does, so this test fails in
     * Node exactly when the browser would.
     */
    const calls: string[] = [];
    const strict = function boundOnly(this: unknown, url: string) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      calls.push(url);
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    };

    const original = globalThis.fetch;
    globalThis.fetch = strict as unknown as typeof fetch;
    try {
      const client = new BotvyClient({ baseUrl: 'http://botvy.test' });
      await client.rest('GET', '/health');
      expect(calls).toEqual(['http://botvy.test/api/v1/health']);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('resolves a changing address on every request', async () => {
    // The extension's Botvy address is a per-browser setting the member can
    // edit in the panel; a client that pinned it at construction would keep
    // talking to the old one until something reloaded the panel.
    const seen: string[] = [];
    let origin = 'http://first.test';
    const client = new BotvyClient({
      baseUrl: () => origin,
      fetchImpl: (async (url: string) => {
        seen.push(url);
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as unknown as typeof fetch,
    });

    await client.rest('GET', '/health');
    origin = 'http://second.test';
    await client.rest('GET', '/health');

    expect(seen).toEqual([
      'http://first.test/api/v1/health',
      'http://second.test/api/v1/health',
    ]);
  });
});
