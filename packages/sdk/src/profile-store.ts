import type { BotvyClient } from './client.js';

export interface BodyMetric {
  recordedAt: string;
  weightKg?: number;
  heightCm?: number;
  bodyFatPct?: number;
  note?: string;
}

/**
 * The profile as the API sends it.
 *
 * Almost every field is optional, and that is the contract rather than
 * laziness: the API omits what the member has not filled in, so a UI can tell
 * "no allergies recorded" from "allergies: none" — and the coach prompt in P4
 * depends on the same distinction.
 */
/**
 * The selections, named once.
 *
 * A GraphQL query asks for exactly the fields it wants, which means the field
 * list is the type — and two copies of it drift the moment one is edited. Both
 * reads below select from these, and `metrics` is aliased from the schema's
 * `bodyMetrics` so the shape matches what the REST commands still return.
 */
const PROFILE_FIELDS = `
  userId displayName photoUrl timezone locale
  latestWeightKg latestHeightCm bmi
  metrics: bodyMetrics { recordedAt weightKg heightCm bodyFatPct note }
  foodLikes foodDislikes allergies symptoms onboardingCompletedAt
`;

const PREFERENCES_FIELDS = `
  userId planTomorrowTime endOfDayTime morningBriefingTime nextPracticeCutoff
  leadTimes quietHours { from to } weekStartsOn checkinEnabled
  meetingDurationMin mealMode aiSuggestions
`;

export interface ProfileView {
  userId: string;
  displayName?: string;
  photoUrl?: string;
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

export interface ProfilePatch {
  displayName?: string | null;
  timezone?: string;
  locale?: string;
  onboardingCompletedAt?: string | null;
  foodLikes?: string[];
  foodDislikes?: string[];
  allergies?: string[];
  symptoms?: string[];
}

/**
 * The member's own facts and settings, held for whichever surface asked.
 *
 * Both halves are fetched together by `load`, because every screen that wants
 * one wants the other — the profile page shows a time zone next to the daily
 * times, and two round trips for one render is two chances to show a
 * half-loaded form.
 *
 * A patch applies the server's answer rather than the values that were sent.
 * The server normalises: it lower-cases and de-duplicates the tag lists and
 * trims the name, so echoing the request back locally would leave the UI
 * showing `Peanuts` while the store holds `peanuts` — and the next save would
 * then look like a change when it is not.
 */
export class ProfileStore {
  #profile: ProfileView | null = null;
  #preferences: PreferencesView | null = null;
  #listeners = new Set<() => void>();
  #loading = false;

  constructor(private readonly client: BotvyClient) {}

  get profile(): ProfileView | null {
    return this.#profile;
  }

  get preferences(): PreferencesView | null {
    return this.#preferences;
  }

  get loading(): boolean {
    return this.#loading;
  }

  /** True until both halves have arrived, so a form does not render empty. */
  get ready(): boolean {
    return this.#profile !== null && this.#preferences !== null;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async load(): Promise<void> {
    this.#loading = true;
    this.#announce();
    try {
      // One request for both, which is the read edge earning its keep: two
      // REST calls were two round trips for one screen, and the phone pays for
      // each of them twice on a bad connection.
      const { profile, preferences } = await this.client.query<{
        profile: ProfileView;
        preferences: PreferencesView;
      }>(`
        query ProfileAndPreferences {
          profile { ${PROFILE_FIELDS} }
          preferences { ${PREFERENCES_FIELDS} }
        }
      `);
      this.#profile = profile;
      this.#preferences = preferences;
    } finally {
      this.#loading = false;
      this.#announce();
    }
  }

  /** Dropped on sign-out, so the next member does not see the last one's data. */
  clear(): void {
    this.#profile = null;
    this.#preferences = null;
    this.#announce();
  }

  async updateProfile(patch: ProfilePatch): Promise<ProfileView> {
    this.#profile = await this.client.rest<ProfileView>('PATCH', '/profile', patch);
    this.#announce();
    return this.#profile;
  }

  async recordMetric(metric: Omit<BodyMetric, 'recordedAt'> & { recordedAt?: string }): Promise<ProfileView> {
    this.#profile = await this.client.rest<ProfileView>('POST', '/profile/metrics', {
      recordedAt: metric.recordedAt ?? new Date().toISOString(),
      ...metric,
    });
    this.#announce();
    return this.#profile;
  }

  /**
   * Uploads a photo. The store takes the server's `photoPath` rather than a
   * local blob URL, because the path is content-hashed — using it is what makes
   * a replaced photo actually appear instead of coming back from cache.
   */
  async uploadPhoto(file: Blob, filename = 'avatar'): Promise<ProfileView> {
    const form = new FormData();
    form.append('photo', file, filename);
    this.#profile = await this.client.upload<ProfileView>('POST', '/profile/photo', form);
    this.#announce();
    return this.#profile;
  }

  async updatePreferences(patch: Partial<PreferencesView>): Promise<PreferencesView> {
    // `userId` is not a preference. Sending it back from a spread of the
    // current view would be refused by the API, which rejects unknown fields
    // rather than ignoring them — and rightly so.
    const { userId: _ignored, ...writable } = patch as Partial<PreferencesView> & {
      userId?: string;
    };

    await this.client.rest<{ changed: string[] }>('PATCH', '/preferences', writable);
    const { preferences } = await this.client.query<{ preferences: PreferencesView }>(`
      query Preferences { preferences { ${PREFERENCES_FIELDS} } }
    `);
    this.#preferences = preferences;
    this.#announce();
    return this.#preferences;
  }

  #announce(): void {
    for (const listener of this.#listeners) listener();
  }
}
