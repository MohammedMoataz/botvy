import type { BotvyClient } from './client.js';
import { ApiError } from './client.js';
import type { TokenPair, TokenStore } from './tokens.js';

export type Role = 'user' | 'admin';
export type DeviceKind = 'android' | 'ios' | 'chrome_extension' | 'web';

export interface SignedInMember {
  userId: string;
  email: string;
  role: Role;
  deviceId: string | null;
  mustChangePassword: boolean;
}

export interface DeviceDescriptor {
  installId: string;
  kind: DeviceKind;
  name?: string;
  pushToken?: string;
}

/**
 * A registered installation, as a client sees it.
 *
 * `hasPush`, not the token. Whether a device can be reached is what a screen
 * renders; the token is a credential for somebody else's service, and the REST
 * read this replaced handed it to every browser the member signed in from.
 */
export interface DeviceView {
  id: string;
  kind: string;
  hasPush: boolean;
  lastSeenAt: string | null;
}

/**
 * Raised when a Google sign-in hits an address that already has a password.
 *
 * A distinct type rather than a status code, because the caller has something
 * specific to do about it: collect the password and call `googleLink`. A flat
 * 409 leaves the UI guessing, and the guess people make is to tell the member
 * the address is taken — which sends them off to register a second account with
 * a typo in it.
 */
export class GoogleLinkRequired extends Error {
  constructor(readonly email: string) {
    super(
      'that address already has a password account; link it with the password',
    );
    this.name = 'GoogleLinkRequired';
  }
}

export class RegistrationClosed extends Error {
  constructor() {
    super('registration is closed on this installation');
    this.name = 'RegistrationClosed';
  }
}

export class EmailTaken extends Error {
  constructor() {
    super('an account with that email already exists');
    this.name = 'EmailTaken';
  }
}

/** The reason a session ended, when the store ends one by itself. */
export type SignedOutReason =
  'requested' | 'token_expired' | 'session_replay' | 'refused';

/**
 * Everything the web surfaces do with a credential.
 *
 * Framework-neutral on purpose: it exposes `subscribe`, and the frontend wraps
 * it in a MobX store while the extension reads it from a side panel that
 * re-mounts on every close. Putting MobX in this package would make the
 * extension depend on the web app's choice of state library.
 *
 * It owns the `TokenStore`'s refresh function, which is what makes the
 * single-flight refresh actually cover every caller: one place performs the
 * exchange, everybody else joins it.
 */
export class AuthStore {
  #member: SignedInMember | null = null;
  #listeners = new Set<(member: SignedInMember | null) => void>();
  #lastSignOutReason: SignedOutReason | null = null;

  constructor(
    private readonly client: BotvyClient,
    private readonly tokens: TokenStore,
  ) {}

  get member(): SignedInMember | null {
    return this.#member;
  }

  get signedIn(): boolean {
    return this.tokens.signedIn && this.#member !== null;
  }

  get isAdmin(): boolean {
    return this.#member?.role === 'admin';
  }

  /** Why the last sign-out happened, for a page that wants to say so. */
  get lastSignOutReason(): SignedOutReason | null {
    return this.#lastSignOutReason;
  }

  subscribe(listener: (member: SignedInMember | null) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * The refresh function to hand `TokenStore`.
   *
   * Wired here rather than in the client so a *refused* refresh — a rotated
   * token, a revoked family, a deleted account — signs the member out of this
   * store too. Otherwise the tokens would be gone while the UI still believed
   * somebody was logged in.
   */
  refreshFn = async (refreshToken: string): Promise<TokenPair | null> => {
    try {
      const issued = await this.client.rest<{
        accessToken: string;
        refreshToken: string;
      }>('POST', '/auth/refresh', { refreshToken });
      return {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
      };
    } catch (error) {
      const code =
        (error as ApiError | undefined) instanceof ApiError
          ? ((error as ApiError).body as { code?: SignedOutReason } | null)
              ?.code
          : undefined;
      this.#signedOut(code ?? 'refused');
      return null;
    }
  };

  async register(input: {
    email: string;
    password: string;
    passwordConfirm: string;
    displayName?: string;
    locale?: string;
    timezone?: string;
  }): Promise<{ userId: string; email: string }> {
    try {
      return await this.client.rest('POST', '/auth/register', input);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403)
        throw new RegistrationClosed();
      if (error instanceof ApiError && error.status === 409)
        throw new EmailTaken();
      throw error;
    }
  }

