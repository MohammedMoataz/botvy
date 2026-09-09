import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  ServiceClientRepository,
  type ServiceClient,
  type ServiceClientUpsert,
} from '../../contexts/identity/domain/service-client.repository.js';
import { REQUIRED_KIND, REQUIRED_ROLES, IS_PUBLIC } from './decorators.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtVerifier, TokenExpiredError, TokenInvalidError } from './jwt.verifier.js';
import { KindGuard } from './kind.guard.js';
import { RolesGuard } from './roles.guard.js';
import { ServiceTokenGuard, hashToken, hashesMatch } from './service-token.guard.js';
import { WsAuthGuard, WsUnauthorized } from './ws-auth.guard.js';

const SECRET = 'a-test-secret-long-enough-to-pass';
const verifier = new JwtVerifier({ JWT_ACCESS_SECRET: SECRET });

function signAccess(claims: Record<string, unknown>, expiresIn = '15m'): string {
  return jwt.sign(claims, SECRET, { expiresIn } as jwt.SignOptions);
}

/** A minimal HTTP ExecutionContext, with whatever metadata the guard reads. */
function httpContext(
  request: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
): { context: ExecutionContext; reflector: Reflector; request: Record<string, unknown> } {
  const context = {
    getType: () => 'http',
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;

  return { context, reflector, request };
}

class StubServiceClients extends ServiceClientRepository {
  constructor(private readonly client: ServiceClient | null, private readonly storedHash: string) {
    super();
  }
  async findByName(): Promise<ServiceClient | null> {
    return this.client;
  }
  async upsert(_client: ServiceClientUpsert): Promise<ServiceClient> {
    throw new Error('not used');
  }
  async verifyToken(presentedHash: string): Promise<ServiceClient | null> {
    return this.client && hashesMatch(presentedHash, this.storedHash) ? this.client : null;
  }
  async touch(): Promise<void> {}
  // Present because the port declares them; not exercised here.
  async listAll(): Promise<ServiceClient[]> {
    return this.client ? [this.client] : [];
  }
  async revoke(): Promise<boolean> {
    return false;
  }
}

const n8nClient: ServiceClient = {
  id: 'svc-1',
  name: 'n8n',
  scopes: ['internal:alerts', 'internal:tick'],
  createdAt: new Date(),
  lastUsedAt: null,
  revokedAt: null,
};

describe('JwtVerifier', () => {
  it('turns a signed token into a member principal', () => {
    const principal = verifier.verify(signAccess({ sub: 'user-1', role: 'user' }));

    expect(principal).toEqual({ kind: 'user', id: 'user-1', role: 'user' });
  });

  it('distinguishes an expired token from an invalid one', () => {
    const expired = signAccess({ sub: 'user-1', role: 'user' }, '-1s');

    expect(() => verifier.verify(expired)).toThrow(TokenExpiredError);
    expect(() => verifier.verify('not-a-token')).toThrow(TokenInvalidError);
  });

  it('refuses a token signed with another secret', () => {
    const foreign = jwt.sign({ sub: 'user-1', role: 'user' }, 'a-different-secret-entirely');

    expect(() => verifier.verify(foreign)).toThrow(TokenInvalidError);
  });

  it('never promotes an unknown role to admin', () => {
    const principal = verifier.verify(signAccess({ sub: 'user-1', role: 'superuser' }));

    expect(principal).toMatchObject({ role: 'user' });
  });
});

describe('JwtAuthGuard', () => {
  it('authenticates a member and hangs the principal on the request', () => {
    const { context, reflector, request } = httpContext({
      headers: { authorization: `Bearer ${signAccess({ sub: 'user-1', role: 'admin' })}` },
    });

    expect(new JwtAuthGuard(reflector, verifier).canActivate(context)).toBe(true);
    expect(request.principal).toEqual({ kind: 'user', id: 'user-1', role: 'admin' });
  });

  /** The client refreshes on this; "invalid" would send it to sign-in instead. */
  it('answers 401 token_expired for an expired token', () => {
    const { context, reflector } = httpContext({
      headers: { authorization: `Bearer ${signAccess({ sub: 'user-1', role: 'user' }, '-1s')}` },
    });
    const guard = new JwtAuthGuard(reflector, verifier);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow(/token_expired/);
  });

  it('answers 401 when no token is presented at all', () => {
    const { context, reflector } = httpContext({ headers: {} });

    expect(() => new JwtAuthGuard(reflector, verifier).canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });

  it('lets a route marked public through untouched', () => {
    const { context, reflector, request } = httpContext({ headers: {} }, { [IS_PUBLIC]: true });

    expect(new JwtAuthGuard(reflector, verifier).canActivate(context)).toBe(true);
    expect(request.principal).toBeUndefined();
  });
});

describe('KindGuard', () => {
  /** A machine caller must never be able to act as a member. */
  it('refuses a service principal on a member route', () => {
    const { context, reflector } = httpContext(
      { principal: { kind: 'service', id: 'svc-1', name: 'n8n', scopes: [] } },
      { [REQUIRED_KIND]: 'user' },
    );

    expect(() => new KindGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });

  /** And a member must never reach an endpoint that assumes a trusted caller. */
  it('refuses a member principal on an internal route', () => {
    const { context, reflector } = httpContext(
      { principal: { kind: 'user', id: 'user-1', role: 'admin' } },
      { [REQUIRED_KIND]: 'service' },
    );

    expect(() => new KindGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows the kind the route asks for', () => {
    const { context, reflector } = httpContext(
      { principal: { kind: 'user', id: 'user-1', role: 'user' } },
      { [REQUIRED_KIND]: 'user' },
    );

    expect(new KindGuard(reflector).canActivate(context)).toBe(true);
  });
});

describe('RolesGuard', () => {
  it('admits an administrator and refuses a member', () => {
    const admin = httpContext(
      { principal: { kind: 'user', id: 'u1', role: 'admin' } },
      { [REQUIRED_ROLES]: ['admin'] },
    );
    const member = httpContext(
      { principal: { kind: 'user', id: 'u2', role: 'user' } },
      { [REQUIRED_ROLES]: ['admin'] },
    );

    expect(new RolesGuard(admin.reflector).canActivate(admin.context)).toBe(true);
    expect(() => new RolesGuard(member.reflector).canActivate(member.context)).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a machine caller, which holds no role however trusted it is', () => {
    const { context, reflector } = httpContext(
      { principal: { kind: 'service', id: 'svc-1', name: 'n8n', scopes: ['internal:alerts'] } },
      { [REQUIRED_ROLES]: ['admin'] },
    );

    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(ForbiddenException);
  });
});

describe('ServiceTokenGuard', () => {
  const token = 'an-internal-service-token-value';
  const guard = () => new ServiceTokenGuard(new StubServiceClients(n8nClient, hashToken(token)));

  it('authenticates a known service token and attaches its scopes', async () => {
    const { context, request } = httpContext({ headers: { 'x-service-token': token } });

    await expect(guard().canActivate(context)).resolves.toBe(true);
    expect(request.principal).toMatchObject({ kind: 'service', name: 'n8n' });
  });

  it('accepts the same token as a bearer', async () => {
    const { context } = httpContext({ headers: { authorization: `Bearer ${token}` } });

    await expect(guard().canActivate(context)).resolves.toBe(true);
  });

  /**
   * The rule that matters most here: an internal endpoint assumes its caller is
   * infrastructure, so a member reaching one would be acting with that trust.
   */
  it('refuses a member JWT outright, however valid it is', async () => {
    const memberToken = signAccess({ sub: 'user-1', role: 'admin' });
    const { context } = httpContext({ headers: { authorization: `Bearer ${memberToken}` } });

    await expect(guard().canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an unknown token', async () => {
    const { context } = httpContext({ headers: { 'x-service-token': 'not-the-token' } });

    await expect(guard().canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a revoked client', async () => {
    const revoked = new ServiceTokenGuard(
      new StubServiceClients({ ...n8nClient, revokedAt: new Date() }, hashToken(token)),
    );
    const { context } = httpContext({ headers: { 'x-service-token': token } });

    await expect(revoked.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a request with no token at all', async () => {
    const { context } = httpContext({ headers: {} });

    await expect(guard().canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('compares hashes in constant time, and only equal-length ones', () => {
    const digest = hashToken(token);

    expect(hashesMatch(digest, digest)).toBe(true);
    expect(hashesMatch(digest, hashToken('other'))).toBe(false);
    expect(hashesMatch(digest, 'ab')).toBe(false);
    expect(hashesMatch('', '')).toBe(false);
  });
});

describe('WsAuthGuard', () => {
  const guard = new WsAuthGuard(verifier);

  it('authenticates a member from the handshake auth payload', () => {
    const principal = guard.authenticate({
      auth: { token: signAccess({ sub: 'user-1', role: 'user' }) },
    });

    expect(principal).toMatchObject({ kind: 'user', id: 'user-1' });
  });

  it('reports token_expired separately, so the client refreshes and reconnects', () => {
    expect(() =>
      guard.authenticate({ auth: { token: signAccess({ sub: 'u1', role: 'user' }, '-1s') } }),
    ).toThrow(new WsUnauthorized('token_expired'));
  });

  it('refuses a connection with no token', () => {
    expect(() => guard.authenticate({})).toThrow(WsUnauthorized);
  });

  it('refuses a garbage token as unauthorized rather than expired', () => {
    expect(() => guard.authenticate({ auth: { token: 'nonsense' } })).toThrow(
      new WsUnauthorized('unauthorized'),
    );
  });
});
