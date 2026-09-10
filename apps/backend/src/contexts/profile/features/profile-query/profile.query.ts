import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import type { BodyMetric } from '../../domain/profile.aggregate.js';
import {
  PreferencesRepository,
  ProfileRepository,
} from '../../domain/profile.repository.js';

export interface ProfileView {
  userId: string;
  displayName?: string;
  photoPath?: string;
  timezone: string;
  locale: string;
  latestWeightKg?: number;
  latestHeightCm?: number;
  bmi?: number;
  metrics: BodyMetric[];
  foodLikes?: string[];
  foodDislikes?: string[];
  allergies?: string[];
  symptoms?: string[];
  onboardingCompletedAt?: string;
}

export interface PreferencesView {
  userId: string;
  planTomorrowTime: string;
  endOfDayTime: string;
  morningBriefingTime: string;
  nextPracticeCutoff: string;
  leadTimes: string[];
  quietHours: { from: string; to: string };
  weekStartsOn: string;
  checkinEnabled: boolean;
  meetingDurationMin: number;
  mealMode: string;
  aiSuggestions: boolean;
}

/**
 * When each of a member's three daily touches is due, and whether they want the
 * check-in question — the two halves of the answer joined into one row.
 *
 * The zone is on the profile and the three times and the flag are preferences,
 * which is a split nobody outside this context should have to know about. P3's
 * rhythm tick asks for a list of these and gets one, rather than asking two
 * questions per member and reassembling them itself.
 *
 * Deliberately *not* the full `PreferencesView`. The tick is a loop over every
 * member and this is the projection it needs; handing it twelve fields would
 * invite the eighth of them to grow a use, and then Profile's whole preferences
 * shape is load-bearing for a job in another context.
 */
export interface MemberScheduleView {
  userId: string;
  timezone: string;
  /** `HH:mm` in the member's own zone. */
  planTomorrowTime: string;
  endOfDayTime: string;
  morningBriefingTime: string;
  checkinEnabled: boolean;
}

/**
 * What a profile looks like from outside.
 *
 * Empty fields are omitted rather than sent as `null` or `[]`. A member who has
 * told us nothing about their diet should read as *absent*, not as "no likes and
 * no dislikes" — and the coach prompt that consumes this in P4 renders a present
 * empty array as a claim rather than a gap.
 *
 * `bmi` and the latest weight and height are derived on read. Storing them would
 * put a value in the document that goes stale the moment a new metric arrives,
 * with no event that would refresh it.
 */
