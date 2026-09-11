import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimiter } from './rate-limiter.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { Principal } from '../auth/principal.js';

const MINUTE = 60_000;

/**
 * A context of whichever transport, carrying whichever principal.
 *
 * Built by hand rather than through Nest's testing module because what is being
 * pinned is the *classification* — which limit applies to whom — and that is a
 * pure function of the context. A test that stood a module up would exercise
 * the container instead.
 */
function contextOf(options: {
  type?: 'http' | 'graphql';
  principal?: Principal;
  headers?: Record<string, unknown>;
  ip?: string;
}): ExecutionContext {
  const type = options.type ?? 'http';
  const request = {
    principal: options.principal,
    headers: options.headers ?? {},
    ip: options.ip ?? '10.0.0.1',
  };
  return {
    getType: () => type,
    getArgByIndex: (index: number) => (index === 2 ? { req: request } : undefined),
    switchToHttp: () => ({ getRequest: () => request }),
    switchToWs: () => ({ getClient: () => ({ data: {} }) }),
  } as unknown as ExecutionContext;
}

const member: Principal = { kind: 'user', id: 'user-1', role: 'user' };
const machine: Principal = { kind: 'service', id: 'n8n', name: 'n8n', scopes: [] };

function guardWith(limits: Record<string, number>) {
  const limiter = new RateLimiter();
  const settings = {
    get: async (key: string) => limits[key] ?? 0,
  } as unknown as SettingsService;
  return { guard: new RateLimitGuard(limiter, settings), limiter };
}

