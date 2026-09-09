import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  definitionOf,
  isSettingKey,
} from '../../../../shared/settings/settings.registry.js';
import {
  PREFERENCE_DEFAULT_KEYS,
  PREFERENCE_FIELDS,
  type PreferenceField,
} from '../../domain/preferences.aggregate.js';
import { PreferencesRepository } from '../../domain/profile.repository.js';

export class PreferencesNotFound extends Error {
  constructor() {
    super('this account has no preferences yet');
  }
}

export class InvalidPreference extends Error {
  constructor(
    readonly field: string,
    detail: string,
  ) {
    super(`${field}: ${detail}`);
  }
}

export class UnknownPreference extends Error {
  constructor(readonly field: string) {
    super(`${field} is not a preference`);
  }
}

/**
 * Patches any subset of a member's preferences.
 *
 * Each value is validated against the zod schema of its own
 * `settings.defaults.*` registry entry, not against a rule written here. That
 * is the point: the constraint an operator's default has to satisfy and the
 * constraint a member's choice has to satisfy are the same constraint, and two
 * copies of it are how `endOfDayTime: '25:00'` ends up refused in one place and
 * accepted in the other. It also means a schema tightened in the registry
 * tightens here with no second edit.
 *
 * Unknown fields are refused rather than ignored. A client sending
 * `morningBriefTime` for `morningBriefingTime` would otherwise get a 200 and no
 * change, and would have no way to tell that from success.
 */
@Injectable()
export class UpdatePreferencesHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly preferences: PreferencesRepository,
  ) {}

  async handle(
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<{ changed: string[] }> {
    const known = new Set<string>(PREFERENCE_FIELDS);
    for (const field of Object.keys(patch)) {
      if (!known.has(field)) throw new UnknownPreference(field);
    }

    const validated: Partial<Record<PreferenceField, unknown>> = {};
    for (const field of PREFERENCE_FIELDS) {
      if (!(field in patch)) continue;

      const key = PREFERENCE_DEFAULT_KEYS[field];
      // The registry is the source of the rule. If this ever throws, a
      // preference has been added without its default — which is the bug, and
      // failing loudly here is better than validating nothing.
      if (!isSettingKey(key)) throw new UnknownPreference(field);

      const parsed = definitionOf(key).schema.safeParse(patch[field]);
      if (!parsed.success) {
        throw new InvalidPreference(
          field,
          parsed.error.issues.map((issue) => issue.message).join('; '),
        );
      }
      validated[field] = parsed.data;
    }

    const current = await this.preferences.find(userId);
    if (!current) throw new PreferencesNotFound();

    const changed = current.patch(validated);
    if (changed.length > 0) await this.uow.run(() => this.preferences.save(current));

    return { changed };
  }
}
