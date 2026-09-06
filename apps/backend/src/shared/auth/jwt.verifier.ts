import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { Env } from '../config/env.schema.js';
import type { Principal, Role } from './principal.js';

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  email?: string;
}

export class TokenExpiredError extends Error {
  readonly code = 'token_expired';
}
export class TokenInvalidError extends Error {
  readonly code = 'token_invalid';
}

/**
 * One place that turns an access token into a principal, used by the REST
 * strategy, the GraphQL guard and the socket handshake alike.
 *
 * The socket cannot go through Passport — there is no request to attach to at
 * handshake time — and duplicating verification for it is how the two drift
 * until one accepts something the other refuses.
 */
@Injectable()
export class JwtVerifier {
  constructor(private readonly env: Pick<Env, 'JWT_ACCESS_SECRET'>) {}

  verify(token: string): Principal {
    try {
      const claims = jwt.verify(token, this.env.JWT_ACCESS_SECRET) as AccessTokenClaims;
      return this.toPrincipal(claims);
    } catch (error) {
      if ((error as Error).name === 'TokenExpiredError') {
        // Distinct from invalid on purpose: a client that knows the token merely
        // expired refreshes and reconnects, where an invalid one signs in again.
        throw new TokenExpiredError('access token expired');
      }
      throw new TokenInvalidError('access token could not be verified');
    }
  }

  toPrincipal(claims: AccessTokenClaims): Principal {
    if (!claims?.sub) throw new TokenInvalidError('access token carries no subject');
    return {
      kind: 'user',
      id: claims.sub,
      role: claims.role === 'admin' ? 'admin' : 'user',
      ...(claims.email ? { email: claims.email } : {}),
    };
  }
}
