/**
 * Adherence maths and scheduling rules for coaching.
 *
 * Everything here is a pure function over plain values so the parts that
 * decide what a user is told — their streak, whether today is a rest day,
 * whether a plan may overwrite a logged session, whether a plan is safe to
 * deliver — are testable without a database or a model.
 */

export interface CheckInRecord {
  /** Local calendar date, YYYY-MM-DD. */
  checkinDate: string;
  adhered: boolean;
}

// Timezone maths moved to common/ once reminders needed it too; re-exported
// here because coaching is where callers already look for it.
export { localDate } from '../common/time.js';

function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive adhered days ending at `today` (or at yesterday, so a streak
 * survives a day the user has not answered yet). A missed day ends it.
 */
export function currentStreak(checkins: CheckInRecord[], today: string): number {
  const byDate = new Map(checkins.map((c) => [c.checkinDate, c.adhered]));

  // Start at today if it is already answered, otherwise at yesterday — an
  // unanswered today must not read as a break.
  let cursor = byDate.has(today) ? today : previousDate(today);
  let streak = 0;
  while (byDate.get(cursor) === true) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}

/** Share of answered check-ins that were adhered, over the last `days`. */
export function completionRatio(
  checkins: CheckInRecord[],
  today: string,
  days = 7,
): number {
  const window = new Set<string>();
  let cursor = today;
  for (let i = 0; i < days; i += 1) {
    window.add(cursor);
    cursor = previousDate(cursor);
  }
  const answered = checkins.filter((c) => window.has(c.checkinDate));
  if (answered.length === 0) return 0;
  return answered.filter((c) => c.adhered).length / answered.length;
}

/** ISO weekday (1 = Monday … 7 = Sunday) for a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** A day not listed in the user's training days is a rest day. */
export function isRestDay(date: string, trainingDays: number[]): boolean {
  if (trainingDays.length === 0) return false;
  return !trainingDays.includes(isoWeekday(date));
}

/**
 * A generated plan must never replace a session the user actually reported
 * (the predecessor system's `source` column exists for exactly this reason).
 */
export function mayOverwrite(
  existingSource: 'reported' | 'planned' | null,
  incomingSource: 'reported' | 'planned',
): boolean {
  if (existingSource === null) return true;
  if (existingSource === 'reported' && incomingSource === 'planned') return false;
  return true;
}

/**
 * Muscle groups to avoid today, given recent history — so consecutive days
 * do not repeat the same primary groups.
 */
export function muscleGroupsToAvoid(
  recent: { workoutDate: string; muscleGroups: string[] }[],
  today: string,
): string[] {
  const yesterday = previousDate(today);
  return recent
    .filter((w) => w.workoutDate === yesterday)
    .flatMap((w) => w.muscleGroups)
    .map((g) => g.toLowerCase());
}

/**
 * Allergens present in a generated plan. A non-empty result means the plan
 * MUST NOT be delivered — the predecessor appended a warning and sent it
 * anyway, which is the behaviour this replaces.
 */
export function allergyViolations(planText: string, allergies: string[]): string[] {
  const haystack = planText.toLowerCase();
  return allergies.filter((a) => a.trim() !== '' && haystack.includes(a.toLowerCase().trim()));
}

/** A pending check-in older than this is stale and must not capture a reply. */
export const CHECKIN_WINDOW_MS = 12 * 60 * 60 * 1000;

export function checkinStillOpen(
  awaitingSince: Date | null,
  now: Date = new Date(),
  windowMs: number = CHECKIN_WINDOW_MS,
): boolean {
  if (!awaitingSince) return false;
  return now.getTime() - awaitingSince.getTime() < windowMs;
}
