import { makeAutoObservable, runInAction } from 'mobx';
import { BotvyClient, NotAvailableYetError, TokenStore, type TokenPair } from '@botvy/sdk';

export type AuthStatus = 'idle' | 'pending' | 'authenticated' | 'unavailable' | 'error';

/**
 * Where the browser keeps its tokens.
 *
 * `sessionStorage`, not `localStorage`: closing the tab should end the session
 * on a machine that might be shared, and the refresh token is a credential.
 * Every access is guarded, because a private window can refuse storage
 * outright and a portal that will not load at all is worse than one that asks
 * the Owner to sign in again.
 */
const STORAGE_KEY = 'botvy.auth';

function browserStorage() {
  return {
    read(): TokenPair | null {
      try {
        const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as TokenPair) : null;
      } catch {
        return null;
      }
    },
    write(tokens: TokenPair | null): void {
      try {
        if (tokens) globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(tokens));
        else globalThis.sessionStorage?.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to do about it, and nothing worth breaking the page over.
      }
    },
  };
}

/**
 * The admin portal's session.
 *
 * It wraps the SDK rather than reimplementing it — the single-flight refresh in
 * particular is a correctness rule, not a convenience, and having a second
 * implementation of it here is how the two would eventually disagree.
 */
export class AuthStore {
  status: AuthStatus = 'idle';
  /** Server-supplied detail for `status === 'error'` only; the UI translates the rest. */
  error: string | null = null;

  readonly tokens: TokenStore;
  readonly client: BotvyClient;

  constructor() {
    this.tokens = new TokenStore(browserStorage(), async (refreshToken) => {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      return response.ok ? ((await response.json()) as TokenPair) : null;
    });

    this.client = new BotvyClient({ tokens: this.tokens });

    if (this.tokens.signedIn) this.status = 'authenticated';
    makeAutoObservable(this, { tokens: false, client: false });
  }

  get accessToken(): string | null {
    return this.tokens.accessToken;
  }

  get isAuthenticated(): boolean {
    return this.tokens.signedIn;
  }

  async login(email: string, password: string): Promise<void> {
    this.status = 'pending';
    this.error = null;

    try {
      const pair = await this.client.command<TokenPair>('/auth/login', { email, password });
      runInAction(() => {
        this.tokens.set(pair);
        this.status = 'authenticated';
      });
    } catch (error) {
      runInAction(() => {
        // P0 ships the wired form without the endpoint behind it: a 404 means
        // "not yet", which is a different thing to tell the Owner than "wrong
        // password".
        if (error instanceof NotAvailableYetError) {
          this.status = 'unavailable';
          return;
        }
        this.status = 'error';
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  logout(): void {
    this.tokens.clear();
    this.status = 'idle';
    this.error = null;
  }
}

export class RootStore {
  readonly auth = new AuthStore();
}
