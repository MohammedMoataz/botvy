import type { TokenStore } from './tokens.js';

export type SocketState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'signed-out';

/** The subset of a Socket.IO socket this wrapper drives, so it can be faked. */
export interface SocketLike {
  connected: boolean;
  auth: Record<string, unknown>;
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (payload: unknown) => void): void;
  emit(event: string, payload?: unknown): void;
}

/**
 * The backoff between reconnection attempts, in milliseconds.
 *
 * Doubling from a second to half a minute. The ceiling is what matters: a
 * service worker that retried every second against a Botvy switched off for the
 * weekend would keep itself awake doing nothing, and a browser that notices is
 * a browser that throttles the whole extension.
 *
 * Reset after one clean connection, not after one successful *attempt* — a
 * socket that connects and is refused in the handshake has not proved the
 * member's Botvy is back.
 */
export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 30_000];

/** The contract's own figure, and not a tuning knob. `ws-chat.md`. */
export const NUDGE_DEBOUNCE_MS = 2_000;

export interface SocketOptions {
  tokens: TokenStore;
  /** Builds a socket for a URL. The caller supplies io() so this stays testable. */
  connect(url: string, auth: Record<string, unknown>): SocketLike;
  baseUrl?: string;
  installId?: string;
  onState?(state: SocketState): void;
  /**
   * Which entities this surface wants to be nudged about.
   *
   * Emitted as `sync.subscribe` on every connect — on *every* one, not only the
   * first, because a reconnect is a new server-side socket that knows nothing
   * about what the last one asked for. The extension holds four entities and
   * has no use for a nudge about messages.
   */
  entities?: string[];
  /**
   * What to do when the member's data changed somewhere else.
   *
   * Debounced by `NUDGE_DEBOUNCE_MS`, which the contract states: a device
   * pushing twenty rows raises a nudge per push, and one sync per nudge would
   * be twenty round trips for one change the member made.
   */
  onNudge?(entities: string[]): void;
  /**
   * How to schedule the debounce, so a test can run it synchronously.
   *
   * `setTimeout` is the default and is fine in a service worker for two
   * seconds — a worker is only reclaimed between tasks. What does *not* go
   * through a timer is the reconnect delay: an evicted worker has no timer to
   * fire, and the minute alarm is what brings it back. Nothing in this module
   * touches `window` or `document`; a socket client that did could not run in
   * the background at all.
   */
  schedule?(fn: () => void, delayMs: number): void;
}

/**
 * The live connection.
 *
 * The token rides in the handshake `auth` payload rather than a query string —
 * a query string lands in access logs and proxy history, and this one is a
 * bearer credential.
 *
 * Access tokens expire mid-connection, which is ordinary rather than
 * exceptional: a socket held open for an afternoon will outlive several of
 * them. The server says `token_expired` distinctly from `unauthorized` for
 * exactly this reason, and the difference decides what happens next — refresh
 * and reconnect, or stop and ask the member to sign in. Treating the two alike
 * is how a client ends up either holding a dead socket or signing someone out
 * every fifteen minutes.
 */
export class SocketClient {
  #socket: SocketLike | null = null;
  #state: SocketState = 'idle';
  #handlers = new Map<string, Set<(payload: unknown) => void>>();
  /** Whether this client has ever held a connection, so a reconnect after a
   *  token refresh reports as one rather than as a first attempt. */
  #hasConnected = false;
  /** Attempts since the last clean connection, for the backoff. */
  #failures = 0;
  #nudgeTimer: unknown = null;
  #nudged = new Set<string>();

  constructor(private readonly options: SocketOptions) {}

  get state(): SocketState {
    return this.#state;
  }

