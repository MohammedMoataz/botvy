import type { TokenStore } from './tokens.js';

export type SocketState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'signed-out';

/** The subset of a Socket.IO socket this wrapper drives, so it can be faked. */
export interface SocketLike {
  connected: boolean;
  auth: Record<string, unknown>;
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (payload: unknown) => void): void;
  emit(event: string, payload?: unknown): void;
}

export interface SocketOptions {
  tokens: TokenStore;
  /** Builds a socket for a URL. The caller supplies io() so this stays testable. */
  connect(url: string, auth: Record<string, unknown>): SocketLike;
  baseUrl?: string;
  installId?: string;
  onState?(state: SocketState): void;
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

    this.setState(this.#socket || this.#hasConnected ? 'reconnecting' : 'connecting');
    this.#hasConnected = true;

    const socket = this.options.connect(`${this.options.baseUrl ?? ''}/ws`, {
      token,
      ...(this.options.installId ? { installId: this.options.installId } : {}),
    });
    this.#socket = socket;

    socket.on('connect', () => this.setState('connected'));
    socket.on('disconnect', () => {
      if (this.#state !== 'signed-out') this.setState('reconnecting');
    });

    // The two refusals, told apart.
    socket.on('token_expired', () => void this.refreshAndReconnect());
    socket.on('auth.expiring', () => void this.refreshAndReconnect());
    socket.on('connect_error', (payload) => {
      // Socket.IO hands the server's refusal over as an `Error`, so
      // `String(payload)` was "Error: token_expired" and never matched - every
      // expired token signed the member out instead of refreshing. The server
      // puts the code on `err.data`; the message is the fallback.
      const error = payload as { data?: { code?: unknown }; message?: unknown } | undefined;
      const code = error?.data?.code ?? error?.message ?? payload;
      if (String(code) === 'token_expired') void this.refreshAndReconnect();
      else this.setState('signed-out');
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

  private setState(state: SocketState): void {
    this.#state = state;
    this.options.onState?.(state);
  }
}
