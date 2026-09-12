import { localHhMm } from '../../../shared/time/time.js';
import type { Session } from './session.aggregate.js';

/**
 * Why the card is showing what it is showing.
 *
 * Returned rather than left to the client to work out, because the three
 * sentences are different — "here is today's", "today is done, here is the next
 * one", "you have nothing scheduled" — and a client guessing from a null gets
 * the third when it means the second. Story 2's three scenarios are these three
 * reasons.
 *
 * `after-cutoff` is named for the case that motivated it and covers one more:
 * it means **"this is a future session"**, which is also the honest answer for
 * a member whose today simply holds nothing while Friday does. The alternative
 * was a fourth code, and the plan and the client contract fix three — a client
 * wording `after-cutoff` as "Next: Friday" is right in both cases, where a
 * fourth code would have to be handled by every client to say the same
 * sentence.
 */
export type NextPracticeReason = 'today' | 'after-cutoff' | 'none-scheduled';

export interface NextPractice {
  session: Session | null;
  reason: NextPracticeReason;
}

/**
 * The session to show, and why (FR-006).
 *
 * ## The rule
 *
 * Before the member's cut-off hour, today's session — **whatever its status**.
 * After it, the first `planned` session strictly after today ends.
 *
 * ## Why "whatever its status" before the cut-off
 *
 * Story 2 scenario 1: a session earlier today, opened before the cut-off, is
 * still the one shown, marked done or missed. That is the member's own reading
 * of their day — they trained this morning and they want to see it, not
 * tomorrow's. Filtering to `planned` here would make a completed session
 * disappear the moment it was completed and jump the card to tomorrow at eleven
 * in the morning.
 *
 * And it is why **missed is derived rather than stored**: the card asks the
 * session `isMissed(now, tz)` and so does the week view and so does Today, so
 * the three cannot disagree. Nothing ever writes it — see
 * `Session.isMissed`.
 *
 * ## Why `planned` only after the cut-off
 *
 * After the cut-off the question has changed from "what is my day" to "what is
 * next", and a cancelled or skipped future session is not next: the member has
 * already said it is not happening. A completed future session cannot exist.
 *
 * ## The edge case the cut-off makes tempting to get wrong
 *
 * The spec's last edge case: *the cut-off falls before a session that is still
 * to happen today*. A member with the default 21:00 cut-off and a 22:00 session
 * opens the card at 21:30. The rule as written shows them **tomorrow's**, which
 * is wrong, and the fix is not to move the cut-off — it is that "today" wins
 * while any of today's session is still ahead of the member. So the first
 * branch is taken when the clock is before the cut-off **or** today holds a
 * session that has not finished, and the reason is still `today`.
 *
 * That is one condition rather than a special case, and it is why the cut-off
 * is a *preference* rather than a rule: it exists to stop a member's evening
 * being spent looking at a session they have already done, not to hide one they
 * have not.
 */
export function nextPractice(
  todays: Session[],
  upcoming: Session[],
  now: Date,
  timezone: string,
  cutoff: string,
): NextPractice {
  const today = pickToday(todays);
  const stillToCome = todays.some(
    (session) =>
      session.status === 'planned' &&
      session.plannedAt.getTime() + session.durationMin * 60_000 >= now.getTime(),
  );

  const beforeCutoff = localHhMm(now, timezone) < cutoff;

  if ((beforeCutoff || stillToCome) && today) {
    return { session: today, reason: 'today' };
  }

  const next = upcoming
    .filter((session) => session.status === 'planned' && !session.isDeleted)
    .sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime())[0];

  if (next) return { session: next, reason: 'after-cutoff' };

  /*
   * Nothing ahead. If today held something we still show it rather than an
   * empty state — a member whose only session was this morning has *had* a
   * training day, and telling them at 22:00 that they have nothing scheduled is
   * true about the future and useless about the day they just had.
   */
  if (today) return { session: today, reason: 'today' };

  return { session: null, reason: 'none-scheduled' };
}

/**
 * Which of today's sessions is *the* one, when a member trains twice.
 *
 * The assumptions allow two slots in a day, so the card has to choose. The
 * earliest one that has not finished, and otherwise the last one that has —
 * which reads as "what is next today", falling back to "what you did today".
 * Ordering by `plannedAt` alone would show the morning's finished session all
 * afternoon while the evening's sat waiting.
 */
function pickToday(todays: Session[]): Session | null {
  const live = todays.filter((session) => !session.isDeleted);
  if (live.length === 0) return null;

  const byTime = [...live].sort(
    (a, b) => a.plannedAt.getTime() - b.plannedAt.getTime(),
  );
  const unfinished = byTime.find((session) => session.status === 'planned');
  return unfinished ?? byTime[byTime.length - 1]!;
}
