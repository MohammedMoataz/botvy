import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertRegistrationOpen } from './registration-gate.js';

export interface VerifiedGoogleUser {
  email: string;
  displayName?: string;
  /** Firebase's stable user id for this account. */
  subject: string;
}

/**
 * Verifies a Firebase ID token produced by Google Sign-in in the mobile app,
 * then maps it onto a botvy user.
 *
 * Firebase is used only to *prove who someone is*. The account itself, and
 * everything it owns, still lives in Postgres and is still authorised by this
 * gateway's own JWT — the constitution's "gateway owns all data" holds
 * unchanged. Nothing about a user is read from or written to Google.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private verifier: ((token: string) => Promise<Record<string, unknown>>) | null = null;
  private initialized = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const credentialsPath = this.config.get<string>('FIREBASE_CREDENTIALS_FILE');
    if (!credentialsPath) {
      this.logger.warn(
        'FIREBASE_CREDENTIALS_FILE not set — Google Sign-in is disabled. ' +
          'Email/password login is unaffected.',
      );
      return;
    }

    try {
      const { getApps, initializeApp, cert } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      if (getApps().length === 0) {
        initializeApp({ credential: cert(credentialsPath) });
      }
      const auth = getAuth();
      this.verifier = (token: string) =>
        auth.verifyIdToken(token) as unknown as Promise<Record<string, unknown>>;
      this.logger.log('Google Sign-in verification ready');
    } catch (err) {
      this.logger.error(`Could not initialise Firebase auth, Google Sign-in disabled: ${String(err)}`);
    }
  }

  get isConfigured(): boolean {
    return this.verifier !== null;
  }

  async verify(idToken: string): Promise<VerifiedGoogleUser> {
    await this.ensureInit();
    if (!this.verifier) {
      throw new UnauthorizedException('Google Sign-in is not configured on this server');
    }

    let claims: Record<string, unknown>;
    try {
      claims = await this.verifier(idToken);
    } catch (err) {
      this.logger.warn(`rejected Google ID token: ${String(err)}`);
      throw new UnauthorizedException('Invalid Google sign-in token');
    }

    const email = typeof claims.email === 'string' ? claims.email : null;
    const emailVerified = claims.email_verified === true;
    const subject = typeof claims.uid === 'string' ? claims.uid : String(claims.sub ?? '');

    if (!email) {
      throw new UnauthorizedException('Google account has no email address');
    }
    // An unverified address could be attacker-chosen, and email is the key we
    // match existing accounts on — accepting one would let someone claim
    // another person's account.
    if (!emailVerified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    return {
      email: email.toLowerCase(),
      displayName: typeof claims.name === 'string' ? claims.name : undefined,
      subject,
    };
  }

  /**
   * Finds the botvy user for a verified Google identity, creating one on first
   * sign-in. Matching is by email, so signing in with Google to an address that
   * already registered with a password links to that same account rather than
   * creating a duplicate.
   */
  async findOrCreateUser(user: VerifiedGoogleUser) {
    const existing = await this.prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      if (existing.status === 'banned') {
        throw new UnauthorizedException('This account has been disabled');
      }
      return existing;
    }

    // Below this line a NEW account would be created, so the registration
    // gate applies. Above it, existing users keep signing in either way.
    assertRegistrationOpen(this.config);

    return this.prisma.user.create({
      data: {
        email: user.email,
        // No local password: this account authenticates through Google. The
        // column is non-null, so it holds a value that no bcrypt/argon2 verify
        // can ever match, rather than an empty string that might.
        passwordHash: `google:${user.subject}`,
        displayName: user.displayName,
      },
    });
  }
}
