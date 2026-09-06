import { makeAutoObservable, runInAction } from 'mobx';
import { BotvyClient, NotAvailableYetError, TokenStore, type TokenPair } from '@botvy/sdk';
import { GATEWAY_URL, readTokens, writeTokens } from './config';
import { getMeta, setMeta } from './db';
import {
  applyDirection,
  loadLocale,
  saveLocale,
  translate,
  type Locale,
} from './i18n';

/**
 * The panel's session, on the SDK.
 *
 * chrome.storage is asynchronous and the SDK's token storage is not, so the
 * store keeps an in-memory mirror that hydrate() fills and every write updates.
 * The side panel is destroyed each time it closes, so that mirror is rebuilt
 * from chrome.storage on every mount — which is exactly why nothing durable
 * may live in React state alone.
 */

export type AuthStatus =
  'idle' | 'pending' | 'authenticated' | 'unavailable' | 'error';

const LAST_EMAIL_KEY = 'auth.lastEmail';

export class PanelStore {
  locale: Locale = 'en';
  hydrated = false;
  accessToken: string | null = null;
  email = '';
  status: AuthStatus = 'idle';
  error: string | null = null;

  /** The synchronous mirror the SDK reads; chrome.storage stays the durable copy. */
  readonly mirror: TokenStore;
  readonly client: BotvyClient;

  constructor() {
    let held: TokenPair | null = null;
    this.mirror = new TokenStore(
      {
        read: () => held,
        write: (tokens) => {
          held = tokens;
          // Durable copy, best effort: a panel that closed mid-write rehydrates
          // from whichever value did land.
          void writeTokens(tokens);
        },
      },
      async (refreshToken) => {
        const response = await fetch(`${GATEWAY_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        return response.ok ? ((await response.json()) as TokenPair) : null;
      },
    );
    this.client = new BotvyClient({ baseUrl: GATEWAY_URL, tokens: this.mirror });
    makeAutoObservable(this, { mirror: false, client: false });
  }

  get isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  t = (key: string): string => translate(this.locale, key);

  /**
   * The side panel is destroyed on close, so every mount starts from the
   * durable copies: locale and tokens from chrome.storage, the rest from Dexie.
   */
  async hydrate(): Promise<void> {
    const [locale, tokens, lastEmail] = await Promise.all([
      loadLocale(),
      readTokens(),
      getMeta<string>(LAST_EMAIL_KEY),
    ]);
    applyDirection(locale);
    if (tokens) this.mirror.set(tokens);
    runInAction(() => {
      this.locale = locale;
      this.accessToken = tokens?.accessToken ?? null;
      this.email = lastEmail ?? '';
      this.status = tokens ? 'authenticated' : 'idle';
      this.hydrated = true;
    });
  }

  async setLocale(locale: Locale): Promise<void> {
    applyDirection(locale);
    await saveLocale(locale);
    runInAction(() => {
      this.locale = locale;
    });
  }

  setEmail(email: string): void {
    this.email = email;
  }

  async login(password: string): Promise<void> {
    const email = this.email;
    this.status = 'pending';
    this.error = null;

    try {
      const pair = await this.client.command<TokenPair>('/auth/login', { email, password });
      await writeTokens(pair);
      await setMeta(LAST_EMAIL_KEY, email);
      this.mirror.set(pair);
      runInAction(() => {
        this.accessToken = pair.accessToken;
        this.status = 'authenticated';
      });
    } catch (cause) {
      runInAction(() => {
        // The endpoint arrives in P1; a 404 today is "not yet" rather than a
        // failure, and the panel says so instead of showing an error.
        if (cause instanceof NotAvailableYetError) {
          this.status = 'unavailable';
          return;
        }
        this.status = 'error';
        this.error = cause instanceof Error ? cause.message : 'network error';
      });
    }
  }

  async logout(): Promise<void> {
    await writeTokens(null);
    this.mirror.clear();
    runInAction(() => {
      this.accessToken = null;
      this.status = 'idle';
      this.error = null;
    });
  }
}
