import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { Env } from '../config/env.schema.js';
import type { Principal, Role } from './principal.js';

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  email?: string;
  /** Seconds since the epoch, as `jsonwebtoken` writes it. */
  exp?: number;
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
    return this.verifyWithExpiry(token).principal;
  }

  /**
   * The principal and the moment the token stops being accepted.
   *
   * The socket needs the second one. It authenticates once, in the handshake,
   * and then holds the connection open for as long as the client keeps it - so
   * unlike a REST call it has to know when the credential it accepted goes
   * stale, warn the client in time to refresh, and close the socket if it does
   * not. A connection that outlives its token is an unauthenticated one.
   */
  verifyWithExpiry(token: string): { principal: Principal; expiresAt: Date | null } {
    try {
      const claims = jwt.verify(token, this.env.JWT_ACCESS_SECRET) as AccessTokenClaims;
      return {
        principal: this.toPrincipal(claims),
        expiresAt: typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : null,
      };
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