@Injectable()
export class ProfileQueryHandler {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly preferences: PreferencesRepository,
    private readonly settings: SettingsService,
  ) {}

  async profile(userId: string): Promise<ProfileView | null> {
    const profile = await this.profiles.find(userId);
    if (!profile) return null;

    return {
      userId: profile.userId,
      ...omitEmpty({
        displayName: profile.displayName,
        photoPath: profile.photoPath,
      }),
      timezone: profile.timezone,
      locale: profile.locale,
      ...omitEmpty({
        latestWeightKg: profile.latestWeightKg,
        latestHeightCm: profile.latestHeightCm,
        bmi: profile.bmi,
      }),
      metrics: profile.metrics,
      ...omitEmptyLists({
        foodLikes: profile.foodLikes,
        foodDislikes: profile.foodDislikes,
        allergies: profile.allergies,
        symptoms: profile.symptoms,
      }),
      ...(profile.onboardingCompletedAt
        ? { onboardingCompletedAt: profile.onboardingCompletedAt.toISOString() }
        : {}),
    };
  }

  async preferencesFor(userId: string): Promise<PreferencesView | null> {
    const preferences = await this.preferences.find(userId);
    if (!preferences) return null;

    return {
      userId: preferences.userId,
      planTomorrowTime: preferences.planTomorrowTime,
      endOfDayTime: preferences.endOfDayTime,
      morningBriefingTime: preferences.morningBriefingTime,
      nextPracticeCutoff: preferences.nextPracticeCutoff,
      leadTimes: preferences.leadTimes,
      quietHours: preferences.quietHours,
      weekStartsOn: preferences.weekStartsOn,
      checkinEnabled: preferences.checkinEnabled,
      meetingDurationMin: preferences.meetingDurationMin,
      mealMode: preferences.mealMode,
      aiSuggestions: preferences.aiSuggestions,
    };
  }

  /**
   * The daily-touch schedule for a batch of members, one entry per id asked
   * for, in the order asked for.
   *
   * **Two collections, two queries — never two queries per member.** The caller
   * is P3's tick: a five-minute pulse that walks every member deciding whose
   * local plan-prompt, end-of-day or morning time has arrived. A loop of
   * `find(userId)` here would be one round trip per member per collection, so a
   * five-hundred-member installation would pay a thousand round trips on a job
   * whose stated goal is a pass in under ten seconds when nobody is due — and
   * the round trip is the cost, not the query. Hence `findMany` on both ports,
   * and hence the `reads` counter on the in-memory adapters, which the spec
   * asserts is 1 and not 500: a loop reintroduced here would be invisible
   * otherwise, because every functional assertion would still pass.
   *
   * **Every id gets an entry, and none of them is null.** A member whose
   * profile or preferences row has not been written yet is a real state, not a
   * defect: `bootstrap-on-registered` reacts to `identity.UserRegistered`
   * through the relay, which is at-least-once and *eventual*, so for a second
   * or two after an account is created there is no row. `ProfileMemberContext`
   * already answers that same window with the installation default, for the
   * same reason and to better effect than any alternative — the default is the
   * very value the bootstrap is about to write, so the answer is not merely
   * safe, it is correct.
   *
   * Returning null (or omitting the id) would push a "no profile yet" branch
   * into the tick, which is the one place it must not be. The tick's loop body
   * is three claim-then-send decisions against a local clock; a fourth branch
   * asking whether this member has a time zone yet would sit in that body
   * forever, would be exercised by nothing (the window is two seconds wide),
   * and the day somebody wrote it wrong the failure would be a member who is
   * silently skipped every pass. An entry built from `settings.defaults.*` is
   * indistinguishable from the row that is about to exist, so there is nothing
   * for the tick to branch on.
   *
   * Order is preserved because it is free here and the alternative — "the order
   * the store happened to return the `$in` in" — is the kind of detail a caller
   * starts depending on by accident.
   */
  async schedulesFor(userIds: string[]): Promise<MemberScheduleView[]> {
    if (userIds.length === 0) return [];

    const [profiles, preferences, timezone, planTomorrowTime, endOfDayTime, morningBriefingTime, checkinEnabled] =
      await Promise.all([
        this.profiles.findMany(userIds),
        this.preferences.findMany(userIds),
        this.settings.get('defaults.timezone'),
        this.settings.get('defaults.planTomorrowTime'),
        this.settings.get('defaults.endOfDayTime'),
        this.settings.get('defaults.morningBriefingTime'),
        this.settings.get('defaults.checkinEnabled'),
      ]);

    const profileFor = new Map(profiles.map((row) => [row.userId, row]));
    const preferencesFor = new Map(preferences.map((row) => [row.userId, row]));

    return userIds.map((userId) => {
      const profile = profileFor.get(userId);
      const chosen = preferencesFor.get(userId);
      return {
        userId,
        // The two halves fall back independently. A member can plausibly have
        // one row and not the other — the bootstrap writes them in sequence —
        // and treating a missing profile as a reason to ignore the preferences
        // that *are* there would send that member's touches at the
        // installation's default hour instead of the one they chose.
        timezone: profile?.timezone ?? timezone,
        planTomorrowTime: chosen?.planTomorrowTime ?? planTomorrowTime,
        endOfDayTime: chosen?.endOfDayTime ?? endOfDayTime,
        morningBriefingTime: chosen?.morningBriefingTime ?? morningBriefingTime,
        checkinEnabled: chosen?.checkinEnabled ?? checkinEnabled,
      };
    });
  }

  /**
   * The compact form later phases put in a prompt.
   *
   * It exists here rather than in each consumer so the coach, the planner and
   * the meal suggester all describe a member the same way. A second copy is how
   * one of them starts telling the model about an allergy the others omit.
   */
  async summary(userId: string): Promise<string | null> {
    const profile = await this.profiles.find(userId);
    if (!profile) return null;

    const parts: string[] = [];
    if (profile.displayName) parts.push(`Name: ${profile.displayName}`);
    parts.push(`Time zone: ${profile.timezone}`);
    if (profile.latestWeightKg !== undefined)
      parts.push(`Weight: ${profile.latestWeightKg} kg`);
    if (profile.latestHeightCm !== undefined)
      parts.push(`Height: ${profile.latestHeightCm} cm`);
    if (profile.bmi !== undefined) parts.push(`BMI: ${profile.bmi}`);
    if (profile.foodLikes.length > 0)
      parts.push(`Likes: ${profile.foodLikes.join(', ')}`);
    if (profile.foodDislikes.length > 0)
      parts.push(`Dislikes: ${profile.foodDislikes.join(', ')}`);
    // Always spelled out when present, and never abbreviated: this is the line
    // that keeps a suggestion from harming someone.
    if (profile.allergies.length > 0)
      parts.push(`Allergies: ${profile.allergies.join(', ')}`);
    if (profile.symptoms.length > 0)
      parts.push(`Symptoms: ${profile.symptoms.join(', ')}`);

    return parts.join('\n');
  }
}

/**
 * Drops `null` and `undefined`, and says so in the type.
 *
 * The return type strips `null` from every value, because that is exactly what
 * this function guarantees at runtime — a signature that kept it would force
 * every caller to widen its own view type and re-admit the nulls this exists to
 * remove.
 */
function omitEmpty<T extends Record<string, unknown>>(
  fields: T,
): { [K in keyof T]?: Exclude<T[K], null | undefined> } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out as { [K in keyof T]?: Exclude<T[K], null | undefined> };
}

function omitEmptyLists(
  fields: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value.length > 0) out[key] = value;
  }
  return out;
}
