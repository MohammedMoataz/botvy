import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

/**
 * `active → done | cancelled`, and back to `active` by reactivating.
 *
 * The same three-state shape tasks have, and for the same reason: "I did it",
 * "I decided not to" and "it is still waiting" are three different facts about
 * the member's week, and a delete must not overwrite whichever one is true.
 */
export type ReminderStatus = 'active' | 'done' | 'cancelled';

export type ReminderSource = 'app' | 'chat' | 'extension';

export interface ReminderState {
  id: string;
  userId: string;
  title: string;
  remindAt: Date;
  leadTimes: string[];
  status: ReminderStatus;
  snoozedUntil: Date | null;
  source: ReminderSource;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_REMINDER_TITLE = 500;
export const MAX_LEAD_TIMES = 6;

/** `1h`, `0m`, `1d` — a count and a unit, matching the registry's own schema. */
const LEAD_TIME = /^(\d{1,3})([mhd])$/;

export class ReminderRuleError extends Error {
  constructor(
    readonly code:
      | 'title_required'
      | 'remind_at_past'
      | 'bad_lead_time'
      | 'not_deleted'
      | 'already_active'
      | 'snooze_past',
    message: string,
  ) {
    super(message);
    this.name = 'ReminderRuleError';
  }
}

/**
 * A moment the member asked to be told about.
 *
 * Two decisions here are the phase's, recorded in `plan.md` and worth repeating
 * where they are enforced:
 *
 * **A moment already behind the member's clock is refused, not moved.**
 * Principle XI makes the member's clock the authority, and quietly shifting a
 * time they chose is precisely the silent shift it forbids — a reminder that
 * turned up a day late without being asked to is worse than one that was
 * refused with a reason. The client re-offers the same clock time on the next
 * day and sends *that*, so the member sees the change and agrees to it.
 *
 * **`leadTimes` live here, but their expansion does not.** How far ahead to
 * warn is the member's choice about this reminder, so it belongs on the row.
 * Turning "1h" into an alert at a particular instant is Notifications' job, so
 * this aggregate announces `{ remindAt, leadTimes }` and lets the saga work out
 * what that means — which is also why moving `remindAt` re-plans the alerts
 * without this context knowing that alerts exist.
 */
export class Reminder extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  title: string;
  remindAt: Date;
  leadTimes: string[];
  status: ReminderStatus;
  snoozedUntil: Date | null;
  readonly source: ReminderSource;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: ReminderState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.title = state.title;
    this.remindAt = state.remindAt;
    this.leadTimes = state.leadTimes;
    this.status = state.status;
    this.snoozedUntil = state.snoozedUntil;
    this.source = state.source;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: ReminderState): Reminder {
    return new Reminder(state);
  }

  /**
   * A new reminder, with the client's own id.
   *
   * `now` is passed in rather than read, so the refusal below is testable
   * against a fixture built from `Date.now()` — a spec pinned to a real date is
   * a spec that starts failing the day the clock reaches it.
   */
  static schedule(
    state: Omit<
      ReminderState,
      'updatedAt' | 'deletedAt' | 'status' | 'snoozedUntil'
    >,
    now: Date = new Date(),
  ): Reminder {
    const title = requireTitle(state.title);
    requireFuture(state.remindAt, now);
    const leadTimes = normaliseLeadTimes(state.leadTimes);

    const reminder = new Reminder({
      ...state,
      title,
      leadTimes,
      status: 'active',
      snoozedUntil: null,
      deletedAt: null,
      updatedAt: state.createdAt,
    });

    reminder.announce('ReminderScheduled', state.createdAt);
    return reminder;
  }

  /**
   * An edit.
   *
   * `ReminderRescheduled` goes out whenever the moment or the lead times move,
   * and also when the title does — the title is what appears on the member's
   * lock screen, so an alert built from the old one is an alert that says the
   * wrong thing.
   */
  edit(
    patch: { title?: string; remindAt?: Date; leadTimes?: string[] },
    now: Date = new Date(),
    at: Date = new Date(),
  ): string[] {
    const changed: string[] = [];

    if (patch.title !== undefined) {
      const title = requireTitle(patch.title);
      if (title !== this.title) {
        this.title = title;
        changed.push('title');
      }
    }

    if (
      patch.remindAt !== undefined &&
      patch.remindAt.getTime() !== this.remindAt.getTime()
    ) {
      requireFuture(patch.remindAt, now);
      this.remindAt = patch.remindAt;
      // A moved reminder is no longer snoozed: the member has just told us when
      // they want it, which supersedes "not now".
      this.snoozedUntil = null;
      changed.push('remindAt');
    }

    if (patch.leadTimes !== undefined) {
      const leadTimes = normaliseLeadTimes(patch.leadTimes);
      if (leadTimes.join(',') !== this.leadTimes.join(',')) {
        this.leadTimes = leadTimes;
        changed.push('leadTimes');
      }
    }

    if (changed.length === 0) return changed;

    this.updatedAt = at;
    this.announce('ReminderRescheduled', at);
    return changed;
  }

  /**
   * "Not now, in twenty minutes."
   *
   * A separate field from `remindAt` rather than a write to it, because the
   * member's original moment is still the truth about what they asked for —
   * and because a snooze that overwrote `remindAt` would make "snoozed twice
   * from 09:00" indistinguishable from "asked for 09:40".
   */
  snooze(until: Date, now: Date = new Date(), at: Date = new Date()): void {
    if (until.getTime() <= now.getTime()) {
      throw new ReminderRuleError(
        'snooze_past',
        'A snooze has to be for a moment still ahead.',
      );
    }
    this.snoozedUntil = until;
    this.status = 'active';
    this.updatedAt = at;
    this.announce('ReminderSnoozed', at);
  }

  /** Dealt with. */
  complete(at: Date = new Date()): void {
    this.status = 'done';
    this.snoozedUntil = null;
    this.updatedAt = at;
    this.raise(
      'reminders.ReminderCompleted',
      'reminder',
      { reminderId: this.id },
      at,
    );
  }

  /** Not going to happen — distinct from done, and from deleted. */
  cancel(at: Date = new Date()): void {
    this.status = 'cancelled';
    this.snoozedUntil = null;
    this.updatedAt = at;
    this.raise(
      'reminders.ReminderCancelled',
      'reminder',
      { reminderId: this.id },
      at,
    );
  }

  /**
   * Back to active, and **a new moment is required**.
   *
   * Reactivating without one would put the reminder back in the active list
   * with a moment that has already passed — so it would either fire instantly
   * or be expired by the sweep, and either way the member would not get what
   * they asked for. Making the caller supply the moment forces the question to
   * be answered where it can be: on the screen, by the person.
   */
  reactivate(
    remindAt: Date,
    now: Date = new Date(),
    at: Date = new Date(),
  ): void {
    if (this.status === 'active') {
      throw new ReminderRuleError(
        'already_active',
        'This reminder is already active.',
      );
    }
    requireFuture(remindAt, now);

    this.status = 'active';
    this.remindAt = remindAt;
    this.snoozedUntil = null;
    this.updatedAt = at;
    // `Rescheduled` rather than `Scheduled`: the row existed, and the saga's
    // job is to reconcile this source's alerts rather than plan a first set.
    this.announce('ReminderRescheduled', at);
  }

  /** Off the list, with the status exactly as it was. */
  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
    this.raise(
      'reminders.ReminderDeleted',
      'reminder',
      { reminderId: this.id },
      at,
    );
  }

  /**
   * Back from the Deleted view, with the status exactly as it was.
   *
   * A restored *active* reminder wants its alerts planned again; a restored
   * done or cancelled one does not. Announcing `Rescheduled` either way is
   * correct because the saga reconciles rather than adds — it plans nothing for
   * a source that is not active — and one event is cheaper than a branch here
   * that has to know what the saga will do with it.
   */
  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
    this.announce('ReminderRescheduled', at);
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new ReminderRuleError(
        'not_deleted',
        'Only a deleted reminder can be erased.',
      );
    }
  }

  /** The moment the member will actually be told, snooze included. */
  get effectiveAt(): Date {
    return this.snoozedUntil ?? this.remindAt;
  }

  private announce(
    name: 'ReminderScheduled' | 'ReminderRescheduled' | 'ReminderSnoozed',
    at: Date,
  ): void {
    this.raise(
      `reminders.${name}`,
      'reminder',
      {
        reminderId: this.id,
        // The effective moment, so the saga does not have to know what a snooze
        // is to plan the right instant.
        remindAt: this.effectiveAt,
        leadTimes: this.leadTimes,
      },
      at,
    );
  }
}

function requireTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_REMINDER_TITLE);
  if (title === '') {
    throw new ReminderRuleError('title_required', 'A reminder needs a title.');
  }
  return title;
}

/**
 * Refused, never moved. See the class comment.
 *
 * The message names the moment as well as the rule, because the client turns
 * this into "that time has passed — set it for tomorrow?" and needs to know
 * which time it is talking about.
 */
function requireFuture(remindAt: Date, now: Date): void {
  if (remindAt.getTime() > now.getTime()) return;
  throw new ReminderRuleError(
    'remind_at_past',
    `${remindAt.toISOString()} has already passed; a reminder has to be for a moment still ahead.`,
  );
}

/**
 * De-duplicated, capped, and ordered longest-first.
 *
 * Longest-first because that is the order the member is warned in, and a list
 * that read `0m, 1h` would render as a countdown running backwards. The cap
 * matches the registry's own schema for `defaults.leadTimes`.
 */
function normaliseLeadTimes(raw: string[]): string[] {
  const seen = new Set<string>();
  const parsed: Array<{ value: string; minutes: number }> = [];

  for (const entry of raw) {
    const lead = entry.trim().toLowerCase();
    const match = LEAD_TIME.exec(lead);
    if (!match) {
      throw new ReminderRuleError(
        'bad_lead_time',
        `"${entry}" is not a lead time like 1h, 30m or 1d.`,
      );
    }
    if (seen.has(lead)) continue;
    seen.add(lead);

    const count = Number(match[1]);
    const unit = match[2];
    const minutes =
      unit === 'd' ? count * 1440 : unit === 'h' ? count * 60 : count;
    parsed.push({ value: lead, minutes });
  }

  return parsed
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, MAX_LEAD_TIMES)
    .map((entry) => entry.value);
}
