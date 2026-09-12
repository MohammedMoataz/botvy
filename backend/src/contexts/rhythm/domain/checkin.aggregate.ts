import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/** Where the answer came from. The chat path arrives with P4. */
export type CheckinSource = 'chat' | 'notification' | 'app';

export interface CheckinState {
  userId: string;
  date: string;
  mood: number | null;
  adhered: boolean | null;
  note: string | null;
  source: CheckinSource;
  createdAt: Date;
  updatedAt: Date;
}

/** The mood scale, and the only place its bounds are written down. */
export const MOOD_MIN = 0;
export const MOOD_MAX = 100;

/**
 * How one day went, by the member's own account.
 *
 * ## Every field is nullable, and that is not laziness
 *
 * The two halves of a check-in arrive by different routes. A one-word reply in
 * the coach chat says whether the plan was followed and knows nothing about a
 * mood; the card on the phone can send a mood with no verdict at all. Requiring
 * both would mean refusing the answer the member actually gave.
 *
 * Which makes the distinction between "nought" and "not answered" real, and it
 * has to be `null` rather than falsy: a mood of 0 is a member having a terrible
 * day, and the streak, the coach's prompt and the week's dots all read it. A
 * `mood || undefined` anywhere in this feature is a bug.
 *
 * ## Recording twice is an update, not a second row
 *
 * `"<userId>:<date>"` is the id, so a member who answers in the chat and then
 * taps the card patches one row. The alternative — a row per answer — would
 * make "how many days did they follow the plan" a question about
 * de-duplication.
 */
export class Checkin extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  mood: number | null;
  adhered: boolean | null;
  note: string | null;
  source: CheckinSource;
  readonly createdAt: Date;

  private constructor(state: CheckinState) {
    super();
    this.id = checkinId(state.userId, state.date);
    this.userId = state.userId;
    this.date = state.date;
    this.mood = state.mood;
    this.adhered = state.adhered;
    this.note = state.note;
    this.source = state.source;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
  }

  static rehydrate(state: CheckinState): Checkin {
    return new Checkin(state);
  }

  static create(input: {
    userId: string;
    date: string;
    source: CheckinSource;
    at: Date;
  }): Checkin {
    return new Checkin({
      userId: input.userId,
      date: input.date,
      mood: null,
      adhered: null,
      note: null,
      source: input.source,
      createdAt: input.at,
      updatedAt: input.at,
    });
  }

  /**
   * Apply an answer. Only the fields the member actually sent.
   *
   * `undefined` means "not part of this answer" and leaves the stored value
   * alone; `null` means "clear it". That distinction is why the signature is
   * not `Partial<CheckinState>` with everything optional — a client sending
   * `{ mood: 40 }` must not erase the verdict it recorded an hour earlier.
   */
  record(input: {
    mood?: number | null;
    adhered?: boolean | null;
    note?: string | null;
    source?: CheckinSource;
    at: Date;
  }): void {
    if (input.mood !== undefined) this.mood = clampMood(input.mood);
    if (input.adhered !== undefined) this.adhered = input.adhered;
    if (input.note !== undefined) this.note = input.note;
    if (input.source) this.source = input.source;
    this.updatedAt = input.at;

    this.raise(
      'rhythm.CheckinRecorded',
      'checkin',
      { date: this.date, mood: this.mood, adhered: this.adhered },
      input.at,
    );
  }
}

/**
 * Out-of-range moods are clamped rather than refused.
 *
 * The endpoint validates and returns 400 for a nonsense body — that is the
 * trust boundary and it stays. This is the second line: a mood arriving from a
 * notification action or a replayed row is a number nobody can re-enter, and
 * throwing away the whole check-in over a 101 would lose the answer and the
 * streak day with it.
 */
function clampMood(mood: number | null): number | null {
  if (mood === null) return null;
  if (!Number.isFinite(mood)) return null;
  return Math.min(MOOD_MAX, Math.max(MOOD_MIN, Math.round(mood)));
}

export function checkinId(userId: string, date: string): string {
  return `${userId}:${date}`;
}