  /** Registered before connecting, and kept across reconnects. */
  on(event: string, handler: (payload: unknown) => void): () => void {
    let set = this.#handlers.get(event);
    if (!set) {
      set = new Set();
      this.#handlers.set(event, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  connect(): void {
    const token = this.options.tokens.accessToken;
    if (!token) {
      this.setState('signed-out');
      return;
    }

    this.setState(
      this.#socket || this.#hasConnected ? 'reconnecting' : 'connecting',
    );
    this.#hasConnected = true;

    const socket = this.options.connect(`${this.options.baseUrl ?? ''}/ws`, {
      token,
      ...(this.options.installId ? { installId: this.options.installId } : {}),
    });
    this.#socket = socket;

    socket.on('connect', () => {
      // One clean connection resets the backoff. A *refused* handshake does not
      // reach here — `connect_error` does — which is the distinction that keeps
      // a client from hammering a Botvy that is answering and rejecting.
      this.#failures = 0;
      this.setState('connected');
      const entities = this.options.entities;
      // Re-sent on every connect, because a reconnect is a new server-side
      // socket that knows nothing of what the last one asked for.
      if (entities?.length) socket.emit('sync.subscribe', { entities });
    });
    socket.on('disconnect', () => {
      if (this.#state !== 'signed-out') this.setState('reconnecting');
    });

    /*
     * The nudge, debounced, with the entity names accumulated across the window.
     *
     * Accumulated rather than taking the last payload: a burst is usually one
     * device pushing several entities in a row, and a caller that synced only
     * the entities named by the *last* nudge would leave the rest until
     * something else happened to run a pass.
     */
    socket.on('sync.nudge', (payload) => {
      const named = (payload as { entities?: unknown } | undefined)?.entities;
      if (Array.isArray(named)) {
        for (const entity of named) this.#nudged.add(String(entity));
      }
      if (this.#nudgeTimer !== null) return;
      this.#nudgeTimer = this.later(() => {
        this.#nudgeTimer = null;
        const entities = [...this.#nudged];
        this.#nudged.clear();
        this.options.onNudge?.(entities);
      }, NUDGE_DEBOUNCE_MS);
    });

    // The two refusals, told apart.
    socket.on('token_expired', () => void this.refreshAndReconnect());
    socket.on('auth.expiring', () => void this.refreshAndReconnect());
    socket.on('connect_error', (payload) => {
      // Socket.IO hands the server's refusal over as an `Error`, so
      // `String(payload)` was "Error: token_expired" and never matched - every
      // expired token signed the member out instead of refreshing. The server
      // puts the code on `err.data`; the message is the fallback.
      const error = payload as
        { data?: { code?: unknown }; message?: unknown } | undefined;
      const code = error?.data?.code ?? error?.message ?? payload;
      if (String(code) === 'token_expired') {
        void this.refreshAndReconnect();
        return;
      }
      /*
       * Anything else counts as a failed attempt and backs off.
       *
       * `signed-out` used to be the state *every* `connect_error` left,
       * including "your Botvy is switched off" — which is not a signing-out
       * matter at all: the member's tokens are good and the machine is
       * unplugged. Only an actual refusal of the credential signs them out; the
       * rest stay `reconnecting`, which is what the panel's status strip reads
       * as offline rather than as "sign in again".
       */
      this.#failures += 1;
      if (String(code) === 'unauthorized') this.setState('signed-out');
      else this.setState('reconnecting');
    });

    for (const [event, handlers] of this.#handlers) {
      socket.on(event, (payload) => {
        for (const handler of handlers) handler(payload);
      });
    }

    socket.connect();
  }

  disconnect(): void {
    this.#socket?.disconnect();
    this.#socket = null;
    this.#hasConnected = false;
    this.setState('idle');
  }

  /** Refresh first, then reconnect. Reconnecting with the dead token loops. */
  private async refreshAndReconnect(): Promise<void> {
    const refreshed = await this.options.tokens.refresh();
    if (!refreshed) {
      this.disconnect();
      this.setState('signed-out');
      return;
    }
    this.#socket?.disconnect();
    this.#socket = null;
    this.connect();
  }

  /**
   * How long to wait before the next attempt, given how many have failed.
   *
   * Exposed rather than applied internally, because *what wakes this client* is
   * the caller's business: the panel can hold a timer and the service worker
   * cannot — it is evicted between tasks, and the minute alarm is what brings it
   * back. A module that scheduled its own reconnect would work in the panel and
   * silently stop in the worker, which is the one place it matters.
   */
  get reconnectDelayMs(): number {
    const index = Math.min(this.#failures, RECONNECT_BACKOFF_MS.length - 1);
    return RECONNECT_BACKOFF_MS[index]!;
  }

  /** Attempts since the last clean connection. Zero means the last one held. */
  get failures(): number {
    return this.#failures;
  }

  private later(fn: () => void, delayMs: number): unknown {
    if (this.options.schedule) {
      this.options.schedule(fn, delayMs);
      return 'scheduled';
    }
    return setTimeout(fn, delayMs);
  }

  private setState(state: SocketState): void {
    this.#state = state;
    this.options.onState?.(state);
  }
}