  async login(
    email: string,
    password: string,
    device?: DeviceDescriptor,
  ): Promise<SignedInMember> {
    const answer = await this.client.rest<
      SignedInMember & { accessToken: string; refreshToken: string }
    >('POST', '/auth/login', {
      email,
      password,
      ...(device ? { device } : {}),
    });

    return this.#adopt(answer);
  }

  async google(
    idToken: string,
    device?: DeviceDescriptor,
  ): Promise<SignedInMember> {
    try {
      const answer = await this.client.rest<
        SignedInMember & { accessToken: string; refreshToken: string }
      >('POST', '/auth/google', { idToken, ...(device ? { device } : {}) });
      return this.#adopt(answer);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const body = error.body as { code?: string; email?: string } | null;
        if (body?.code === 'link_required')
          throw new GoogleLinkRequired(body.email ?? '');
      }
      if (error instanceof ApiError && error.status === 403)
        throw new RegistrationClosed();
      throw error;
    }
  }

  /** Completes what `google` refused with `GoogleLinkRequired`. */
  async googleLink(
    idToken: string,
    password: string,
    device?: DeviceDescriptor,
  ): Promise<SignedInMember> {
    const answer = await this.client.rest<
      SignedInMember & { accessToken: string; refreshToken: string }
    >('POST', '/auth/google/link', {
      idToken,
      password,
      ...(device ? { device } : {}),
    });

    return this.#adopt(answer);
  }

  /**
   * Signs this session out. The local state is cleared even when the request
   * fails: a member who pressed sign-out on a flaky connection must not be
   * left looking at their own data.
   */
  async logout(): Promise<void> {
    const refreshToken = this.tokens.tokens?.refreshToken;
    try {
      if (refreshToken)
        await this.client.rest('POST', '/auth/logout', { refreshToken });
    } finally {
      this.#signedOut('requested');
    }
  }

  async logoutEverywhere(): Promise<{ sessionsEnded: number }> {
    try {
      return await this.client.rest('POST', '/auth/logout/all');
    } finally {
      this.#signedOut('requested');
    }
  }

  /**
   * Changes the password, then signs out — the API revokes every session,
   * including this one, so the tokens in hand are already dead. Clearing them
   * here is what stops the next request looking like a replay.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.client.rest('POST', '/auth/password', {
      currentPassword,
      newPassword,
    });
    this.#signedOut('requested');
  }

  async deleteAccount(password?: string): Promise<void> {
    await this.client.rest(
      'POST',
      '/auth/delete-account',
      password ? { password } : {},
    );
    this.#signedOut('requested');
  }

  async registerDevice(
    device: DeviceDescriptor,
  ): Promise<{ deviceId: string; created: boolean }> {
    return this.client.rest('POST', '/auth/devices', device);
  }

  async devices(): Promise<DeviceView[]> {
    const { myDevices } = await this.client.query<{ myDevices: DeviceView[] }>(`
      query MyDevices {
        myDevices { id kind hasPush lastSeenAt }
      }
    `);
    return myDevices;
  }

  async removeDevice(deviceId: string): Promise<void> {
    await this.client.rest(
      'DELETE',
      `/auth/devices/${encodeURIComponent(deviceId)}`,
    );
  }

  #adopt(
    answer: SignedInMember & { accessToken: string; refreshToken: string },
  ): SignedInMember {
    this.tokens.set({
      accessToken: answer.accessToken,
      refreshToken: answer.refreshToken,
    });
    this.#lastSignOutReason = null;
    this.#member = {
      userId: answer.userId,
      email: answer.email,
      role: answer.role,
      deviceId: answer.deviceId ?? null,
      mustChangePassword: answer.mustChangePassword,
    };
    this.#announce();
    return this.#member;
  }

  #signedOut(reason: SignedOutReason): void {
    this.#lastSignOutReason = reason;
    this.#member = null;
    this.tokens.clear();
    this.#announce();
  }

  #announce(): void {
    for (const listener of this.#listeners) listener(this.#member);
  }
}
