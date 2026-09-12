/**
 * The retry ladder for a failing webhook subscription: one minute, five, thirty,
 * two hours, then parked.
 *
 * A constant rather than a settings key (plan, "Constants and keys"). The shape
 * of the ladder is behaviour, not a knob — and a subscription still failing
 * after two hours is a health signal for someone to look at, not a number to
 * retune.
 */
export const BACKOFF_LADDER_MS = [60_000, 300_000, 1_800_000, 7_200_000] as const;

export interface NextAttempt {
  /** When to try again, or null when the delivery is parked. */
  at: Date | null;
  parked: boolean;
}

/**
 * Given how many attempts have already failed, when the next one happens.
 * `attempts` is the count *including* the one that just failed.
 */
export function nextAttemptAfter(attempts: number, now: Date = new Date()): NextAttempt {
  const index = attempts - 1;
  if (index < 0) return { at: now, parked: false };

  const delay = BACKOFF_LADDER_MS[index];
  if (delay === undefined) return { at: null, parked: true };

  return { at: new Date(now.getTime() + delay), parked: false };
}
