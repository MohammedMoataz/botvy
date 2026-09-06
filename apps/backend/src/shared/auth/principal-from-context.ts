import type { ExecutionContext } from '@nestjs/common';
import type { Principal } from './principal.js';

/**
 * One place that knows where a principal sits on each transport, so a guard
 * does not have to. REST hangs it on the request, GraphQL on the request inside
 * the context argument, and the socket on the client's own data — and a guard
 * that reached for the wrong one would silently see no principal and refuse
 * every call, or worse, allow one.
 */
export function principalFrom(context: ExecutionContext): Principal | undefined {
  switch (context.getType<string>()) {
    case 'ws':
      return context.switchToWs().getClient()?.data?.principal;
    case 'graphql':
      return context.getArgByIndex(2)?.req?.principal;
    default:
      return context.switchToHttp().getRequest()?.principal;
  }
}