describe('the counter', () => {
  it('allows up to the limit and refuses the next', () => {
    const limiter = new RateLimiter();
    const now = 1_000_000;

    expect(limiter.take('rest', 'a', 3, MINUTE, now).allowed).toBe(true);
    expect(limiter.take('rest', 'a', 3, MINUTE, now).allowed).toBe(true);
    expect(limiter.take('rest', 'a', 3, MINUTE, now).allowed).toBe(true);

    const refused = limiter.take('rest', 'a', 3, MINUTE, now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it('counts each key and each bucket separately', () => {
    // Otherwise one busy member would close the window on everybody, which is a
    // denial of service the limiter itself would be providing.
    const limiter = new RateLimiter();
    const now = 1_000_000;

    limiter.take('rest', 'a', 1, MINUTE, now);
    expect(limiter.take('rest', 'a', 1, MINUTE, now).allowed).toBe(false);
    expect(limiter.take('rest', 'b', 1, MINUTE, now).allowed).toBe(true);
    expect(limiter.take('graphql', 'a', 1, MINUTE, now).allowed).toBe(true);
  });

  it('opens again when the window rolls', () => {
    const limiter = new RateLimiter();
    const now = 1_000_000;

    limiter.take('rest', 'a', 1, MINUTE, now);
    expect(limiter.take('rest', 'a', 1, MINUTE, now + MINUTE - 1).allowed).toBe(false);
    expect(limiter.take('rest', 'a', 1, MINUTE, now + MINUTE).allowed).toBe(true);
  });

  it('a refusal does not extend the window', () => {
    // A client hammering through a closed window must not be able to hold it
    // closed — for itself or, since the key is the caller, for anybody.
    const limiter = new RateLimiter();
    const now = 1_000_000;

    limiter.take('rest', 'a', 1, MINUTE, now);
    for (let i = 0; i < 50; i += 1) limiter.take('rest', 'a', 1, MINUTE, now + 1_000);

    expect(limiter.take('rest', 'a', 1, MINUTE, now + MINUTE).allowed).toBe(true);
  });

  it('treats zero as unlimited, which is how an operator turns it off', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 100; i += 1) {
      expect(limiter.take('rest', 'a', 0, MINUTE, 1_000_000).allowed).toBe(true);
    }
  });

  it('drops closed windows rather than growing a key per address for ever', () => {
    // The key for an anonymous caller is their address, so without this a scan
    // from a botnet is a memory leak shaped exactly like the attack.
    const limiter = new RateLimiter();
    const now = 1_000_000;

    for (let i = 0; i < 500; i += 1) limiter.take('anonymous', `addr-${i}`, 5, MINUTE, now);
    expect(limiter.size).toBe(500);

    // One call after the sweep interval, past every window's close.
    limiter.take('anonymous', 'addr-0', 5, MINUTE, now + MINUTE + 60_001);
    expect(limiter.size).toBe(1);
  });
});

describe('which limit applies', () => {
  it('counts a caller with no principal by address, on the anonymous limit', () => {
    // Sign-in, registration and the refresh exchange. The credential-stuffing
    // limit, and the only one where there is nothing but the address to count.
    const { guard } = guardWith({});

    expect(
      guard.bucketFor(contextOf({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })),
    ).toEqual({
      name: 'anonymous',
      key: '203.0.113.9',
      setting: 'limits.anonymousPerMinute',
    });
  });

  it('reads the client address through the edge, not the edge itself', () => {
    // Every request arrives from Caddy, so counting by the socket address would
    // put the whole world in one bucket and lock sign-in for everybody the
    // moment one person got their password wrong.
    const { guard } = guardWith({});

    const direct = guard.bucketFor(contextOf({ ip: '10.0.0.7' }));
    const proxied = guard.bucketFor(
      contextOf({ ip: '10.0.0.7', headers: { 'x-forwarded-for': '198.51.100.4' } }),
    );

    expect(direct?.key).toBe('10.0.0.7');
    expect(proxied?.key).toBe('198.51.100.4');
  });

  it('puts a machine principal on the internal limit, by its client id', () => {
    const { guard } = guardWith({});

    expect(guard.bucketFor(contextOf({ principal: machine }))).toEqual({
      name: 'internal',
      key: 'n8n',
      setting: 'limits.internalPerMinute',
    });
  });

  it('separates a signed-in read from a signed-in command', () => {
    // One screen is several reads and one act, so a single number for both is
    // either too tight for the reads or too loose for the writes.
    const { guard } = guardWith({});

    expect(guard.bucketFor(contextOf({ principal: member }))?.setting).toBe(
      'limits.restPerMinute',
    );
    expect(
      guard.bucketFor(contextOf({ type: 'graphql', principal: member }))?.setting,
    ).toBe('limits.graphqlPerMinute');
  });
});

describe('the guard', () => {
  it('refuses with 429 and a retry-after once the limit is reached', async () => {
    const { guard } = guardWith({ 'limits.restPerMinute': 2 });
    const context = contextOf({ principal: member });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 429,
      response: { code: 'too_many_requests', retryAfterSeconds: expect.any(Number) },
    });
  });

  it('lets a signed-in member past the anonymous limit', async () => {
    // The tight limit is for callers who have not proved who they are. Holding
    // a member to it would make the product unusable a minute after sign-in.
    const { guard } = guardWith({
      'limits.anonymousPerMinute': 1,
      'limits.restPerMinute': 100,
    });

    for (let i = 0; i < 10; i += 1) {
      await expect(
        guard.canActivate(contextOf({ principal: member })),
      ).resolves.toBe(true);
    }
  });

  /**
   * Fails open, and that is the deliberate choice.
   *
   * A limiter that refused every request when the settings store hiccuped would
   * turn a slow database into a total outage. This is a ceiling on abuse, not
   * an authorisation decision — the guards that decide who may do what fail
   * closed, and they run before this one.
   */
  it('lets the call through when the registry cannot be read', async () => {
    const limiter = new RateLimiter();
    const settings = {
      get: async () => {
        throw new Error('settings down');
      },
    } as unknown as SettingsService;
    const guard = new RateLimitGuard(limiter, settings);

    await expect(guard.canActivate(contextOf({ principal: member }))).resolves.toBe(true);
  });

  it('never counts a socket message, which the gateway counts itself', async () => {
    // A Socket.IO event has no response to carry a status, so a refusal there
    // has to be a frame the client can read rather than an exception.
    const { guard } = guardWith({ 'limits.socketPerMinute': 0 });
    const ws = {
      getType: () => 'ws',
      switchToWs: () => ({ getClient: () => ({ data: { principal: member } }) }),
    } as unknown as ExecutionContext;

    const bucket = vi.spyOn(guard, 'bucketFor');
    await expect(guard.canActivate(ws)).resolves.toBe(true);
    expect(bucket).not.toHaveBeenCalled();
  });
});
