import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_KIND, REQUIRED_SCOPES } from './decorators.js';
import { principalFrom } from './principal-from-context.js';

/**
 * Enforces which kind of caller a route accepts, and the scopes a machine
 * caller needs.
 *
 * This is separate from authentication on purpose. A valid credential answers
 * "who is this"; it does not answer "may this kind of caller be here at all".
 * Collapsing the two is how a service token ends up able to act as a member.
 */
@Injectable()
export class KindGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredKind = this.reflector.getAllAndOverride<'user' | 'service' | undefined>(
      REQUIRED_KIND,
      [context.getHandler(), context.getClass()],
    );
    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_SCOPES, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredKind && !requiredScopes?.length) return true;

    const principal = principalFrom(context);
    if (!principal) throw new ForbiddenException('no principal on this request');

    if (requiredKind && principal.kind !== requiredKind) {
      throw new ForbiddenException(
        requiredKind === 'user'
          ? 'this route is for members; a service token cannot act as one'
          : 'this route is for machine callers; a member token is not one',
      );
    }

    if (requiredScopes?.length) {
      if (principal.kind !== 'service') {
        throw new ForbiddenException('scoped route reached without a service principal');
      }
      const missing = requiredScopes.filter((scope) => !principal.scopes.includes(scope));
      if (missing.length > 0) {
        throw new ForbiddenException(`missing scope: ${missing.join(', ')}`);
      }
    }

    return true;
  }
}
