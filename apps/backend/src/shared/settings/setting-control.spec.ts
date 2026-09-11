import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { controlFor } from './setting-control.js';
import { describeRegistry } from './settings.registry.js';

/**
 * The control a setting asks for, derived from its own rule (P10, FR-006).
 *
 * This function reads `_def`, which is not zod's public API — so the risk it
 * carries is a zod major moving the field, and these cases are what turns that
 * into a red suite rather than a settings page full of text boxes. The
 * alternative it replaced, a hand-written map of forty-one keys, fails the other
 * way: silently, the first time somebody adds a key and forgets the map.
 */
describe('picking a control from a schema', () => {
  it('reads a boolean as a switch', () => {
    expect(controlFor(z.boolean())).toEqual({ kind: 'switch' });
  });

  it('reads an enum as a choice, with its options', () => {
    expect(controlFor(z.enum(['llm', 'library']))).toEqual({
      kind: 'choice',
      options: ['llm', 'library'],
    });
  });

  it('carries a number’s bounds, so the control cannot offer what the server refuses', () => {
    expect(controlFor(z.number().int().min(1).max(20))).toEqual({
      kind: 'number',
      min: 1,
      max: 20,
      integer: true,
    });
  });

  it('leaves out a bound the schema does not set', () => {
    const control = controlFor(z.number());
    expect(control).toEqual({ kind: 'number', integer: false });
  });

  it('tells a clock-shaped string from an ordinary one', () => {
    // A time control cannot produce "25:00"; a text box can, and the member
    // finds out when the server refuses it.
    expect(controlFor(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))).toEqual({
      kind: 'time',
    });
    expect(controlFor(z.string())).toEqual({ kind: 'text' });
  });

  it('reads a list of strings as chips and anything else as JSON', () => {
    expect(controlFor(z.array(z.string()))).toEqual({ kind: 'chips' });
    expect(controlFor(z.array(z.object({ a: z.string() })))).toEqual({
      kind: 'json',
    });
  });

  it('falls back to JSON for a shape no control fits', () => {
    expect(controlFor(z.object({ from: z.string(), to: z.string() }))).toEqual({
      kind: 'json',
    });
    expect(controlFor(z.record(z.string(), z.array(z.string())))).toEqual({
      kind: 'json',
    });
  });
});

describe('the registry as the portal receives it', () => {
  it('gives every key a control', () => {
    const entries = describeRegistry();

    // Not "most keys": a key with no control is a key the settings page cannot
    // render, and the page is the only way an operator changes one without a
    // deploy.
    expect(entries.length).toBeGreaterThan(30);
    for (const entry of entries) {
      expect(entry.control, entry.key).toBeTruthy();
      expect(typeof (entry.control as { kind?: unknown }).kind, entry.key).toBe(
        'string',
      );
    }
  });

  it('does not put every key in the JSON box', () => {
    /*
     * The failure this catches is the one that matters: a zod major moves
     * `_def`, every `typeName` reads as unknown, and `controlFor` answers
     * `json` for all forty-one keys. Every assertion above would still pass —
     * they check specific schemas — and the page would quietly become a wall of
     * textareas.
     */
    const kinds = describeRegistry().map(
      (entry) => (entry.control as { kind: string }).kind,
    );
    const unique = new Set(kinds);

    expect(unique.size).toBeGreaterThan(3);
    expect(unique.has('switch')).toBe(true);
    expect(unique.has('time')).toBe(true);
    expect(unique.has('number')).toBe(true);
  });

  it('marks the keys the system writes as read-only', () => {
    const entries = describeRegistry();
    const systemWritten = entries.filter((entry) => entry.readOnly);

    // FR-007: a key the system writes is shown and not edited. The flag is the
    // registry entry's own, never a prefix — refusing `ops.*` wholesale is what
    // once froze `ops.staleAfterMinutes`, the number an operator most wants.
    expect(systemWritten.length).toBeGreaterThan(0);
  });
});
