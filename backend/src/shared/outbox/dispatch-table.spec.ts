import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DISPATCHED_EVENTS,
  assertDispatchable,
  type Subscriptions,
} from './dispatch-table.js';

/**
 * The failure this whole mechanism exists for has to be reachable from a test
 * and not only from a boot, which is the same argument `app.module.spec.ts`
 * makes about an `UnknownDependenciesException`: a mistake that only a deploy
 * can show you is a mistake somebody finds at three in the morning.
 */
describe('assertDispatchable', () => {
  const profile: Subscriptions = {
    'identity.UserRegistered': 'BootstrapOnRegisteredHandler',
    'identity.UserDeleted': 'PurgeOnDeletedHandler',
  };

  it('passes a declaration the table can deliver', () => {
    expect(() => assertDispatchable({ profile })).not.toThrow();
  });

  it('throws naming the event and the handler when the table has no case', () => {
    const meetings: Subscriptions = {
      'identity.UserDeleted': 'MeetingsPurgeOnDeletedHandler',
      // Provided in the module, spec'd directly, and never reached: exactly the
      // state `bootstrap-on-registered` and `purge-on-deleted` were once in.
      'profile.HolidayDeclared': 'MeetingsHolidayHandler',
    };

    expect(() => assertDispatchable({ profile, meetings })).toThrowError(
      /profile\.HolidayDeclared → meetings's MeetingsHolidayHandler/,
    );
  });

  it('reports every gap at once rather than one per restart', () => {
    const message = (() => {
      try {
        assertDispatchable({
          a: { 'a.Missing': 'AHandler' },
          b: { 'b.Missing': 'BHandler' },
        });
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();

    expect(message).toContain('a.Missing');
    expect(message).toContain('b.Missing');
  });
});

/**
 * And the half that keeps the list honest.
 *
 * `DISPATCHED_EVENTS` describes a switch in another file, so it can be wrong in
 * two directions, and the dangerous one is the quiet one: a name listed here
 * with no case would satisfy the boot assertion and still never be delivered —
 * E-005's own failure, one file over. Reading the source is the only thing that
 * can tell, and it is exact: `tsc` does not rewrite a string literal, and
 * nothing in this build minifies.
 */
describe('DISPATCHED_EVENTS and the switch it describes', () => {
  it('lists exactly the case labels in relay.module.ts', () => {
    const source = readFileSync(
      new URL('./relay.module.ts', import.meta.url),
      'utf8',
    );
    const cases = [...source.matchAll(/^\s*case '([^']+)':/gm)].map(
      (match) => match[1] as string,
    );

    // A guard on the parse itself: a rename of the file or a switch rewritten
    // some other way would otherwise leave both sides of the comparison empty.
    expect(cases.length).toBeGreaterThan(40);
    expect(new Set(cases).size).toBe(cases.length);
    expect([...cases].sort()).toEqual([...DISPATCHED_EVENTS].sort());
  });
});
