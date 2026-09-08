import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtSigner } from '../../../../shared/auth/jwt.signer.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../domain/password-hasher.js';
import { UserRepository } from '../../domain/user.repository.js';

export interface SignInCommand {
  email: string;
  password: string;
}

export interface SignedIn {
  accessToken: string;
  expiresIn: string;
  userId: string;
  email: string;
  role: string;
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
 * P0 shipped a seeded administrator, a hasher, a verifier and a warning telling
 * the Owner to change the password at an endpoint that did not exist. This is
 * the smallest thing that makes that warning true: it returns an access token
 * and nothing else.
 *
 * No refresh token. That is database-backed with rotation and reuse detection,
 * and it belongs to P1 whole rather than half.
 */
@Injectable()
export class SignInHandler {
  private readonly logger = new Logger(SignInHandler.name);

  constructor(
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly signer: JwtSigner,
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

    const { accessToken, expiresIn } = this.signer.sign({
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    return {
      accessToken,
      expiresIn,
      userId: user.id,
      email: user.email,
      role: user.role,
      // Surfaced rather than enforced: refusing to sign in would leave the
      // Owner with no way to reach the endpoint that fixes it.
      mustChangePassword: command.password === DEFAULT_ADMIN_PASSWORD,
    };
  }
}
