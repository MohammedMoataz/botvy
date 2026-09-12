import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { Env } from '../config/env.schema.js';
import type { AccessTokenClaims } from './jwt.verifier.js';

/**
 * Mints access tokens, and only access tokens.
 *
 * The counterpart to `JwtVerifier`, and deliberately as small: the claims it
 * signs are the claims that class reads, so the two cannot drift into a token
 * one issues and the other refuses. `scripts/dev-token.ts` hand-rolled the same
 * `jwt.sign` call, which is exactly the drift this prevents.
 *
 * Refresh tokens are not here. They are database-backed with rotation and reuse
 * detection, which is a store, a table and a family id — P1's work, and putting
 * a half version of it in this file would make that harder rather than easier.
 */
@Injectable()
export class JwtSigner {
  constructor(private readonly env: Pick<Env, 'JWT_ACCESS_SECRET' | 'JWT_ACCESS_TTL'>) {}

  sign(claims: AccessTokenClaims): { accessToken: string; expiresIn: string } {
    const expiresIn = this.env.JWT_ACCESS_TTL;
    return {
      accessToken: jwt.sign(claims, this.env.JWT_ACCESS_SECRET, {
        expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      }),
      expiresIn,
    };
  }
}
