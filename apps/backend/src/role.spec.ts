import { describe, expect, it } from 'vitest';
import { ROLES, UnknownRoleError, resolveRole, runsRelay, servesHttpEdge } from './role.js';

describe('role switch', () => {
  it('knows exactly two roles', () => {
    expect([...ROLES]).toEqual(['backend', 'worker']);
  });

  it('defaults to the backend when nothing is set', () => {
    expect(resolveRole(undefined)).toBe('backend');
    expect(resolveRole('')).toBe('backend');
  });

  it('accepts each role it knows', () => {
    expect(resolveRole('backend')).toBe('backend');
    expect(resolveRole('worker')).toBe('worker');
  });

  /**
   * The failure this refusal prevents: a typo in compose starting a second API
   * where a worker was meant to be. The only symptom would be that nothing was
   * relaying events, which looks like nothing at all until a member notices a
   * reminder never arrived.
   */
  it('refuses an unknown role, naming it, rather than defaulting', () => {
    expect(() => resolveRole('wokrer')).toThrow(UnknownRoleError);
    expect(() => resolveRole('wokrer')).toThrow(/wokrer/);
    expect(() => resolveRole('wokrer')).toThrow(/backend, worker/);
  });

  it('is case-sensitive, because compose values are', () => {
    expect(() => resolveRole('Worker')).toThrow(UnknownRoleError);
  });

  it('puts the HTTP edge on the backend and the relay on the worker', () => {
    expect(servesHttpEdge('backend')).toBe(true);
    expect(servesHttpEdge('worker')).toBe(false);
    expect(runsRelay('worker')).toBe(true);
    expect(runsRelay('backend')).toBe(false);
  });

  it('gives the two roles no overlapping responsibility', () => {
    for (const role of ROLES) {
      expect(servesHttpEdge(role)).not.toBe(runsRelay(role));
    }
  });
});
