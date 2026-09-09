import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { RelayLiveness } from '../health/healthz.controller.js';

/** The worker's relay loop, reduced to what the runtime needs to drive it. */
export interface RelayLoop {
  run(): Promise<void>;
  stop(): void;
  lastLoopAt(): Date;
  /** Everything waiting whose retry time has come. Returns how many it sent. */
  drainBacklog(): Promise<number>;
}

export interface Forwarder {
  start(): void;
  stop(): void;
}

export interface RelayRuntimeDeps {
  relay: RelayLoop;
  forwarder: Forwarder;
  /** Closes the change stream so a blocked `run()` returns. */
  closeStore(): Promise<void>;
  heartbeat(ok: boolean, error?: string): Promise<void>;
  /** For the specs; production leaves it undefined. */
  sleep?: (ms: number) => Promise<void>;
  aliveEveryMs?: number;
  retryEveryMs?: number;
}

export const RELAY_ALIVE_EVERY_MS = 30_000;
/**
 * How often to look for events whose retry is due.
 *
 * The change stream only yields *inserts*, so a deferred retry is invisible to
 * it: `run()` drained the backlog once at startup and then blocked forever, and
 * a webhook that failed a single time waited for the next process restart. The
 * shortest rung of the ladder is a minute, so checking every minute is the
 * coarsest interval that can honour it.
 */
export const RELAY_RETRY_EVERY_MS = 60_000;
const RESTART_MIN_MS = 1_000;
const RESTART_MAX_MS = 30_000;
const STOP_WAIT_MS = 5_000;

/**
 * Keeps the relay running and says so.
 *
 * `OutboxRelay.run()` blocks on the change stream, so it neither returns nor
 * stamps a heartbeat while nothing happens — and "nothing happened" is the
 * normal state of a quiet system. This runtime stamps `outbox.relay` on a
 * timer for as long as the run is in flight, and restarts it with a backoff
 * when it fails. `lastLoopAt()` is what `/healthz` reads: the later of the
 * relay's own last delivery and the last tick that found it alive, so an idle
 * relay is healthy and a dead one is reported within the window.
 */
@Injectable()
export class RelayRuntime implements OnApplicationBootstrap, OnApplicationShutdown, RelayLiveness {
  private readonly logger = new Logger(RelayRuntime.name);
  #stopped = false;
  #running = false;
  #lastAliveAt = new Date(0);
  #timer: NodeJS.Timeout | null = null;
  #retryTimer: NodeJS.Timeout | null = null;
  #loop: Promise<void> | null = null;

  constructor(private readonly deps: RelayRuntimeDeps) {}

  onApplicationBootstrap(): void {
    if (process.env.BOTVY_GEN) return;
    this.start();
  }

  start(): void {
    if (this.#loop) return;
    this.#stopped = false;
    this.deps.forwarder.start();
    this.#loop = this.runForever();
    const every = this.deps.aliveEveryMs ?? RELAY_ALIVE_EVERY_MS;
    this.#timer = setInterval(() => void this.tick(), every);
    this.#timer.unref?.();

    const retryEvery = this.deps.retryEveryMs ?? RELAY_RETRY_EVERY_MS;
    this.#retryTimer = setInterval(() => void this.retryDue(), retryEvery);
    this.#retryTimer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    if (this.#retryTimer) clearInterval(this.#retryTimer);
    this.#retryTimer = null;
    this.deps.forwarder.stop();
    this.deps.relay.stop();
    await this.deps.closeStore();
    // Bounded: a stream that will not close must not hold the process open.
    await Promise.race([
      this.#loop?.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, STOP_WAIT_MS).unref?.()),
    ]);
    this.#loop = null;
  }

  /** Stamps the heartbeat while the run is in flight; a failed run is stamped by the catch below. */
  async tick(): Promise<void> {
    if (!this.#running) return;
    this.#lastAliveAt = new Date();
    await this.deps.heartbeat(true);
  }

  /**
   * Sends whatever is now due for a retry.
   *
   * A failure to drain is logged and swallowed: this is a timer, and an
   * unhandled rejection from one takes the worker down. The relay's own
   * heartbeat is what reports the trouble.
   */
  async retryDue(): Promise<void> {
    if (this.#stopped) return;
    try {
      const sent = await this.deps.relay.drainBacklog();
      if (sent > 0) this.logger.log(`retried ${sent} deferred event${sent === 1 ? '' : 's'}`);
    } catch (error) {
      this.logger.warn(`retry sweep failed: ${(error as Error).message}`);
    }
  }

  lastLoopAt(): Date {
    const own = this.deps.relay.lastLoopAt();
    return own > this.#lastAliveAt ? own : this.#lastAliveAt;
  }

  get running(): boolean {
    return this.#running;
  }

  private async runForever(): Promise<void> {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    let delay = RESTART_MIN_MS;

    while (!this.#stopped) {
      this.#running = true;
      this.#lastAliveAt = new Date();
      try {
        await this.deps.relay.run();
        delay = RESTART_MIN_MS;
        // A clean return, not an error: a change stream can end rather than
        // throw when the connection goes. Without a pause here the loop
        // reopened a stream as fast as the event loop allowed and pinned a core
        // — a failure that looks like a busy worker rather than a broken one.
        this.#running = false;
        if (!this.#stopped) await sleep(RESTART_MIN_MS);
      } catch (error) {
        this.#running = false;
        const message = (error as Error).message;
        this.logger.error(`relay stopped: ${message}; restarting in ${delay} ms`);
        await this.deps.heartbeat(false, message).catch(() => undefined);
        if (this.#stopped) break;
        await sleep(delay);
        delay = Math.min(delay * 2, RESTART_MAX_MS);
      }
      this.#running = false;
    }
  }
}
