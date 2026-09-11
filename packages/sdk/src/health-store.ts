import type { AdminStore, HealthReport } from './admin-store.js';
import type { SocketClient } from './socket.js';

/**
 * How often the report is re-read (P10, T1011).
 *
 * SC-001 gives fifteen minutes for a stopped job to become visible, so thirty
 * seconds is not the number the requirement needs — it is the number an Owner
 * needs, watching the screen after restarting something and wanting to know
 * whether it came back.
 */
export const HEALTH_POLL_MS = 30_000;

/** What a heartbeat says when it arrives over the socket. */
interface HeartbeatPayload {
  job?: unknown;
  lastOkAt?: unknown;
  ok?: unknown;
}

/**
 * The platform's state, for whatever is on screen.
 *
 * ## One timer, and the socket on top of it
 *
 * The backend already emits `ops.heartbeat` to the `ops` room, which every
 * administrator's socket joins — so a job that runs shows up on the overview
 * the moment it does rather than up to thirty seconds later. But a heartbeat
 * only carries *jobs*: nothing pushes a database that has stopped answering, or
 * a model server that went away, and those are half of what the screen reports.
 * So the poll is not a fallback that switches off when the socket connects; it
 * is what keeps the other half true, and the socket is what makes the job half
 * immediate. One timer, always running, and no state machine deciding which
 * source is in charge — which is the version of this that goes wrong, because
 * the bug is always a socket that believes it is connected.
 *
 * ## A heartbeat patches, it does not replace
 *
 * `lastOkAt` only ever advances, on the server (`mongo-operations.adapters`
 * sets it only when the run succeeded) and therefore here too. A failed run
 * carries `lastOkAt: null`, and writing that through would erase the answer to
 * "when did this last work" at exactly the moment somebody needs it.
 *
 * ## Shared, because two screens asking is two answers
 *
 * The overview is not the only thing that wants this. Anything else that reads
 * its own copy would poll on its own schedule and show a different story on the
 * same screen.
 */
export class HealthStore {
  #report: HealthReport | null = null;
  #problem: string | null = null;
  #loading = false;
  #listeners = new Set<() => void>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #offSocket: (() => void) | null = null;
  /** Bumped by `stop`, so an in-flight read cannot write after it. */
  #epoch = 0;

  constructor(
    private readonly admin: AdminStore,
    private readonly options: {
      socket?: SocketClient;
      pollMs?: number;
      /** Injected so a spec does not have to wait thirty real seconds. */
      setInterval?: typeof setInterval;
      clearInterval?: typeof clearInterval;
    } = {},
  ) {}

  get report(): HealthReport | null {
    return this.#report;
  }

  get problem(): string | null {
    return this.#problem;
  }

  get loading(): boolean {
    return this.#loading;
  }

  /** Jobs that have gone quiet, named — which is what FR-001 asks for. */
  get staleJobs(): string[] {
    return (this.#report?.jobs ?? []).filter((job) => job.stale).map((job) => job.job);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Reads once, then keeps reading. Calling it twice is not two timers. */
  start(): void {
    if (this.#timer) return;
    this.#epoch += 1;

    const every = this.options.setInterval ?? setInterval;
    this.#timer = every(() => void this.refresh(), this.options.pollMs ?? HEALTH_POLL_MS);

    this.#offSocket =
      this.options.socket?.on('ops.heartbeat', (payload) => this.#applyHeartbeat(payload)) ??
      null;

    void this.refresh();
  }

  stop(): void {
    const cancel = this.options.clearInterval ?? clearInterval;
    if (this.#timer) cancel(this.#timer);
    this.#timer = null;
    this.#offSocket?.();
    this.#offSocket = null;
    // Anything still in flight belongs to the screen that has gone away.
    this.#epoch += 1;
  }

  async refresh(): Promise<void> {
    const epoch = this.#epoch;
    this.#loading = true;
    this.#announce();
    try {
      const report = await this.admin.health();
      if (epoch !== this.#epoch) return;
      this.#report = report;
      this.#problem = null;
    } catch (error) {
      if (epoch !== this.#epoch) return;
      // The previous report is kept. A screen that blanked every time one poll
      // failed would flicker on a single dropped request and tell the Owner
      // nothing about what is actually running.
      this.#problem = error instanceof Error ? error.message : String(error);
    } finally {
      if (epoch === this.#epoch) {
        this.#loading = false;
        this.#announce();
      }
    }
  }

  #applyHeartbeat(payload: unknown): void {
    const beat = (payload ?? {}) as HeartbeatPayload;
    const job = typeof beat.job === 'string' ? beat.job : null;
    if (!job || !this.#report) return;

    const ok = beat.ok !== false;
    const lastOkAt = typeof beat.lastOkAt === 'string' ? beat.lastOkAt : null;
    const existing = this.#report.jobs.find((row) => row.job === job);

    const updated = {
      job,
      // Only ever forward, matching the server.
      lastOkAt: ok ? (lastOkAt ?? new Date().toISOString()) : (existing?.lastOkAt ?? null),
      lastError: ok ? null : (existing?.lastError ?? 'failed'),
      // A heartbeat that just arrived is by definition not quiet. Whether it
      // *failed* is a different question, and `lastError` is where that is said.
      stale: false,
    };

    this.#report = {
      ...this.#report,
      jobs: existing
        ? this.#report.jobs.map((row) => (row.job === job ? updated : row))
        : [...this.#report.jobs, updated],
    };
    this.#announce();
  }

  #announce(): void {
    for (const listener of this.#listeners) listener();
  }
}
