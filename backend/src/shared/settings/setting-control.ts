import type { z } from 'zod';

/**
 * What kind of control a setting's own rule asks for (P10, FR-006).
 *
 * The portal has to render forty-one keys and must not carry a hand-written map
 * of which is a switch and which is a dropdown — that map would be a second copy
 * of the registry, kept in another repository, and it would go wrong the first
 * time somebody added a key without remembering it exists. So the shape is
 * **derived from the zod schema the registry already declares**, which is the
 * one description of a setting that is guaranteed to be current: it is the thing
 * the server validates against.
 *
 * Deliberately small. Six kinds, not a JSON Schema: the portal needs to pick an
 * input, not to re-implement validation. **The server remains the validator** —
 * a value that gets past the control is refused by `SettingsService.set` with
 * the rule named, which is what FR-006 asks for and what makes it safe for this
 * to be an approximation.
 */
export type SettingControl =
  | { kind: 'switch' }
  | { kind: 'number'; min?: number; max?: number; integer: boolean }
  | { kind: 'choice'; options: string[] }
  /** `HH:mm` — a time of day, which is a string with a very specific rule. */
  | { kind: 'time' }
  | { kind: 'text' }
  /** A list of strings, edited as chips. */
  | { kind: 'chips' }
  /** Anything shaped: quiet hours, the allergen families. Guarded JSON. */
  | { kind: 'json' };

/**
 * Whether a string rule is a clock.
 *
 * Asked **behaviourally** — does it accept `09:30` and refuse a sentence? —
 * rather than by pattern-matching the regex's own source. A source match is a
 * guess about how somebody wrote their expression, and the first version of
 * this file got it wrong: it looked for a literal `\d{2}` and the registry
 * writes its rule as `^([01]\d|2[0-3]):[0-5]\d$`, so every time key rendered as
 * a text box. Running the rule is the one test that cannot disagree with it.
 */
function looksLikeAClock(pattern: RegExp): boolean {
  // A fresh instance: a `g` or `y` flag makes `test` stateful, and a shared
  // regex would then answer differently on every other call.
  const clock = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  return (
    clock.test('09:30') && clock.test('23:59') && !clock.test('not a time at all')
  );
}

/**
 * Read the control out of the schema.
 *
 * Introspecting zod rather than annotating each key, and the trade is stated
 * because it is a real one: `_def` is not zod's public API and a major version
 * could move it. What that costs is one function to update, in one place, with
 * a spec that fails loudly — against a hand-written map of forty-one keys that
 * would fail *silently*, by rendering a text box for a boolean, the first time
 * somebody added a key and forgot it. The failure mode decides it.
 */
export function controlFor(schema: z.ZodTypeAny): SettingControl {
  const def = (schema as { _def?: Record<string, unknown> })._def ?? {};
  const typeName = String(def.typeName ?? '');

  switch (typeName) {
    case 'ZodBoolean':
      return { kind: 'switch' };

    case 'ZodEnum':
      return {
        kind: 'choice',
        options: (def.values as string[] | undefined)?.map(String) ?? [],
      };

    case 'ZodNumber': {
      const checks = (def.checks ?? []) as Array<{ kind: string; value?: number }>;
      const min = checks.find((check) => check.kind === 'min')?.value;
      const max = checks.find((check) => check.kind === 'max')?.value;
      return {
        kind: 'number',
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
        integer: checks.some((check) => check.kind === 'int'),
      };
    }

    case 'ZodString': {
      const checks = (def.checks ?? []) as Array<{ kind: string; regex?: RegExp }>;
      const pattern = checks.find((check) => check.kind === 'regex')?.regex;
      // A time is a string with a clock-shaped rule, and it is worth telling
      // apart: a member typing "25:00" into a text box finds out when the server
      // refuses it, where a time control cannot produce one.
      return pattern && looksLikeAClock(pattern)
        ? { kind: 'time' }
        : { kind: 'text' };
    }

    case 'ZodArray': {
      const element = (def.type as { _def?: { typeName?: unknown } } | undefined)
        ?._def?.typeName;
      // A list of strings is chips; a list of anything else is shaped enough
      // that JSON is the honest control.
      return String(element ?? '') === 'ZodString'
        ? { kind: 'chips' }
        : { kind: 'json' };
    }

    default:
      // Objects, records, unions — the quiet-hours pair and the allergen
      // families. A form built for each would be a form per key; the JSON box
      // is guarded by the server's own rule, which is the thing that matters.
      return { kind: 'json' };
  }
}
