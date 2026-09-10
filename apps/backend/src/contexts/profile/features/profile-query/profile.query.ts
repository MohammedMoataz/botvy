import { Injectable } from '@nestjs/common';
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
