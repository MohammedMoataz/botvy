import { describe, expect, it } from 'vitest';
import { RelayRuntime, type RelayLoop } from './relay.runtime.js';

/** A relay whose run() the test settles by hand. */
class ScriptedRelay implements RelayLoop {
  runs = 0;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;
  #last = new Date(0);

  run(): Promise<void> {
    this.runs += 1;
    return new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  fail(message: string): void {
    this.#reject?.(new Error(message));
    this.#resolve = null;
    this.#reject = null;
  }

  /** In production the closed change stream ends run(); the fake ends it here. */
  stop(): void {
    this.#resolve?.();
    this.#resolve = null;
    this.#reject = null;
  }

  lastLoopAt(): Date {
    return this.#last;
  }

  delivered(at: Date): void {
    this.#last = at;
  }
}

function runtime(relay: ScriptedRelay) {
  const beats: Array<{ ok: boolean; error?: string }> = [];
  const forwarder = { started: 0, stopped: 0, start() { this.started += 1; }, stop() { this.stopped += 1; } };
  const rt = new RelayRuntime({
    relay,
    forwarder,
    closeStore: async () => {},
    heartbeat: async (ok, error) => { beats.push(error ? { ok, error } : { ok }); },
    sleep: async () => {},
    aliveEveryMs: 60_000,
  });
  return { rt, beats, forwarder };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('RelayRuntime', () => {
  it('starts the forwarder and the relay, and a tick while running stamps a healthy heartbeat', async () => {
    const relay = new ScriptedRelay();
    const { rt, beats, forwarder } = runtime(relay);
    rt.start();
    await flush();

    expect(forwarder.started).toBe(1);
    expect(relay.runs).toBe(1);
    const before = rt.lastLoopAt();
    await rt.tick();
    expect(beats).toEqual([{ ok: true }]);
    expect(rt.lastLoopAt().getTime()).toBeGreaterThanOrEqual(before.getTime());
    await rt.stop();
  });

  it('restarts a failed run, stamps the failure, and stops ticking while it is down', async () => {
    const relay = new ScriptedRelay();
    const { rt, beats } = runtime(relay);
    rt.start();
    await flush();

    relay.fail('change stream closed');
    await flush();
    await flush();

    expect(beats).toEqual([{ ok: false, error: 'change stream closed' }]);
    expect(relay.runs).toBe(2);
    await rt.stop();
  });

  it('reports the later of the relay\'s own delivery and the alive tick', async () => {
    const relay = new ScriptedRelay();
    const { rt } = runtime(relay);
    rt.start();
    await flush();
    await rt.tick();
    const future = new Date(Date.now() + 60_000);
    relay.delivered(future);
    expect(rt.lastLoopAt()).toEqual(future);
    await rt.stop();
  });

  it('is a no-op in generation mode', () => {
    process.env.BOTVY_GEN = '1';
    try {
      const relay = new ScriptedRelay();
      const { rt, forwarder } = runtime(relay);
      rt.onApplicationBootstrap();
      expect(forwarder.started).toBe(0);
      expect(relay.runs).toBe(0);
    } finally {
      delete process.env.BOTVY_GEN;
    }
  });
});
