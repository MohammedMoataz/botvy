/**
 * Lead-time expansion: given a reminder's absolute time and a set of
 * offsets, produce the notification rows to fan out.
 *
 * Offsets are strings like "1h", "30m", "0m" — "0m" meaning "at the
 * moment itself". Kept as strings because they double as the row's
 * human-readable label, which the push body uses ("1 hour before").
 */

const UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const UNIT_WORD: Record<string, string> = {
  m: 'minute',
  h: 'hour',
  d: 'day',
};

export interface PlannedNotification {
  notifyAt: Date;
  label: string;
}

/** Used when neither the reminder nor the caller specifies lead times. */
export const DEFAULT_LEAD_TIMES = ['1h', '0m'];

export function parseOffset(offset: string): number {
  const match = /^(\d+)(m|h|d)$/.exec(offset.trim());
  if (!match) throw new Error(`Invalid lead-time offset: ${offset}`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

export function offsetLabel(offset: string): string {
  const match = /^(\d+)(m|h|d)$/.exec(offset.trim());
  if (!match) throw new Error(`Invalid lead-time offset: ${offset}`);
  const value = Number(match[1]);
  if (value === 0) return 'now';
  const word = UNIT_WORD[match[2]];
  return `${value} ${word}${value === 1 ? '' : 's'} before`;
}

/**
 * Expands lead times into notification rows, dropping any that would fall
 * before `notBefore` (default: now) — a reminder set for 20 minutes from
 * now must not fire its "1 hour before" notification immediately, and a
 * reminder created for a past time must not produce a burst of overdue
 * pushes. The at-the-moment notification is always kept so a past-dated
 * reminder still notifies once.
 */
export function planNotifications(
  remindAt: Date,
  offsets: string[] = DEFAULT_LEAD_TIMES,
  notBefore: Date = new Date(),
): PlannedNotification[] {
  const seen = new Set<string>();
  const planned: PlannedNotification[] = [];

  for (const offset of offsets) {
    const label = offsetLabel(offset);
    if (seen.has(label)) continue;
    seen.add(label);

    const notifyAt = new Date(remindAt.getTime() - parseOffset(offset));
    const isAtMoment = parseOffset(offset) === 0;
    if (!isAtMoment && notifyAt < notBefore) continue;

    planned.push({ notifyAt, label });
  }

  return planned.sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime());
}
