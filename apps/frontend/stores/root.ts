import { makeAutoObservable, runInAction } from 'mobx';
import { postJson } from '../lib/api';

// ponytail: local AuthStore holding the shape `@botvy/sdk` exports in T050
// (login/logout, accessToken, status). Swap the class for the SDK's when it
// lands — the components only touch these four members.

export type AuthStatus =
  'idle' | 'pending' | 'authenticated' | 'unavailable' | 'error';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthStore {
  accessToken: string | null = null;
  status: AuthStatus = 'idle';
  /** Server-supplied detail for `status === 'error'` only; the UI translates the rest. */
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  async login(email: string, password: string): Promise<void> {
    this.status = 'pending';
    this.error = null;

    const res = await postJson<TokenPair>('/api/v1/auth/login', {
      email,
      password,
    });

    runInAction(() => {
      // P0 ships the wired form without the endpoint: a 404 is "not yet", not a failure.
      if (res.status === 404) {
        this.status = 'unavailable';
        return;
      }
      if (!res.ok || !res.data) {
        this.status = 'error';
        this.error =
          res.error && res.error.length > 0 ? res.error : `HTTP ${res.status}`;
        return;
      }
      this.accessToken = res.data.accessToken;
      this.status = 'authenticated';
    });
  }

  logout(): void {
    this.accessToken = null;
    this.status = 'idle';
    this.error = null;
  }
}

/** One per request on the server, one per tab in the browser. */
export class RootStore {
  readonly auth = new AuthStore();
}
