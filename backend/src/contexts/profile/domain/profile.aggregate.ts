import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

export interface BodyMetric {
  recordedAt: Date;
  weightKg?: number;
  heightCm?: number;
  bodyFatPct?: number;
  note?: string;
}

export interface ProfileState {
  userId: string;
  displayName: string | null;
  photoPath: string | null;
  timezone: string;
  locale: string;
  metrics: BodyMetric[];
  foodLikes: string[];
  foodDislikes: string[];
  allergies: string[];
  symptoms: string[];
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** How many metric readings to keep. Older ones fall off the front. */
export const MAX_METRICS = 500;

/** The longest a single food, allergy or symptom entry may be. */
export const MAX_TAG_LENGTH = 80;
export const MAX_TAGS = 100;

export interface ProfilePatch extends ProfileDetails {
  foodLikes?: string[];
  foodDislikes?: string[];
  allergies?: string[];
  symptoms?: string[];
}

export interface ProfileDetails {
  displayName?: string | null;
  photoPath?: string | null;
  timezone?: string;
  locale?: string;
  onboardingCompletedAt?: Date | null;
}

/**
 * A member's own facts: who they are, what time it is where they are, and what
 * their body and their diet look like.
 *
 * Every mutation reports which fields actually moved, and `profile.ProfileUpdated`
 * carries that list. It is not decoration — a time-zone change reschedules every
 * alert, meeting and session the member has, and the consumers key off exactly
 * that field name. A patch that changed nothing raises nothing, so an idle save
 * from a client does not wake five contexts.
 */
export class Profile extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  displayName: string | null;
  photoPath: string | null;
  timezone: string;
  locale: string;
  metrics: BodyMetric[];
  foodLikes: string[];
  foodDislikes: string[];
  allergies: string[];
  symptoms: string[];
  onboardingCompletedAt: Date | null;
  readonly createdAt: Date;

  private constructor(state: ProfileState) {
    super();
    // The member is the aggregate. There is one profile per account and it is
    // found by `userId`, so a separate id would be a second key for one row.
    this.id = state.userId;
    this.userId = state.userId;
    this.displayName = state.displayName;
    this.photoPath = state.photoPath;
    this.timezone = state.timezone;
    this.locale = state.locale;
    this.metrics = state.metrics;
    this.foodLikes = state.foodLikes;
    this.foodDislikes = state.foodDislikes;
    this.allergies = state.allergies;
    this.symptoms = state.symptoms;
    this.onboardingCompletedAt = state.onboardingCompletedAt;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: ProfileState): Profile {
    return new Profile(state);
  }

  /** Created by the bootstrap handler when a member registers. Raises nothing:
   * the registration event is what the other contexts already reacted to. */
  static create(state: Omit<ProfileState, 'updatedAt'>): Profile {
    return new Profile({ ...state, updatedAt: state.createdAt });
  }

  /**
   * One patch, one event.
   *
   * Details, foods, allergies and symptoms arrive together because a client
   * sends them as one form, and each part used to raise its own
   * `ProfileUpdated` — so saving a profile with a new time zone *and* a new
   * allergy rescheduled the member's day twice and re-checked their meals
   * twice. The parts compute their own changes; only this method announces.
   */
  update(patch: ProfilePatch, at: Date = new Date()): string[] {
    const changed = [
      ...this.applyDetails(patch),
      ...this.applyFoods(patch.foodLikes, patch.foodDislikes),
      ...this.applyList('allergies', patch.allergies),
      ...this.applyList('symptoms', patch.symptoms),
    ];

    this.announce(changed, at);
    return changed;
  }

  private applyDetails(details: ProfileDetails): string[] {
    const changed: string[] = [];

    const set = <K extends keyof ProfileDetails>(
      field: K,
      value: ProfileDetails[K],
    ): void => {
      if (value === undefined) return;

      if (field === 'onboardingCompletedAt') {
        // Compared by instant, not by reference: two Date objects for the same
        // moment are never `===`, and comparing them that way would report the
        // walkthrough as newly finished on every save.
        const before = this.onboardingCompletedAt?.getTime() ?? null;
        const after = (value as Date | null)?.getTime() ?? null;
        if (before === after) return;
        this.onboardingCompletedAt = value as Date | null;
        changed.push(field);
        return;
      }

      if ((this as unknown as Record<string, unknown>)[field] === value) return;
      (this as unknown as Record<string, unknown>)[field] = value;
      changed.push(field);
    };

    set(
      'displayName',
      details.displayName === undefined
        ? undefined
        : trimToNull(details.displayName),
    );
    set('photoPath', details.photoPath);
    set('timezone', details.timezone);
    set('locale', details.locale);
    set('onboardingCompletedAt', details.onboardingCompletedAt);

    return changed;
  }

  private applyFoods(
    likes: string[] | undefined,
    dislikes: string[] | undefined,
  ): string[] {
    return [
      ...this.applyList('foodLikes', likes),
      ...this.applyList('foodDislikes', dislikes),
    ];
  }

  /**
   * One of the four normalised string lists.
   *
   * `allergies` is the reason they are normalised rather than stored as typed:
   * the list is matched against when meal suggestions are withheld, so an entry
   * saved as `Peanuts ` and looked up as `peanuts` is an allergy that does not
   * get withheld.
   */
  private applyList(
    field: 'foodLikes' | 'foodDislikes' | 'allergies' | 'symptoms',
    values: string[] | undefined,
  ): string[] {
    if (values === undefined) return [];

    const next = normaliseTags(values);
    if (sameTags(next, this[field])) return [];

    this[field] = next;
    return [field];
  }

  /**
   * One reading. Kept in time order and capped, because this list is embedded in
   * the document and a member weighing themselves daily for a decade would grow
   * it past what a single read should carry.
   *
   * Its own command, so its own event: recording a weight is not part of the
   * profile form and arrives on its own.
   */
  recordMetric(metric: BodyMetric, at: Date = new Date()): void {
    this.metrics = [...this.metrics, metric]
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
      .slice(-MAX_METRICS);

    this.announce(['metrics'], at);
  }

  /** The most recent weight, for the profile view's derived numbers. */
  get latestWeightKg(): number | undefined {
    for (let i = this.metrics.length - 1; i >= 0; i -= 1) {
      const weight = this.metrics[i]?.weightKg;
      if (weight !== undefined) return weight;
    }
    return undefined;
  }

  get latestHeightCm(): number | undefined {
    for (let i = this.metrics.length - 1; i >= 0; i -= 1) {
      const height = this.metrics[i]?.heightCm;
      if (height !== undefined) return height;
    }
    return undefined;
  }

  /**
   * BMI, or nothing. Derived rather than stored: a stored one goes stale the
   * moment either input changes, and there is no event that would refresh it.
   */
  get bmi(): number | undefined {
    const weight = this.latestWeightKg;
    const height = this.latestHeightCm;
    if (weight === undefined || height === undefined || height <= 0)
      return undefined;

    const metres = height / 100;
    return Math.round((weight / (metres * metres)) * 10) / 10;
  }

  private announce(changed: string[], at: Date): void {
    if (changed.length === 0) return;

    this.updatedAt = at;
    this.raise('profile.ProfileUpdated', 'profile', { changed }, at);
  }
}

function trimToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Lower-cased, trimmed, de-duplicated, length-capped, order preserved.
 *
 * Case and whitespace matter here because these lists are matched against, not
 * merely displayed: an allergy stored as `Peanuts ` and looked up as `peanuts`
 * is an allergy that does not get withheld.
 */
function normaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}
