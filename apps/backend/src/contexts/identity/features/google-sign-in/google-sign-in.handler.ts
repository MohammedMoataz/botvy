import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtSigner } from '../../../../shared/auth/jwt.signer.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { newId } from '../../../../shared/cqrs/ids.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import type { DeviceKind } from '../../domain/device.repository.js';
import {
  GOOGLE_VERIFIER,
  type GoogleVerifier,
} from '../../domain/google-verifier.js';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../../domain/password-hasher.js';
import { User } from '../../domain/user.aggregate.js';
import { UserRepository } from '../../domain/user.repository.js';
import { RefreshHandler } from '../refresh/refresh.handler.js';
import { RegisterDeviceHandler } from '../register-device/register-device.handler.js';
import {
  InvalidCredentials,
  type SignedIn,
} from '../sign-in/sign-in.handler.js';

export interface GoogleSignInCommand {
  idToken: string;
  device?: {
    installId: string;
    kind: DeviceKind;
    name?: string | null;
    pushToken?: string | null;
  };
}

export class RegistrationClosedForGoogle extends Error {
  constructor() {
    super('registration is closed on this installation');
  }
}

/**
 * A Google address that already has a password-backed account here.
 *
 * Not an error and not a sign-in: linking the two needs proof that the person
 * holding the Google identity also holds the account, and the only proof
 * available is the password. Signing them in regardless would let anyone who
 * controls an address take over the account that used it.
 */
export class LinkRequired extends Error {
  readonly code = 'link_required';
  constructor(readonly email: string) {
    super(
      'an account with that email already exists; sign in with your password to link it',
    );
  }
}

/**
 * The address belongs to an account bound to another Google identity.
 *
 * Distinct from `LinkRequired`, because there is nothing the caller can do to
 * finish: that one has a password to supply, and this one does not.
 */
export class GoogleAccountMismatch extends Error {
  readonly code = 'google_account_mismatch';
  constructor(readonly email: string) {
    super(
      'that address belongs to an account linked to a different Google identity',
    );
  }
}

export class LinkPasswordWrong extends Error {
  constructor() {
    super('email or password is incorrect');
  }
}

/**
 * Sign in — or register — with Google.
 *
 * Three cases, and the third is the one worth being careful about:
 *
 * 1. The subject is already linked → sign in.
 * 2. Nothing matches → create the account, if registration is open.
 * 3. The *email* matches an account with a password and no Google link →
 *    refuse with `link_required`, and let the member complete it by supplying
 *    that password.
 *
 * A new account created this way has no password at all, which is deliberate:
 * inventing one nobody knows would leave the member unable to change it, and
 * asking them to choose one during a Google flow defeats the point of the flow.
 */
@Injectable()
export class GoogleSignInHandler {
  private readonly logger = new Logger(GoogleSignInHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly users: UserRepository,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleVerifier,
    private readonly signer: JwtSigner,
    private readonly sessions: RefreshHandler,
    private readonly deviceRegistry: RegisterDeviceHandler,
    private readonly settings: SettingsService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  async handle(command: GoogleSignInCommand): Promise<SignedIn> {
    const identity = await this.google.verify(command.idToken);

    const existing = await this.users.findByLogin(identity.email);

    if (existing?.googleSub === identity.sub) {
      if (!existing.isActive) throw new InvalidCredentials();
      return this.issue(existing, command);
    }

    if (existing) {
      // The address is taken by a password account. Refuse, and say how to
      // finish — an unhelpful 409 here is what makes people create a second
      // account with a typo in the address.
      if (existing.passwordHash) throw new LinkRequired(identity.email);

      // The address is taken by an account already bound to a *different*
      // Google subject. Refused outright, and this is the important one: the
      // branch below used to run here and silently rebind the account, so a
      // second subject presenting a verified token for the same address took
      // it over. A deleted-and-recreated Workspace address is a new `sub` on
      // an old address, which is all it takes.
      //
      // There is no link path out of this either, because a Google-registered
      // account has no password to prove ownership with — so the honest answer
      // is that this address cannot be signed into by this identity.
      if (existing.googleSub) throw new GoogleAccountMismatch(identity.email);

      // Neither a password nor a link: an account with nothing to prove
      // ownership with at all. Linking is the only way it can ever be signed
      // into, so link it.
      // The link and the session it immediately issues are one write. `issue`
      // opens its own unit of work, and a nested `run` joins this one.
      return this.uow.run(async () => {
        existing.linkGoogle(identity.sub);
        await this.users.save(existing);
        return this.issue(existing, command);
      });
    }

    if (!(await this.settings.get('auth.registrationOpen'))) {
      throw new RegistrationClosedForGoogle();
    }

    const now = new Date();
    const registered = User.register(
      {
        id: newId(),
        email: identity.email,
        displayName: identity.displayName,
        // No password. See the note above the class.
        passwordHash: null,
        googleSub: identity.sub,
        role: 'user',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {},
    );

    const signedIn = await this.uow.run(async () => {
      await this.users.save(registered);
      return this.issue(registered, command);
    });
    this.logger.log(`registered ${identity.email} through Google`);

    return signedIn;
  }

  /**
   * Completes case 3: the member proves they hold the password account, and the
   * Google identity is attached to it.
   */
  async link(
    idToken: string,
    password: string,
    device?: GoogleSignInCommand['device'],
  ): Promise<SignedIn> {
    const identity = await this.google.verify(idToken);
    const user = await this.users.findByLogin(identity.email);

    if (!user?.passwordHash) throw new LinkPasswordWrong();
    if (!(await this.hasher.verify(user.passwordHash, password)))
      throw new LinkPasswordWrong();
    if (!user.isActive) throw new InvalidCredentials();

    return this.uow.run(async () => {
      user.linkGoogle(identity.sub);
      await this.users.save(user);
      return this.issue(user, { idToken, ...(device ? { device } : {}) });
    });
  }

  /** The same tokens and device handling an ordinary sign-in produces. */
  private async issue(
    user: User,
    command: GoogleSignInCommand,
  ): Promise<SignedIn> {
    const { deviceId, session } = await this.uow.run(async () => {
      user.recordSignIn();
      await this.users.save(user);

      const registered = command.device
        ? (
            await this.deviceRegistry.handle({
              userId: user.id,
              ...command.device,
            })
          ).deviceId
        : null;

      return {
        deviceId: registered,
        session: await this.sessions.open(user.id, registered),
      };
    });

    const { accessToken, expiresIn } = this.signer.sign({
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    return {
      accessToken,
      expiresIn,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      userId: user.id,
      email: user.email,
      role: user.role,
      deviceId,
      // A Google account has no password to still be the default one, and one
      // shorter than the minimum cannot have been set through this codebase.
      mustChangePassword: false,
    };
  }
}
