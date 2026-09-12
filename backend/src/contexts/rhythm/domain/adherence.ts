/**
 * Streak and adherence arithmetic, as pure functions over local dates.
 *
 * Ported from v1's `coaching/adherence.ts` with its specs. What is left behind
 * is everything that was not adherence: the rest-day rule, the muscle-group
 * avoidance and the allergen check all lived in that file because v1 had one
 * coaching service, and all three belong to phases that own those questions
 * (P6 Training, P8 Nutrition). Carrying them here would put Nutrition's
 * allergen rule in the rhythm's domain folder, where nobody looking for it
 * would think to check.
 *
 * Every date is a `YYYY-MM-DD` string in the *member's* zone, resolved by the
 * caller through `shared/time`. Nothing here takes a `Date`, and that is
 * deliberate: a function that took an instant would have to decide whose
 * midnight it meant, and it is the one decision this module must not make.
 */

export interface CheckinRecord {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  adhered: boolean | null;
}

/**
 * Calendar arithmetic, not millisecond arithmetic.
 *
 * `YYYY-MM-DD` minus one day is a question about the calendar, and subtracting
 * 86,400,000 ms gets it wrong on the two days a year a local day is 23 or 25
 * hours long. Parsing as UTC and stepping the UTC date sidesteps zones
 * entirely, which is correct here precisely because the input carries no zone.
 */
export function previousDate(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/** The other direction, same reasoning. */
export function nextDate(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

/**
 * Consecutive adhered days ending at `today`, or at yesterday when today has
 * not been answered yet.
 *
 * The "or at yesterday" is the part that matters. A member with a nine-day
 * streak who opens the app at nine in the morning has not answered today and
 * must not be shown a zero — an unanswered day is not a missed day. A miss ends
 * the streak; silence merely has not extended it.
 *
 * This is the derived view. `RhythmState.streak` is the stored one, and the two
 * agree because the stored one is folded day by day from the same rule — the
 * function exists so a spec can check the fold against a full history, and so
 * a query can answer without trusting a counter.
 */
export function currentStreak(
  checkins: CheckinRecord[],
  today: string,
): number {
  const byDate = new Map(
    checkins.map((entry) => [entry.date, entry.adhered]),
  );

  /*
   * Start at today only when today carries a real verdict.
   *
   * v1 asked `byDate.has(today)`, and that was right there because its
   * check-in rows had a non-null `adhered` — a row existed if and only if the
   * question had been answered. Here `adhered` is nullable, because the two
   * halves of a check-in arrive separately and a member can send a mood with
   * no verdict. So a row can exist while the adherence question is still
   * unanswered, and `has` reads that as "today is answered, and not adhered",
   * which ends the streak.
   *
   * Concretely: a member on a nine-day run who moves their mood slider in the
   * morning and says nothing else would see their streak drop to zero — for
   * answering *half* the question, which is the exact failure the null was
   * introduced to make expressible.
   */
  const verdictToday = byDate.get(today);
  let cursor =
    verdictToday === true || verdictToday === false ? today : previousDate(today);
  let streak = 0;
  while (byDate.get(cursor) === true) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}

/** The longest run of adhered days anywhere in the history given. */
export function bestStreak(checkins: CheckinRecord[]): number {
  const adhered = checkins
    .filter((entry) => entry.adhered === true)
    .map((entry) => entry.date)
    .sort();

  let best = 0;
  let run = 0;
  let previous: string | null = null;

  for (const date of adhered) {
    // A duplicate date is one day, not two: the same day can be answered from
    // the chat and from the card.
    if (date === previous) continue;
    run = previous !== null && previousDate(date) === previous ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

/** Share of *answered* days that were adhered, over the last `days`. */
export function completionRatio(
  checkins: CheckinRecord[],
  today: string,
  days = 7,
): number {
  const window = lastDays(today, days);
  const answered = checkins.filter(
    (entry) => window.has(entry.date) && entry.adhered !== null,
  );
  if (answered.length === 0) return 0;
  return (
    answered.filter((entry) => entry.adhered === true).length / answered.length
  );
}

/**
 * The week as the home screen draws it: seven entries, oldest first, one per
 * day up to and including today.
 *
 * `null` for a day with no answer, which is a third state the dots have to be
 * able to draw. Rendering an unanswered day as a miss is the same mistake as
 * `currentStreak` starting at today would be, and it is the one a `boolean[]`
 * forces on every caller.
 */
export function weekAdherence(
  checkins: CheckinRecord[],
  today: string,
  days = 7,
): (boolean | null)[] {
  const byDate = new Map(
    checkins.map((entry) => [entry.date, entry.adhered]),
  );
  const dates: string[] = [];
  let cursor = today;
  for (let index = 0; index < days; index += 1) {
    dates.push(cursor);
    cursor = previousDate(cursor);
  }
  return dates.reverse().map((date) => byDate.get(date) ?? null);
}

/** The set of the last `days` local dates, today included. */
function lastDays(today: string, days: number): Set<string> {
  const window = new Set<string>();
  let cursor = today;
  for (let index = 0; index < days; index += 1) {
    window.add(cursor);
    cursor = previousDate(cursor);
  }
  return window;
}

/**
 * Is a pending check-in still young enough to capture a reply?
 *
 * The window is an operator setting (`rhythm.checkinWindowHours`), passed in
 * rather than read here: this module has no store, and a domain function that
 * fetched a setting would be a domain function that could not be called from a
 * spec without one.
 */
export function checkinStillOpen(
  awaitingSince: Date | null,
  now: Date,
  windowHours: number,
): boolean {
  if (!awaitingSince) return false;
  return now.getTime() - awaitingSince.getTime() < windowHours * 3_600_000;
}
