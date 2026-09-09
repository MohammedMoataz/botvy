import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, REQUIRED_KIND } from './decorators.js';
import { JwtVerifier, TokenExpiredError } from './jwt.verifier.js';

/**
 * The global authentication guard for REST and GraphQL. Registered as an
 * `APP_GUARD`, so a route is authenticated unless it opts out with `@Public()`.
 *
 * That default matters more than it looks: a guard applied per-controller
 * protects the controllers someone remembered, and the one endpoint added in a
 * hurry is the one that ships open.
 *
 * `/internal/*` routes carry their own service-token guard and are marked
 * public here, because a machine caller has no JWT to present.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // The socket authenticated in its handshake and carries the principal on
    // `client.data`. There is no request here to read a bearer header from, so
    // running this guard on a socket message would refuse every one of them.
    if (context.getType<string>() === 'ws') return true;

    // A machine route authenticates with a service token, not a JWT; the
    // ServiceTokenGuard that follows this one owns that check.
    const requiredKind = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_KIND, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredKind === 'service') return true;

    const request = requestOf(context);
    if (!request) throw new UnauthorizedException('no request to authenticate');

    const token = bearerFrom(request.headers?.authorization);
    if (!token) throw new UnauthorizedException('no access token presented');

    try {
      request.principal = this.verifier.verify(token);
      return true;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        // The client refreshes on this and retries; telling it "invalid" would
        // send it to a sign-in screen it does not need.
        throw new UnauthorizedException('token_expired');
      }
      throw new UnauthorizedException('token_invalid');
    }
  }
}

function requestOf(context: ExecutionContext): { headers?: Record<string, string | undefined>; principal?: unknown } | undefined {
  if (context.getType<string>() === 'graphql') {
    return context.getArgByIndex(2)?.req;
  }
  return context.switchToHttp().getRequest();
}

export function bearerFrom(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}
