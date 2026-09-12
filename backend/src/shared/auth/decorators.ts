import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role, Principal } from './principal.js';

export const IS_PUBLIC = 'botvy:isPublic';
export const REQUIRED_ROLES = 'botvy:roles';
export const REQUIRED_KIND = 'botvy:kind';
export const REQUIRED_SCOPES = 'botvy:scopes';

/** Opts a route out of the global JWT guard. Health and the marketing edge only. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Admin-only. Enforced on top of authentication, never instead of it. */
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);

/**
 * Member routes refuse machine callers and `/internal/*` refuses member tokens.
 * Both directions matter: the first stops a service token acting as a member,
 * the second stops a member reaching a job endpoint that assumes it is trusted.
 */
export const UsersOnly = () => SetMetadata(REQUIRED_KIND, 'user');
export const ServiceOnly = () => SetMetadata(REQUIRED_KIND, 'service');

/** Narrows a service route to clients holding a scope. */
export const Scopes = (...scopes: string[]) => SetMetadata(REQUIRED_SCOPES, scopes);

/**
 * The principal for the current request, whatever the transport. Handlers take
 * it as an argument rather than reading a request object, so a handler can be
 * driven from a spec with no HTTP at all.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal | undefined => {
    const type = context.getType<string>();
    if (type === 'ws') return context.switchToWs().getClient()?.data?.principal;
    if (type === 'graphql') return context.getArgByIndex(2)?.req?.principal;
    return context.switchToHttp().getRequest()?.principal;
  },
);
