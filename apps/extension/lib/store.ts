import { makeAutoObservable, runInAction } from 'mobx';
import { GATEWAY_URL, readTokens, writeTokens, type TokenPair } from './config';
import { getMeta, setMeta } from './db';
import {
  applyDirection,
  loadLocale,
  saveLocale,
  translate,
  type Locale,
} from './i18n';

// ponytail: local store holding the shape `@botvy/sdk` exports in T050
// (AuthStore.login/logout + tokens). Swap the auth half for the SDK's when it
// lands; App.tsx only touches these members.

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

  constructor() {
    makeAutoObservable(this);
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

    let status = 0;
    let tokens: TokenPair | null = null;
    try {
      const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      status = res.status;
      if (res.ok) tokens = (await res.json()) as TokenPair;
    } catch (cause) {
      runInAction(() => {
        this.status = 'error';
        this.error = cause instanceof Error ? cause.message : 'network error';
      });
      return;
    }

    // The endpoint arrives in P1; a 404 today is "not yet", not a failure.
    if (status === 404) {
      runInAction(() => {
        this.status = 'unavailable';
      });
      return;
    }
    if (!tokens) {
      runInAction(() => {
        this.status = 'error';
        this.error = `HTTP ${status}`;
      });
      return;
    }

    const pair = tokens; // narrowed const: `tokens` is a let, and TS widens it again inside the closure
    await writeTokens(pair);
    await setMeta(LAST_EMAIL_KEY, email);
    runInAction(() => {
      this.accessToken = pair.accessToken;
      this.status = 'authenticated';
    });
  }

  async logout(): Promise<void> {
    await writeTokens(null);
    runInAction(() => {
      this.accessToken = null;
      this.status = 'idle';
      this.error = null;
    });
  }
}
