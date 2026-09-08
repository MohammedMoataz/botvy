import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ServiceClientRepository } from '../../contexts/identity/domain/service-client.repository.js';
import { REQUIRED_KIND } from './decorators.js';

/**
 * Authenticates a machine caller on `/internal/*`.
 *
 * Two rules it must never relax. It refuses a member's JWT outright, however
 * valid — an internal endpoint assumes its caller is trusted infrastructure,
 * and a member reaching one would be acting with that trust. And the token is
 * compared as a hash in constant time: a comparison that returns early on the
 * first differing byte lets a caller guess the token one byte at a time.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(
    private readonly clients: ServiceClientRepository,
    // Registered globally, the guard must know which routes are its business:
    // only those marked @ServiceOnly(). Without a reflector (a spec calling it
    // directly) it checks every call, which is what the specs already expect.
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (this.reflector) {
      const requiredKind = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_KIND, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (requiredKind !== 'service') return true;
    }

    const presented = readServiceToken(request);

    if (!presented) {
      throw new ForbiddenException('this endpoint requires a service token');
    }

    // A JWT is three dot-separated base64 segments. Refusing it here, by shape,
    // means a member token never even reaches the hash comparison.
    if (looksLikeJwt(presented)) {
      throw new ForbiddenException('a member token cannot authenticate a machine endpoint');
    }

    const client = await this.clients.verifyToken(hashToken(presented));
    if (!client || client.revokedAt) {
      throw new ForbiddenException('service token not recognised');
    }

    request.principal = {
      kind: 'service',
      id: client.id,
      name: client.name,
      scopes: client.scopes,
    };

    // Best-effort: a failure to record last-used must not refuse the call.
    void this.clients.touch(client.id, new Date()).catch(() => undefined);
    return true;
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time compare of two hex digests. Exported so the repository adapter
 * uses the same one rather than `===`.
 */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function looksLikeJwt(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function readServiceToken(request: {
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  const headers = request.headers ?? {};
  const direct = headers['x-service-token'];
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const authorization = headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const value = authorization.slice('Bearer '.length).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}
