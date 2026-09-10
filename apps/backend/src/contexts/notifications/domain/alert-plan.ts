import {
  localDate,
  localHhMm,
  wallClockToUtc,
} from '../../../shared/time/time.js';
import { MEMBER_CHOSEN_LABEL, type AlertLabel } from './alert.aggregate.js';

/** `1h`, `30m`, `1d`. The same shape the settings registry validates. */
const LEAD_TIME = /^(\d{1,3})([mhd])$/;

/**
 * A lead time in minutes, or null for anything unreadable.
 *
 * Null rather than a throw: a lead time reaches here from a member's stored
 * preferences, and one bad entry must not stop the other three alerts being
 * planned. The write side refuses a malformed lead time; this side survives one
 * that got in anyway.
 */
export function leadMinutes(lead: string): number | null {
  const match = LEAD_TIME.exec(lead.trim().toLowerCase());
  if (!match) return null;
  const count = Number(match[1]);
  switch (match[2]) {
    case 'd':
      return count * 1440;
    case 'h':
      return count * 60;
    default:
      return count;
  }
}

export interface QuietHours {
  from: string;
  to: string;
}

/**
 * Is this wall clock inside the quiet window?
 *
 * The window is a pair of wall-clock times in the member's own zone, and
 * `{ from: '22:00', to: '07:00' }` wraps midnight — which is the normal case,
 * since the whole point is not being woken. So the comparison is not simply
 * `from <= t < to`: when `from > to` the window is the *union* of the two ends
 * of the day, and a naive range check would mean the window covered the fifteen
 * daylight hours instead of the nine dark ones. Exactly inverted, and it would
 * have held every alert the member actually wanted.
 */
export function isQuiet(hhmm: string, quiet: QuietHours): boolean {
  const { from, to } = quiet;
  // A zero-length window means the member turned quiet hours off.
  if (from === to) return false;
  if (from < to) return hhmm >= from && hhmm < to;
  return hhmm >= from || hhmm < to;
}

/**
 * When a derived warning inside quiet hours should actually go out: the end of
 * the window, on whichever day that lands.
 *
 * Resolved through `shared/time` against the member's zone, so the answer is
 * "07:00 on their clock" rather than an instant computed from the server's.
 * That also means a window ending inside a daylight-saving gap resolves to the
 * first valid instant after it rather than an hour that never happened.
 */
export function endOfQuietHours(
  notifyAt: Date,
  quiet: QuietHours,
  timezone: string,
): Date {
  const today = localDate(notifyAt, timezone);
  const now = localHhMm(notifyAt, timezone);

  // Inside the late half of a wrapping window (23:00 with a 22:00–07:00
  // window), the window ends *tomorrow*. Inside the early half (03:00), it ends
  // today. Comparing against `from` is what tells the two apart.
  const endsTomorrow = quiet.from > quiet.to && now >= quiet.from;
  const day = endsTomorrow ? nextDay(today) : today;

  return wallClockToUtc(`${day}T${quiet.to}`, timezone) ?? notifyAt;
}

/**
 * The moment an alert should actually be sent.
 *
 * **A moment the member chose is never moved.** A reminder's own `remindAt`, a
 * task's own `dueAt` — those carry the label `0m`, and if the member asked to
 * be told at 23:30 then 23:30 is when they are told. Overriding that would be
 * the product deciding it knows better than the person who set it.
 *
 * **Every warning the system derived may be moved**, because the member did not
 * ask for it: they asked to be warned an hour ahead, and an hour ahead of a
 * 23:00 meeting is inside their quiet window. Holding it to the end of the
 * window is the honest reading of "warn me, but not in the middle of the
 * night".
 *
 * That single distinction is the whole rule, and it is why the label matters
 * rather than the source kind: a later source — a meeting, the evening prompt,
 * a training session — inherits the same reading without a new rule being
 * written for it.
 */
export function sendAt(
  notifyAt: Date,
  label: AlertLabel,
  quiet: QuietHours,
  timezone: string,
): Date {
  if (label === MEMBER_CHOSEN_LABEL) return notifyAt;
  if (!isQuiet(localHhMm(notifyAt, timezone), quiet)) return notifyAt;
  return endOfQuietHours(notifyAt, quiet, timezone);
}

/** One warning the saga wants to exist. */
export interface DesiredAlert {
  label: AlertLabel;
  notifyAt: Date;
}

/**
 * The set of warnings a moment deserves: the moment itself, plus one per lead
 * time.
 *
 * `includeLeadTimes` is false for an all-day thing, and that is a product
 * judgment rather than an oversight. "Buy milk, some time on Thursday" has no
 * hour, so its `dueAt` is a midnight the member never chose — warning them an
 * hour before midnight would be a notification at 23:00 about a task with no
 * time, which is noise. The all-day thing gets exactly one alert, at the
 * moment the row carries.
 *
 * Lead times that resolve to the past are still returned. Dropping them here
 * would hide the decision; the sweep expires what is too old, in one place,
 * with one rule.
 */
export function desiredFor(
  moment: Date,
  leadTimes: string[],
  quiet: QuietHours,
  timezone: string,
  includeLeadTimes: boolean,
): DesiredAlert[] {
  const desired: DesiredAlert[] = [
    {
      label: MEMBER_CHOSEN_LABEL,
      notifyAt: sendAt(moment, MEMBER_CHOSEN_LABEL, quiet, timezone),
    },
  ];

  if (!includeLeadTimes) return desired;

  for (const lead of leadTimes) {
    if (lead === MEMBER_CHOSEN_LABEL) continue; // already there, as the moment itself
    const minutes = leadMinutes(lead);
    if (minutes === null || minutes === 0) continue;

    const raw = new Date(moment.getTime() - minutes * 60_000);
    desired.push({ label: lead, notifyAt: sendAt(raw, lead, quiet, timezone) });
  }

  // De-duplicated by label. Two preferences entries meaning the same duration
  // (`60m` and `1h`) would otherwise plan two identical alerts, and the unique
  // index would refuse the second with a duplicate-key error rather than a
  // sensible message.
  const byLabel = new Map(desired.map((entry) => [entry.label, entry]));
  return [...byLabel.values()];
}

function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1),
  );
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate(),
  ).padStart(2, '0')}`;
}
