import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ROLES } from './decorators.js';
import { principalFrom } from './principal-from-context.js';
import type { Role } from './principal.js';

/**
 * Role check, on top of authentication. A machine caller has no role and never
 * satisfies one: a service token is not an administrator, however trusted the
 * client is.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const principal = principalFrom(context);
    if (!principal) throw new ForbiddenException('no principal on this request');

    if (principal.kind !== 'user') {
      throw new ForbiddenException('a machine caller holds no role');
    }
    if (!required.includes(principal.role)) {
      throw new ForbiddenException(`requires role: ${required.join(' or ')}`);
    }
    return true;
  }
}
