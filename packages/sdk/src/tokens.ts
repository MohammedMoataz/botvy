export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Where tokens live on a given surface. The web uses memory plus storage; the
 *  extension uses `chrome.storage`. Neither belongs in this package. */
export interface TokenStorage {
  read(): TokenPair | null;
  write(tokens: TokenPair | null): void;
}

/** A storage that forgets when the page does. The default, and safe anywhere. */
export function inMemoryStorage(): TokenStorage {
  let held: TokenPair | null = null;
  return {
    read: () => held,
    write: (tokens) => {
      held = tokens;
    },
  };
}

export type RefreshFn = (refreshToken: string) => Promise<TokenPair | null>;

/**
 * Holds the tokens and refreshes them at most once at a time.
 *
 * The single flight is the whole point, and it is not an optimisation. The API
 * rotates refresh tokens and detects reuse: if three requests each hit a 401
 * and each posts the same refresh token, one succeeds and the other two look
 * exactly like a stolen token being replayed — so the family is revoked and the
 * member is signed out for being logged in on one device too enthusiastically.
 *
 * Ported from v1's admin client, where this was learned.
 */
export class TokenStore {
  #inFlight: Promise<TokenPair | null> | null = null;
  #listeners = new Set<(tokens: TokenPair | null) => void>();

  constructor(
    private readonly storage: TokenStorage = inMemoryStorage(),
    private readonly refreshFn: RefreshFn | null = null,
  ) {}

  get tokens(): TokenPair | null {
    return this.storage.read();
  }

  get accessToken(): string | null {
    return this.storage.read()?.accessToken ?? null;
  }

  get signedIn(): boolean {
    return this.storage.read() !== null;
  }

  set(tokens: TokenPair | null): void {
    this.storage.write(tokens);
    for (const listener of this.#listeners) listener(tokens);
  }

  clear(): void {
    this.set(null);
  }

  /** Notified on every change, so a side panel that re-mounted can catch up. */
  subscribe(listener: (tokens: TokenPair | null) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Refreshes, or joins the refresh already running. Everyone waiting gets the
   * same answer, so only one refresh token is ever spent.
   */
  async refresh(): Promise<TokenPair | null> {
    if (this.#inFlight) return this.#inFlight;

    const current = this.storage.read();
    if (!current?.refreshToken || !this.refreshFn) return null;

    this.#inFlight = this.refreshFn(current.refreshToken)
      .then((pair) => {
        // A refusal means the credential is gone for good — a rotated token, a
        // revoked family, a deleted account. Holding on to it would make every
        // subsequent request fail the same way.
        this.set(pair);
        return pair;
      })
      .catch(() => {
        // A network failure is not a refusal. The tokens stay; the caller sees
        // null and can try again when the connection returns.
        return null;
      })
      .finally(() => {
        this.#inFlight = null;
      });

    return this.#inFlight;
  }

  /** For assertions: whether a refresh is currently in flight. */
  get refreshing(): boolean {
    return this.#inFlight !== null;
  }
}
