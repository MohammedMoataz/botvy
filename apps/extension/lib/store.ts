import { makeAutoObservable, runInAction } from 'mobx';
import {
  AuthStore as SdkAuthStore,
  BotvyClient,
  TokenStore,
  type SignedInMember,
  type TokenPair,
} from '@botvy/sdk';
import { GATEWAY_URL, readTokens, writeTokens } from './config';
import { getMeta, setMeta } from './db';
import { applyDirection, loadLocale, saveLocale, translate, type Locale } from './i18n';

/**
 * The panel's session, on the SDK.
 *
 * Two constraints shape this file and neither is negotiable.
 *
 * `chrome.storage` is asynchronous and the SDK's token storage is not, so the
 * store keeps a synchronous in-memory mirror that `hydrate()` fills and every
 * write flushes back. And the side panel is *destroyed* every time it closes,
 * so that mirror is rebuilt from `chrome.storage` on each mount — which is why
 * nothing durable may live in React state alone.
 *
 * The refresh function used to be a `fetch` written here. It is the SDK's now:
 * a second single-flight refresh is a second chance to spend the same refresh
 * token twice, and the API reads that as a stolen token and revokes the whole
 * family. The panel and the service worker share one `chrome.storage` key, so
 * that was a real risk rather than a tidy-up.
 */

export type AuthStatus = 'idle' | 'pending' | 'authenticated' | 'error';
export type AuthFailure = 'invalid_credentials' | 'session_replay' | 'unknown';

const LAST_EMAIL_KEY = 'auth.lastEmail';

export class PanelStore {
  locale: Locale = 'en';
  hydrated = false;
  email = '';
  status: AuthStatus = 'idle';
  failure: AuthFailure | null = null;
  member: SignedInMember | null = null;

  /** The synchronous mirror the SDK reads; chrome.storage stays the durable copy. */
  readonly mirror: TokenStore;
  readonly client: BotvyClient;
  readonly auth: SdkAuthStore;

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
      // Deferred through a closure: the auth store needs the client, the client
      // needs this token store, and a refresh can only happen after all three
      // exist.
      (refreshToken) => this.auth.refreshFn(refreshToken),
    );

    this.client = new BotvyClient({ baseUrl: GATEWAY_URL, tokens: this.mirror });
    this.auth = new SdkAuthStore(this.client, this.mirror);

    makeAutoObservable(this, { mirror: false, client: false, auth: false });

    this.auth.subscribe((member) => {
      runInAction(() => {
        this.member = member;
        if (!member && this.status === 'authenticated') {
          this.status = 'idle';
          this.failure =
            this.auth.lastSignOutReason === 'session_replay' ? 'session_replay' : null;
        }
      });
    });
  }

  get isAuthenticated(): boolean {
    return this.mirror.signedIn;
  }

  /** What to greet the member with once signed in. */
  get displayName(): string {
    return this.member?.email ?? this.email;
  }

  t = (key: string, params?: Record<string, string | number>): string =>
    translate(this.locale, key, params);

  /**
   * The side panel is destroyed on close, so every mount starts from the
   * durable copies: locale and tokens from chrome.storage, the last address
   * from Dexie.
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
    runInAction(() => {
      this.status = 'pending';
      this.failure = null;
    });

    try {
      const member = await this.auth.login(email, password, await this.deviceDescriptor());
      // Remembered so a reopened panel does not ask for the address again. The
      // address is not a credential; the password is never stored.
      await setMeta(LAST_EMAIL_KEY, email);
      runInAction(() => {
        this.member = member;
        this.status = 'authenticated';
      });
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        this.failure =
          (error as { status?: number }).status === 401 ? 'invalid_credentials' : 'unknown';
      });
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await writeTokens(null);
    runInAction(() => {
      this.status = 'idle';
      this.failure = null;
      this.member = null;
    });
  }

  /**
   * How this installation identifies itself.
   *
   * A per-install id minted once and kept in Dexie, beside the last address —
   * the same durable store, so one place to look. It must survive the panel
   * closing: a fresh id on every sign-in would give the member a new device row
   * each time, and then one notification per row.
   *
   * `chrome_extension` is a device kind of its own precisely because FCM does
   * not work here. The server needs to know not to try.
   */
  private async deviceDescriptor(): Promise<{
    installId: string;
    kind: 'chrome_extension';
    name: string;
  }> {
    const key = 'auth.installId';
    let installId = await getMeta<string>(key);
    if (!installId) {
      installId = crypto.randomUUID();
      await setMeta(key, installId);
    }
    return { installId, kind: 'chrome_extension', name: 'Browser extension' };
  }
}
