import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../../../shared/config/env.schema.js';
import {
  GoogleTokenInvalid,
  type GoogleIdentity,
  type GoogleVerifier,
} from '../domain/google-verifier.js';

/**
 * Verifies a Google id token against Google's own signing keys.
 *
 * `google-auth-library` rather than `firebase-admin`, which is what v1 used and
 * which is already a dependency here for push. Two reasons to spend the extra
 * package: this verifies a *Google* id token, whose audience is an OAuth client
 * id, which is what Flutter's `google_sign_in` and the extension's
 * `chrome.identity` flow actually produce — Firebase's own verifier expects a
 * Firebase Auth token instead. And push is optional in this platform while
 * sign-in is not; routing authentication through the Firebase SDK would make an
 * installation with no FCM credentials unable to let anyone in.
 *
 * The audience is a list because each surface has its own client id — Android,
 * iOS, the web app and the extension are four — and a token minted for any of
 * them is a token from this installation.
 */
@Injectable()
export class GoogleIdTokenVerifier implements GoogleVerifier {
  private readonly logger = new Logger(GoogleIdTokenVerifier.name);
  readonly #client = new OAuth2Client();
  readonly #audience: string[];

  constructor(env: Pick<Env, 'GOOGLE_CLIENT_IDS'>) {
    this.#audience = (env.GOOGLE_CLIENT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  /** Whether this installation can accept a Google sign-in at all. */
  get isConfigured(): boolean {
    return this.#audience.length > 0;
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.isConfigured) {
      throw new GoogleTokenInvalid(
        'Google sign-in is not configured on this installation; set GOOGLE_CLIENT_IDS',
      );
    }

    let payload;
    try {
      const ticket = await this.#client.verifyIdToken({
        idToken,
        // Checked by the library, and this is the check that matters: without
        // it any valid Google token for any application in the world would be
        // accepted as a sign-in here.
        audience: this.#audience,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(`Google id token refused: ${(error as Error).message}`);
      throw new GoogleTokenInvalid();
    }

    if (!payload?.sub || !payload.email) {
      throw new GoogleTokenInvalid('the Google id token carries no subject or email');
    }

    // An unverified address must not be trusted to identify an account. Google
    // only issues these for verified addresses in practice, but "in practice"
    // is how an account-takeover path stays open for years.
    if (payload.email_verified !== true) {
      throw new GoogleTokenInvalid('that Google address is not verified');
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: true,
      displayName: payload.name ?? null,
      pictureUrl: payload.picture ?? null,
    };
  }
}
