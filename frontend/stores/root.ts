import { makeAutoObservable, runInAction } from 'mobx';
import { io } from 'socket.io-client';
import {
  AdminStore,
  AuthStore as SdkAuthStore,
  BotvyClient,
  EmailTaken,
  GoogleLinkRequired,
  HealthStore as SdkHealthStore,
  ProfileStore as SdkProfileStore,
  RegistrationClosed,
  SocketClient,
  TokenStore,
  type SocketLike,
  type DeviceView,
  type HealthReport,
  type SignedInMember,
  type TokenPair,
} from '@botvy/sdk';

export type AuthStatus = 'idle' | 'pending' | 'authenticated' | 'error';

/** What went wrong, as something the UI can translate rather than display raw. */
export type AuthFailure =
  | 'invalid_credentials'
  | 'registration_closed'
  | 'email_taken'
  | 'link_required'
  | 'session_replay'
  | 'unknown';

const STORAGE_KEY = 'botvy.auth';

/**
 * Where the browser keeps its tokens.
 *
 * `sessionStorage`, not `localStorage`: closing the tab should end the session
 * on a machine that might be shared, and the refresh token is a credential.
 * Every access is guarded, because a private window can refuse storage
 * outright and a portal that will not load at all is worse than one that asks
 * the Owner to sign in again.
 */
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
 * The portal's session, as MobX sees it.
 *
 * A thin observable shell over the SDK's own `AuthStore`. It used to be a
 * second implementation — including its own `fetch` to `/auth/refresh` — which
 * is precisely the duplication the SDK exists to remove: two single-flight
 * refreshes eventually disagree, and the way you find out is a member being
 * signed out for a replay they did not commit.
 *
 * What lives here is only what MobX needs: observable status, a translated
 * failure code, and the subscription that turns an SDK change into a re-render.
 */
export class AuthStore {
  status: AuthStatus = 'idle';
  failure: AuthFailure | null = null;
  /** Set when Google refuses because the address has a password account. */
  linkEmail: string | null = null;
  member: SignedInMember | null = null;
  devices: DeviceView[] = [];

  readonly tokens: TokenStore;
  readonly client: BotvyClient;
  readonly sdk: SdkAuthStore;

  constructor() {
    // A cycle, broken by a closure rather than by building everything twice:
    // the token store needs a refresh function only the auth store can give,
    // the auth store needs the client, and the client needs the token store.
    // The arrow does not touch `this.sdk` until a refresh actually runs, which
    // is necessarily after this constructor has returned.
    this.tokens = new TokenStore(browserStorage(), (refreshToken) =>
      this.sdk.refreshFn(refreshToken),
    );
    this.client = new BotvyClient({ tokens: this.tokens });
    this.sdk = new SdkAuthStore(this.client, this.tokens);

    if (this.tokens.signedIn) this.status = 'authenticated';

    makeAutoObservable(this, { tokens: false, client: false, sdk: false });

    // A refused refresh signs the SDK store out on its own; this is what makes
    // the portal notice rather than sitting on a dead session.
    this.sdk.subscribe((member) => {
      runInAction(() => {
        this.member = member;
        if (!member && this.status === 'authenticated') {
          this.status = 'idle';
          this.failure =
            this.sdk.lastSignOutReason === 'session_replay' ? 'session_replay' : null;
        }
      });
    });
  }

  get isAuthenticated(): boolean {
    return this.tokens.signedIn;
  }

  get isAdmin(): boolean {
    return this.member?.role === 'admin';
  }

  /**
   * Whether *this session* was opened with the seeded password.
   *
   * Not what the overview banner reads — that comes from `/health`, because
   * this only knows about the password the current sign-in used and says
   * nothing after a reload. It is here for the immediate case: telling somebody
   * who just signed in with `admin` to change it, before they navigate.
   */
  get signedInWithDefaultPassword(): boolean {
    return this.member?.mustChangePassword === true;
  }

  async login(email: string, password: string): Promise<void> {
    await this.attempt(async () => {
      const member = await this.sdk.login(email, password);
      this.member = member;
    });
  }

  /**
   * Signs in with a Google id token the page obtained itself.
   *
   * `link_required` is not a failure to report and forget: the store keeps the
   * address so the form can ask for the password and finish, which is the
   * difference between linking an account and the member creating a second one.
   */
  async google(idToken: string): Promise<void> {
    await this.attempt(async () => {
      const member = await this.sdk.google(idToken);
      this.member = member;
    });
  }

  async googleLink(idToken: string, password: string): Promise<void> {
    await this.attempt(async () => {
      const member = await this.sdk.googleLink(idToken, password);
      this.member = member;
      this.linkEmail = null;
    });
  }

