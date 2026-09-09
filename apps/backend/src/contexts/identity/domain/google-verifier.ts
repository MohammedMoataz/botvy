/**
 * What a Google id token turns into once it has been checked.
 *
 * A port, because the real verifier fetches Google's signing keys over the
 * network and every handler spec would otherwise need either a live connection
 * or a mocked HTTP client. The rule it enforces — that the audience matches this
 * installation's own client id — belongs to the adapter, since it is the only
 * part that knows what a token looks like.
 */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  pictureUrl: string | null;
}

export class GoogleTokenInvalid extends Error {
  constructor(why = 'the Google id token could not be verified') {
    super(why);
  }
}

export interface GoogleVerifier {
  /** Throws `GoogleTokenInvalid` rather than returning null: a token that does
   * not verify is not an absent identity, it is a refused one, and a caller that
   * treats the two the same ends up creating accounts for forged tokens. */
  verify(idToken: string): Promise<GoogleIdentity>;
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');
