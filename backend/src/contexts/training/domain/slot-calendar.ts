import { v5 as uuidv5 } from 'uuid';
import { localDate, wallClockToUtc } from '../../../shared/time/time.js';
import type { TrainingSlot } from './athlete-profile.aggregate.js';

/**
 * Turning a weekly timetable into dated sessions, and naming each one the same
 * way every time.
 *
 * This is the arithmetic the materialiser is built on, and it is separate from
 * the saga for one reason: the saga has a store, a settings service and an
 * outbox in it, and this has none of those, so the part with the calendar bugs
 * in it can be specced against a clock and nothing else.
 */

/**
 * The namespace the derived session ids live in.
 *
 * A fixed UUID, written down once and never regenerated — changing it would
 * make every existing session unreachable by its own key, so the materialiser
 * would create a second copy of the member's whole fortnight. It is arbitrary
 * in value and load-bearing in constancy, which is the only kind of constant
 * worth a comment this long.
 */
const TRAINING_NAMESPACE = '6d0b0e70-4b7a-5e2f-9a1e-2b7c9d3f5a10';

/**
 * The id a slot's session on a given local date must have.
 *
 * ## Why the id is derived rather than looked up
 *
 * The materialiser runs on five different triggers — a slot change, a sports
 * change, a program apply, a preferences change, and a nightly pass — and the
 * relay delivers at least once, so any of them can arrive twice. The naive
 * implementation queries for "a session for this slot on this date" before
 * creating one, which is a read per slot per day per pass and still races
 * itself: two deliveries can both find nothing and both insert.
 *
 * Deriving the id from `(userId, slotId, localDate)` removes the question. The
 * write is an upsert on `_id`, so a second tick, a redelivered event and two
 * concurrent passes all collapse onto the same row — and the *primary key* is
 * what enforces it, so there is no second index to keep and no partial-index
 * subtlety about missing-versus-null (which is what makes Mongo uniqueness
 * fiddly, and which this avoids entirely).
 *
 * ## Why the date and not the instant
 *
 * `localDate` is the session's date in the member's own zone. Using the instant
 * would give a member who changes time zone a *different* id for the same
 * session — so the fortnight would be created a second time, and the first copy
 * would sit there with a slot that no longer resolves to it. The local date is
 * the thing the member means by "Monday's session", and it survives the move.
 *
 * ## And why hand-made sessions do not use this
 *
 * A session the member creates themselves carries a client-minted UUIDv7 and no
 * `slotId` — it is not a slot's session and nothing should ever try to
 * regenerate it. That is also what makes it safe from the reconcile, which only
 * removes future sessions whose *slot* is gone.
 */
export function slotSessionId(
  userId: string,
  slotId: string,
  localDateString: string,
): string {
  return uuidv5(`${userId}:${slotId}:${localDateString}`, TRAINING_NAMESPACE);
}

/** One dated occurrence of a slot. */
export interface SlotOccurrence {
  slot: TrainingSlot;
  /** `YYYY-MM-DD` in the member's zone — the id's third component. */
  date: string;
  /** The instant that local date and the slot's wall clock name. */
  plannedAt: Date;
  id: string;
}

/**
 * Every occurrence of every slot within a window, in the member's own zone.
 *
 * ## The window is in local dates, not instants
 *
 * `fromDate` and `days` rather than two `Date`s, because "the next fourteen
 * days" is a statement about the member's calendar and not about a duration:
 * a fortnight that crosses a clock change is not 14 × 24 hours, and stepping by
 * milliseconds would either skip a day or produce two sessions on one.
 * Stepping the calendar date and resolving each day's wall clock separately is
 * what makes a spring-forward week come out with seven days in it.
 *
 * ## Two slots at one hour are both kept
 *
 * The spec's edge case, and it needs no code: two slots have two ids, so both
 * occurrences exist and the member decides. Nothing here de-duplicates by time.
 *
 * ## A slot whose wall clock does not exist that day
 *
 * A spring-forward gap can swallow 02:30. `wallClockToUtc` resolves such a time
 * to the first instant *after* the gap, so the session lands at 03:00 rather
 * than vanishing — the member asked to train in the small hours and the clock
 * moved under them, and a missing session would be a week silently short.
 */
export function slotOccurrencesWithin(
  userId: string,
  slots: TrainingSlot[],
  fromDate: string,
  days: number,
  timezone: string,
): SlotOccurrence[] {
  const found: SlotOccurrence[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(fromDate, offset);
    const weekday = isoWeekday(date);

    for (const slot of slots) {
      if (slot.weekday !== weekday) continue;
      const plannedAt = wallClockToUtc(`${date}T${slot.start}`, timezone);
      // Null means the zone itself is unreadable, which is a profile problem
      // rather than a calendar one. Skipped rather than thrown: one bad zone
      // must not stop the pass for every other member.
      if (!plannedAt) continue;

      found.push({
        slot,
        date,
        plannedAt,
        id: slotSessionId(userId, slot.id, date),
      });
    }
  }

  return found.sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime());
}

/**
 * Which week of a program a local date falls in, counting from the date it was
 * applied.
 *
 * This is the arithmetic FR-008's second half needs: a program longer than the
 * materialisation horizon has its later weeks filled *as the horizon reaches
 * them*, which means computing the week index long after the apply — so the
 * apply leaves `appliedStartDate` behind and this reads it.
 *
 * Whole days between two local dates, floored to weeks. Counted on the calendar
 * rather than by subtracting instants, for the same reason `slotOccurrencesWithin`
 * steps dates: a fortnight containing a clock change is not a whole number of
 * 24-hour periods, and `floor(days / 7)` off by one puts a member in the wrong
 * week of their program for a week.
 *
 * Returns null for a date before the start, which is not an error — the
 * materialiser's horizon starts today and a program may have been applied
 * tomorrow.
 */
export function programWeekIndex(
  appliedStartDate: string,
  date: string,
): number | null {
  const elapsed = daysBetween(appliedStartDate, date);
  if (elapsed < 0) return null;
  return Math.floor(elapsed / 7);
}

// ------------------------------------------------------------ date helpers
//
// All of these work on `YYYY-MM-DD` strings through UTC arithmetic, which is
// safe *because* the strings carry no time: `Date.UTC(y, m, d)` is a calendar
// index, not an instant in anybody's day, and stepping it cannot cross a clock
// change because there is no clock in it. The zone enters exactly once, in
// `wallClockToUtc`, where a wall clock becomes a real moment.

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days),
  );
  return isoDate(moved);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / 86_400_000);
}

/** 1 (Monday) to 7 (Sunday), which is what a slot's `weekday` is. */
export function isoWeekday(date: string): number {
  const day = new Date(utcMs(date)).getUTCDay();
  // `getUTCDay` is 0 for Sunday. ISO 8601 calls Sunday 7, and the data model
  // follows ISO — so the conversion happens here, once, rather than in every
  // caller that has to remember which convention it is holding.
  return day === 0 ? 7 : day;
}

/** Today, on the member's calendar. */
export function localToday(now: Date, timezone: string): string {
  return localDate(now, timezone);
}

function utcMs(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function isoDate(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(
    at.getUTCDate(),
  ).padStart(2, '0')}`;
}
