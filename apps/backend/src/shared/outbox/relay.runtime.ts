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
}

export const RELAY_ALIVE_EVERY_MS = 30_000;
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
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
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
