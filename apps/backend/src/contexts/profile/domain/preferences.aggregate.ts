import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

export interface QuietHours {
  from: string;
  to: string;
}

export interface PreferencesState {
  userId: string;
  planTomorrowTime: string;
  endOfDayTime: string;
  morningBriefingTime: string;
  nextPracticeCutoff: string;
  leadTimes: string[];
  quietHours: QuietHours;
  weekStartsOn: 'monday' | 'sunday' | 'saturday';
  checkinEnabled: boolean;
  meetingDurationMin: number;
  mealMode: 'llm' | 'library';
  aiSuggestions: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Every field a member may patch. Nothing else is writable from outside. */
export const PREFERENCE_FIELDS = [
  'planTomorrowTime',
  'endOfDayTime',
  'morningBriefingTime',
  'nextPracticeCutoff',
  'leadTimes',
  'quietHours',
  'weekStartsOn',
  'checkinEnabled',
  'meetingDurationMin',
  'mealMode',
  'aiSuggestions',
] as const;

export type PreferenceField = (typeof PREFERENCE_FIELDS)[number];

/**
 * Which registry key each preference was seeded from.
 *
 * The mapping is the whole reason validation does not live in this file: a
 * preference is validated against the zod schema of its own
 * `settings.defaults.*` entry, so the rule an operator's default must satisfy
 * and the rule a member's choice must satisfy are one rule. Writing a second
 * copy here is how `endOfDayTime: '25:00'` gets refused in one place and
 * accepted in the other.
 */
export const PREFERENCE_DEFAULT_KEYS: Record<PreferenceField, string> = {
  planTomorrowTime: 'defaults.planTomorrowTime',
  endOfDayTime: 'defaults.endOfDayTime',
  morningBriefingTime: 'defaults.morningBriefingTime',
  nextPracticeCutoff: 'defaults.nextPracticeCutoff',
  leadTimes: 'defaults.leadTimes',
  quietHours: 'defaults.quietHours',
  weekStartsOn: 'defaults.weekStartsOn',
  checkinEnabled: 'defaults.checkinEnabled',
  meetingDurationMin: 'defaults.meetingDurationMin',
  mealMode: 'defaults.mealMode',
  aiSuggestions: 'defaults.aiSuggestions',
};

/**
 * The knobs a member may turn.
 *
 * Seeded from `settings.defaults.*` when they register and never overwritten
 * afterwards — changing a default moves the starting point for whoever joins
 * next and leaves everyone who already chose alone.
 *
 * `patch` takes values that have already been validated by the caller against
 * the registry schemas. The aggregate's job is the diff and the event, not the
 * parsing: it has no access to the registry, and giving it one would put a
 * store lookup inside a domain object.
 */
export class Preferences extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  planTomorrowTime: string;
  endOfDayTime: string;
  morningBriefingTime: string;
  nextPracticeCutoff: string;
  leadTimes: string[];
  quietHours: QuietHours;
  weekStartsOn: 'monday' | 'sunday' | 'saturday';
  checkinEnabled: boolean;
  meetingDurationMin: number;
  mealMode: 'llm' | 'library';
  aiSuggestions: boolean;
  readonly createdAt: Date;

  private constructor(state: PreferencesState) {
    super();
    this.id = state.userId;
    this.userId = state.userId;
    this.planTomorrowTime = state.planTomorrowTime;
    this.endOfDayTime = state.endOfDayTime;
    this.morningBriefingTime = state.morningBriefingTime;
    this.nextPracticeCutoff = state.nextPracticeCutoff;
    this.leadTimes = state.leadTimes;
    this.quietHours = state.quietHours;
    this.weekStartsOn = state.weekStartsOn;
    this.checkinEnabled = state.checkinEnabled;
    this.meetingDurationMin = state.meetingDurationMin;
    this.mealMode = state.mealMode;
    this.aiSuggestions = state.aiSuggestions;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: PreferencesState): Preferences {
    return new Preferences(state);
  }

  static create(state: Omit<PreferencesState, 'updatedAt'>): Preferences {
    return new Preferences({ ...state, updatedAt: state.createdAt });
  }

  /**
   * Applies a subset. Returns the fields that actually moved, and raises
   * `profile.PreferencesChanged` naming only those.
   *
   * The naming matters as much as it does for the profile: the rhythm context
   * reschedules a member's touches when `endOfDayTime` moves and must not
   * reschedule them when `mealMode` does.
   */
  patch(values: Partial<Record<PreferenceField, unknown>>, at: Date = new Date()): string[] {
    const changed: string[] = [];

    for (const field of PREFERENCE_FIELDS) {
      const value = values[field];
      if (value === undefined) continue;

      const current = (this as unknown as Record<string, unknown>)[field];
      if (deepEqual(current, value)) continue;

      (this as unknown as Record<string, unknown>)[field] = value;
      changed.push(field);
    }

    if (changed.length > 0) {
      this.updatedAt = at;
      this.raise('profile.PreferencesChanged', 'preferences', { changed }, at);
    }
    return changed;
  }
}

/**
 * Structural comparison, because two of these fields are not scalars.
 * `leadTimes` is an array and `quietHours` an object, and `!==` on either says
 * "changed" every single time — which would raise the event on every save and
 * reschedule the member's whole day for nothing.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}
