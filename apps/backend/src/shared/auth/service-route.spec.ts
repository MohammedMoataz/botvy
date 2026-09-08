import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  ServiceClientRepository,
  type ServiceClient,
  type ServiceClientUpsert,
} from '../../contexts/identity/domain/service-client.repository.js';
import { REQUIRED_KIND } from './decorators.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtVerifier } from './jwt.verifier.js';
import { ServiceTokenGuard } from './service-token.guard.js';

/**
 * The two guards split authentication by route kind: a JWT for members, a
 * service token for machines. Each must step aside on the other's routes, or
 * every service route 401s before the service guard ever runs.
 */
function httpContext(request: Record<string, unknown>, metadata: Record<string, unknown>) {
  const context = {
    getType: () => 'http',
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: (key: string) => metadata[key] } as unknown as Reflector;
  return { context, reflector, request };
}

class NoClients extends ServiceClientRepository {
  calls = 0;
  async findByName(): Promise<ServiceClient | null> { return null; }
  async upsert(_c: ServiceClientUpsert): Promise<ServiceClient> { throw new Error('unused'); }
  async verifyToken(): Promise<ServiceClient | null> { this.calls += 1; return null; }
  async touch(): Promise<void> {}
}

describe('guards on a service route', () => {
  it('JwtAuthGuard steps aside on a @ServiceOnly route with no bearer token', () => {
    const { context, reflector } = httpContext({ headers: {} }, { [REQUIRED_KIND]: 'service' });
    const guard = new JwtAuthGuard(reflector, new JwtVerifier({ JWT_ACCESS_SECRET: 'x'.repeat(16) }));
    expect(guard.canActivate(context)).toBe(true);
  });

  it('ServiceTokenGuard steps aside on a member route and never looks a token up', async () => {
    const clients = new NoClients();
    const { context, reflector } = httpContext({ headers: {} }, { [REQUIRED_KIND]: 'user' });
    expect(await new ServiceTokenGuard(clients, reflector).canActivate(context)).toBe(true);
    expect(clients.calls).toBe(0);
  });

  it('ServiceTokenGuard still refuses a service route with no token', async () => {
    const { context, reflector } = httpContext({ headers: {} }, { [REQUIRED_KIND]: 'service' });
    await expect(new ServiceTokenGuard(new NoClients(), reflector).canActivate(context)).rejects.toThrow(
      /requires a service token/,
    );
  });
});
