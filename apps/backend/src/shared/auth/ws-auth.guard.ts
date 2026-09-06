import { Injectable } from '@nestjs/common';
import { JwtVerifier, TokenExpiredError } from './jwt.verifier.js';
import type { Principal } from './principal.js';

export class WsUnauthorized extends Error {
  constructor(readonly reason: 'unauthorized' | 'token_expired') {
    super(reason);
    this.name = 'WsUnauthorized';
  }
}

export interface HandshakeLike {
  auth?: { token?: unknown };
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Authentication for the socket, run during the handshake rather than per
 * message: a connection that was never allowed should not be open at all.
 *
 * The token rides in the Socket.IO `auth` payload, not a query string — a query
 * string lands in access logs and proxy history. A service principal is refused
 * outright: `/ws` carries member traffic, and a machine caller has REST.
 */
@Injectable()
export class WsAuthGuard {
  constructor(private readonly verifier: JwtVerifier) {}

  authenticate(handshake: HandshakeLike): Principal {
    const token = readToken(handshake);
    if (!token) throw new WsUnauthorized('unauthorized');

    let principal: Principal;
    try {
      principal = this.verifier.verify(token);
    } catch (error) {
      // The client reconnects with a fresh token on this rather than keeping a
      // dead socket open.
      throw new WsUnauthorized(error instanceof TokenExpiredError ? 'token_expired' : 'unauthorized');
    }

    if (principal.kind !== 'user') {
      throw new WsUnauthorized('unauthorized');
    }
    return principal;
  }
}

function readToken(handshake: HandshakeLike): string | null {
  const fromAuth = handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const authorization = handshake.headers?.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const value = authorization.slice('Bearer '.length).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
