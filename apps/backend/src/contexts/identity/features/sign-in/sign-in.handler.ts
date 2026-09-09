import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtSigner } from '../../../../shared/auth/jwt.signer.js';
import type { DeviceKind } from '../../domain/device.repository.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/password-hasher.js';
import { UserRepository } from '../../domain/user.repository.js';
import { RefreshHandler } from '../refresh/refresh.handler.js';
import { RegisterDeviceHandler } from '../register-device/register-device.handler.js';

export interface SignInCommand {
  email: string;
  password: string;
  /**
   * The client identifying its own installation. Optional because the admin
   * portal has no device to register; a phone always sends it, and sending it
   * is what binds the refresh family to that handset so signing one out leaves
   * the others alone.
   */
  device?: {
    installId: string;
    kind: DeviceKind;
    name?: string | null;
    pushToken?: string | null;
  };
}

export interface SignedIn {
  accessToken: string;
  expiresIn: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  userId: string;
  email: string;
  role: string;
  deviceId: string | null;
  mustChangePassword: boolean;
}

export class InvalidCredentials extends Error {
  constructor() {
    // One message for every failure below. A response that distinguishes
    // "no such account" from "wrong password" is an account-existence oracle,
    // and the seeded administrator's login is a published default.
    super('email or password is incorrect');
  }
}

/** The seeded password. Reported back so the client can insist on a change. */
export const DEFAULT_ADMIN_PASSWORD = 'admin';

/**
 * Sign in with an email and a password.
 *
 * It landed in P0 returning an access token and nothing else, because the
 * administrator seed had been warning on every boot that the Owner should change
 * the default password at an endpoint that could not be reached. P1 gives it the
 * other half: a refresh family, and the device that family belongs to.
 *
 * The order inside matters. The device is registered before the session is
 * opened, so the refresh row can name it — that binding is what makes "sign out
 * this phone" narrower than "sign out everywhere".
 */
@Injectable()
export class SignInHandler {
  private readonly logger = new Logger(SignInHandler.name);

  constructor(
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly signer: JwtSigner,
    private readonly sessions: RefreshHandler,
    private readonly deviceRegistry: RegisterDeviceHandler,
  ) {}

  async handle(command: SignInCommand): Promise<SignedIn> {
    const email = command.email.trim().toLowerCase();
    const user = await this.users.findByLogin(email);

    // Compared even when there is no account, so a missing one and a wrong
    // password take the same time. Bailing out early here is a timing oracle
    // that tells an attacker which addresses are registered.
    const hash = user?.passwordHash ?? (await this.hasher.hash('a value nobody will guess'));
    const matches = await this.hasher.verify(hash, command.password);

    if (!user || !matches) throw new InvalidCredentials();
    if (!user.isActive) {
      this.logger.warn(`sign-in refused for ${email}: account is not active`);
      throw new InvalidCredentials();
    }

    user.recordSignIn();
    await this.users.save(user);

    // The device before the session, so the refresh family can name it. A
    // family with no device is what the portal gets; a family bound to one is
    // what makes "sign out this phone" mean something narrower than "sign out".
    const deviceId = command.device
      ? (await this.deviceRegistry.handle({ userId: user.id, ...command.device })).deviceId
      : null;

    const { accessToken, expiresIn } = this.signer.sign({
      sub: user.id,
      role: user.role,
      email: user.email,
    });
    const session = await this.sessions.open(user.id, deviceId);

    return {
      accessToken,
      expiresIn,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      userId: user.id,
      email: user.email,
      role: user.role,
      deviceId,
      // Surfaced rather than enforced: refusing to sign in would leave the
      // Owner with no way to reach the endpoint that fixes it.
      mustChangePassword: command.password === DEFAULT_ADMIN_PASSWORD,
    };
  }
}
