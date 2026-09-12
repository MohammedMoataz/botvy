import { describe, expect, it } from 'vitest';
import { RequestContextStore } from './request-context.js';
import { redact } from './redact.js';

describe('request context', () => {
  it('carries the request id and the slice into every line', () => {
    RequestContextStore.run({ requestId: 'req-1', context: 'operations', slice: 'ping' }, () => {
      expect(RequestContextStore.bindings()).toEqual({
        requestId: 'req-1',
        botvyContext: 'operations',
        slice: 'ping',
      });
    });
  });

  it('is empty outside a request rather than throwing', () => {
    expect(RequestContextStore.bindings()).toEqual({});
    expect(RequestContextStore.current()).toBeUndefined();
    expect(() => RequestContextStore.tag({ slice: 'ping' })).not.toThrow();
  });

  it('names the principal by kind and id, never by anything else about them', () => {
    RequestContextStore.run(
      {
        requestId: 'req-2',
        principal: { kind: 'user', id: 'user-1', role: 'admin', email: 'owner@example.test' },
      },
      () => {
        const bindings = RequestContextStore.bindings();
        expect(bindings.principal).toBe('user:user-1');
        expect(JSON.stringify(bindings)).not.toContain('owner@example.test');
      },
    );
  });

  it('lets a handler narrow the context it was given', () => {
    RequestContextStore.run({ requestId: 'req-3' }, () => {
      RequestContextStore.tag({ context: 'identity', slice: 'me' });
      expect(RequestContextStore.bindings()).toMatchObject({
        botvyContext: 'identity',
        slice: 'me',
      });
    });
  });

  it('keeps concurrent requests apart', async () => {
    const seen: string[] = [];
    await Promise.all([
      RequestContextStore.run({ requestId: 'a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(RequestContextStore.current()!.requestId);
      }),
      RequestContextStore.run({ requestId: 'b' }, async () => {
        seen.push(RequestContextStore.current()!.requestId);
      }),
    ]);

    expect(seen.sort()).toEqual(['a', 'b']);
  });
});

/**
 * The release phase scans a day of logs for leaked material. That scan is much
 * easier to pass if nothing was ever written in the first place.
 */
describe('redaction', () => {
  it('removes the fields a credential travels in', () => {
    const redacted = redact({
      email: 'owner@example.test',
      password: 'hunter2',
      passwordHash: 'argon2id$...',
      accessToken: 'ey.J.x',
      refreshToken: 'r-1',
      authorization: 'Bearer ey.J.x',
      tokenHash: 'abc',
      keep: 'this',
    }) as Record<string, unknown>;

    expect(redacted.keep).toBe('this');
    for (const field of [
      'password',
      'passwordHash',
      'accessToken',
      'refreshToken',
      'authorization',
      'tokenHash',
    ]) {
      expect(redacted[field]).toBe('[redacted]');
    }
  });

  it('reaches nested objects and arrays', () => {
    const redacted = redact({
      user: { name: 'a', password: 'p' },
      devices: [{ pushToken: 't' }],
    }) as { user: Record<string, unknown>; devices: Array<Record<string, unknown>> };

    expect(redacted.user.password).toBe('[redacted]');
    expect(redacted.devices[0]!.pushToken).toBe('[redacted]');
  });

  it('leaves primitives and nulls alone', () => {
    expect(redact('plain')).toBe('plain');
    expect(redact(null)).toBeNull();
    expect(redact(7)).toBe(7);
  });

  it('does not loop for ever on a cycle', () => {
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic.self = cyclic;

    expect(() => redact(cyclic)).not.toThrow();
  });
});