  async loadDevices(): Promise<void> {
    const devices = await this.sdk.devices();
    runInAction(() => {
      this.devices = devices;
    });
  }

  async logout(): Promise<void> {
    await this.sdk.logout();
    runInAction(() => {
      this.status = 'idle';
      this.failure = null;
      this.member = null;
      this.devices = [];
    });
  }

  /**
   * One place that maps an SDK rejection to a translatable code.
   *
   * The raw message is deliberately not shown. It is written for a developer
   * reading a log, and "email or password is incorrect" is the *only* thing the
   * sign-in path should ever say — a message that distinguished a missing
   * account from a wrong password would be an account-existence oracle on a
   * portal whose administrator login is documented.
   */
  private async attempt(action: () => Promise<void>): Promise<void> {
    runInAction(() => {
      this.status = 'pending';
      this.failure = null;
      this.linkEmail = null;
    });

    try {
      await action();
      runInAction(() => {
        this.status = 'authenticated';
      });
    } catch (error) {
      runInAction(() => {
        this.status = 'error';
        if (error instanceof GoogleLinkRequired) {
          this.failure = 'link_required';
          this.linkEmail = error.email;
        } else if (error instanceof RegistrationClosed) {
          this.failure = 'registration_closed';
        } else if (error instanceof EmailTaken) {
          this.failure = 'email_taken';
        } else if ((error as { status?: number }).status === 401) {
          this.failure = 'invalid_credentials';
        } else {
          this.failure = 'unknown';
        }
      });
    }
  }
}

/** The member's own profile and preferences, observable. */
export class ProfileStore {
  ready = false;
  loading = false;

  readonly sdk: SdkProfileStore;

  constructor(client: BotvyClient) {
    this.sdk = new SdkProfileStore(client);
    makeAutoObservable(this, { sdk: false });

    this.sdk.subscribe(() => {
      runInAction(() => {
        this.ready = this.sdk.ready;
        this.loading = this.sdk.loading;
      });
    });
  }

  get profile() {
    return this.sdk.profile;
  }

  get preferences() {
    return this.sdk.preferences;
  }

  async load(): Promise<void> {
    await this.sdk.load();
  }
}

/**
 * The platform's state, observable, and shared by whatever is on screen.
 *
 * A thin MobX shell over the SDK's `HealthStore`, for the same reason
 * `ProfileStore` above is one: the polling, the socket subscription and the
 * rule that a failed heartbeat never erases `lastOkAt` are all behaviour the
 * extension would need too, and a second copy written against React would
 * eventually disagree with this one about what "stale" means.
 */
export class HealthStore {
  report: HealthReport | null = null;
  problem: string | null = null;

  readonly sdk: SdkHealthStore;

  constructor(admin: AdminStore, socket?: SocketClient) {
    this.sdk = new SdkHealthStore(admin, socket ? { socket } : {});
    makeAutoObservable(this, { sdk: false });

    this.sdk.subscribe(() => {
      runInAction(() => {
        this.report = this.sdk.report;
        this.problem = this.sdk.problem;
      });
    });
  }

  get staleJobs(): string[] {
    return this.sdk.staleJobs;
  }

  start(): void {
    this.sdk.start();
  }

  stop(): void {
    this.sdk.stop();
  }
}

export class RootStore {
  readonly auth = new AuthStore();
  readonly profile: ProfileStore;
  readonly admin: AdminStore;
  readonly socket: SocketClient;
  readonly health: HealthStore;

  constructor() {
    this.profile = new ProfileStore(this.auth.client);
    this.admin = new AdminStore(this.auth.client);

    /*
     * Same origin, always. The portal is served by the same Caddy that proxies
     * `/ws`, so there is no host to configure and nothing to get wrong in an
     * environment file — and a socket URL that could point elsewhere would be a
     * credential sent to wherever that variable said.
     *
     * `io` is passed in rather than imported by the SDK so the client stays
     * usable from a service worker, where the default transport upgrade does
     * not apply. Here it is an ordinary browser page and the defaults are right.
     */
    this.socket = new SocketClient({
      tokens: this.auth.tokens,
      connect: (url, auth) =>
        io(url.replace(/\/ws$/, ''), {
          path: '/ws',
          transports: ['websocket'],
          // The SDK decides when to open and when to back off. A client that
          // connected itself would be doing both, and the two schedules do not
          // agree after the first refused handshake.
          autoConnect: false,
          auth,
        }) as unknown as SocketLike,
    });

    this.health = new HealthStore(this.admin, this.socket);
  }
}
