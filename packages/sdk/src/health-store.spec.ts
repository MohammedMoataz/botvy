import { describe, expect, it, vi } from 'vitest';
import { HEALTH_POLL_MS, HealthStore } from './health-store.js';
import type { AdminStore, HealthReport } from './admin-store.js';

function reportWith(jobs: HealthReport['jobs']): HealthReport {
  return {
    status: 'ok',
    postgres: true,
    mongo: true,
    ollama: true,
    pushConfigured: false,
    defaultAdminPassword: false,
    jobs,
    version: 'test',
  };
}

/** Just enough of `AdminStore` to answer `health()`. */
function fakeAdmin(answers: Array<HealthReport | Error>): AdminStore & { calls: number } {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async health() {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  } as unknown as AdminStore & { calls: number };
}

/** A socket that only records what was subscribed to, and can push. */
function fakeSocket() {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    client: {
      on(event: string, handler: (payload: unknown) => void) {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
    },
    push(event: string, payload: unknown) {
      handlers.get(event)?.(payload);
    },
    get subscribed() {
      return [...handlers.keys()];
    },
  };
}

describe('HealthStore', () => {
  it('reads once on start and keeps reading on the poll', async () => {
    const admin = fakeAdmin([reportWith([])]);
    const ticks: Array<() => void> = [];
    const store = new HealthStore(admin, {
      setInterval: ((fn: () => void) => {
        ticks.push(fn);
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval,
      clearInterval: (() => undefined) as unknown as typeof clearInterval,
    });

    store.start();
    await vi.waitFor(() => expect(store.report).not.toBeNull());
    expect(admin.calls).toBe(1);

    ticks[0]?.();
    await vi.waitFor(() => expect(admin.calls).toBe(2));
  });

  it('polls even while the socket is connected', () => {
    // The socket only carries jobs. A store that stopped polling because a
    // socket was up would never notice a database that had stopped answering,
    // which is half of what the screen reports.
    const socket = fakeSocket();
    const setInterval_ = vi.fn(
      (_fn: () => void, _ms?: number) => 1 as unknown as ReturnType<typeof setInterval>,
    );
    const store = new HealthStore(fakeAdmin([reportWith([])]), {
      socket: socket.client as never,
      setInterval: setInterval_ as unknown as typeof setInterval,
      clearInterval: (() => undefined) as unknown as typeof clearInterval,
    });

    store.start();

    expect(setInterval_).toHaveBeenCalledTimes(1);
    expect(setInterval_.mock.calls[0]?.[1]).toBe(HEALTH_POLL_MS);
    expect(socket.subscribed).toEqual(['ops.heartbeat']);
  });

  it('a heartbeat clears stale without waiting for the next poll', async () => {
    const socket = fakeSocket();
    const store = new HealthStore(
      fakeAdmin([
        reportWith([{ job: 'rhythm.tick', lastOkAt: null, lastError: 'boom', stale: true }]),
      ]),
      {
        socket: socket.client as never,
        setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as unknown as typeof setInterval,
        clearInterval: (() => undefined) as unknown as typeof clearInterval,
      },
    );

    store.start();
    await vi.waitFor(() => expect(store.staleJobs).toEqual(['rhythm.tick']));

    socket.push('ops.heartbeat', {
      job: 'rhythm.tick',
      ok: true,
      lastOkAt: '2026-09-11T10:00:00.000Z',
    });

    expect(store.staleJobs).toEqual([]);
    expect(store.report?.jobs[0]?.lastOkAt).toBe('2026-09-11T10:00:00.000Z');
    expect(store.report?.jobs[0]?.lastError).toBeNull();
  });

  it('a failed heartbeat never erases when the job last worked', async () => {
    const socket = fakeSocket();
    const store = new HealthStore(
      fakeAdmin([
        reportWith([
          {
            job: 'outbox.relay',
            lastOkAt: '2026-09-11T09:00:00.000Z',
            lastError: null,
            stale: false,
          },
        ]),
      ]),
      {
        socket: socket.client as never,
        setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as unknown as typeof setInterval,
        clearInterval: (() => undefined) as unknown as typeof clearInterval,
      },
    );

    store.start();
    await vi.waitFor(() => expect(store.report).not.toBeNull());

    // The server sends `lastOkAt: null` on a failure and keeps the stored value;
    // writing the null through would blank the one field somebody debugging is
    // looking for.
    socket.push('ops.heartbeat', { job: 'outbox.relay', ok: false, lastOkAt: null });

    expect(store.report?.jobs[0]?.lastOkAt).toBe('2026-09-11T09:00:00.000Z');
    expect(store.report?.jobs[0]?.lastError).toBe('failed');
  });

  it('keeps the last report when a poll fails', async () => {
    const good = reportWith([]);
    const admin = fakeAdmin([good, new Error('the gateway is down')]);
    const store = new HealthStore(admin, {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as unknown as typeof setInterval,
      clearInterval: (() => undefined) as unknown as typeof clearInterval,
    });

    store.start();
    await vi.waitFor(() => expect(store.report).toBe(good));

    await store.refresh();

    expect(store.report).toBe(good);
    expect(store.problem).toBe('the gateway is down');
  });

  it('a read that lands after stop() does not write', async () => {
    // Annotated through a holder: assigned only inside the executor, TypeScript
    // narrows a plain `let` to `null` and the call below becomes uncallable.
    const gate: { release: ((report: HealthReport) => void) | null } = { release: null };
    const admin = {
      health: () =>
        new Promise<HealthReport>((resolve) => {
          gate.release = resolve;
        }),
    } as unknown as AdminStore;

    const store = new HealthStore(admin, {
      setInterval: (() => 1 as unknown as ReturnType<typeof setInterval>) as unknown as typeof setInterval,
      clearInterval: (() => undefined) as unknown as typeof clearInterval,
    });

    store.start();
    store.stop();
    gate.release?.(reportWith([]));
    await Promise.resolve();

    // The screen has gone. A late write would repopulate a store the next mount
    // is about to take over, which is how two overviews end up disagreeing.
    expect(store.report).toBeNull();
  });
});
