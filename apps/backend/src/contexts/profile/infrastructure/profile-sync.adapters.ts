import { Injectable } from '@nestjs/common';
import type {
  ApplyOutcome,
  SyncablePatch,
} from '../../sync/domain/syncable-entity.port.js';
import { ProfileQueryHandler } from '../features/profile-query/profile.query.js';
import {
  PREFERENCE_FIELDS,
  UpdatePreferencesHandler,
} from '../features/update-preferences/update-preferences.handler.js';
import { UpdateProfileHandler } from '../features/update-profile/update-profile.handler.js';

/**
 * Profile's two adapters for the sync facade — and the reason they are written
 * *here* rather than in the Sync context.
 *
 * An adapter belongs to the context whose store it reads. The blueprint places
 * these in P2 and P1 shipped the aggregates without them, so this phase is
 * where they first exist; they sit in Profile because they call Profile's own
 * handlers, and putting them in Sync would have the facade holding a key to
 * this store.
 *
 * ## Neither of them checks for a conflict, and that is the design
 *
 * `contracts/sync.md` exempts profile and preferences outright. The reason is
 * that **the fields a client may patch and the fields the server's own jobs
 * write are disjoint sets**: a member edits their display name, time zone and
 * food lists; the rhythm tick, the alert saga and the streak counter write
 * everything else. There is no version being competed for, so there is nothing
 * to lose — and a `baseUpdatedAt` comparison would refuse a perfectly good
 * patch simply because a background job had touched the row since the phone
 * last pulled it.
 *
 * Which makes the *reporting* rule as important as the acceptance rule: a
 * stale patch is accepted, and must **never** be reported as `stale`. A stale
 * verdict tells the phone to overwrite its copy and retry, and against a rule
 * that was never going to refuse it the phone would retry for ever.
 */
@Injectable()
export class ProfilePatchAdapter implements SyncablePatch {
  readonly entity = 'profile';
  /** Before preferences, so a time-zone change is in place when they land. */
  readonly applyOrder = 1;

  constructor(
    private readonly profiles: UpdateProfileHandler,
    private readonly queries: ProfileQueryHandler,
  ) {}

  async pull(userId: string): Promise<unknown | null> {
    return this.queries.profile(userId);
  }

  async applyPatch(
    userId: string,
    patch: Record<string, unknown>,
    _now: Date,
  ): Promise<ApplyOutcome> {
    // The allowlist is the handler's own command shape. Anything else the
    // client sends is dropped rather than refused: a newer app version may
    // know about a field this server does not, and refusing the whole patch
    // would block the fields it *does* know.
    await this.profiles.handle(userId, {
      displayName: patch.displayName as string | null | undefined,
      timezone: patch.timezone as string | undefined,
      locale: patch.locale as string | undefined,
      onboardingCompletedAt: asDate(patch.onboardingCompletedAt),
      foodLikes: patch.foodLikes as string[] | undefined,
      foodDislikes: patch.foodDislikes as string[] | undefined,
      allergies: patch.allergies as string[] | undefined,
      symptoms: patch.symptoms as string[] | undefined,
    });

    return { applied: true, id: userId };
  }
}

@Injectable()
export class PreferencesPatchAdapter implements SyncablePatch {
  readonly entity = 'preferences';
  readonly applyOrder = 2;

  constructor(
    private readonly preferences: UpdatePreferencesHandler,
    private readonly queries: ProfileQueryHandler,
  ) {}

  async pull(userId: string): Promise<unknown | null> {
    return this.queries.preferencesFor(userId);
  }

  async applyPatch(
    userId: string,
    patch: Record<string, unknown>,
    _now: Date,
  ): Promise<ApplyOutcome> {
    /*
     * The handler throws `UnknownPreference` on a key it does not recognise,
     * which is right for the REST route: a person editing preferences in the
     * app should be told they sent nonsense.
     *
     * It is wrong here. A newer build of the phone may know a preference this
     * server does not, and refusing the whole patch would block every field it
     * *does* know — including a time zone, which the alert saga needs to hear
     * about. So the patch is filtered to the fields this build understands and
     * the rest are dropped silently, which is the same forward-compatibility
     * choice the profile adapter makes above.
     */
    const known = new Set<string>(PREFERENCE_FIELDS);
    const filtered: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(patch)) {
      if (known.has(field)) filtered[field] = value;
    }

    if (Object.keys(filtered).length === 0)
      return { applied: true, id: userId };

    await this.preferences.handle(userId, filtered);
    return { applied: true, id: userId };
  }
}

function asDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
