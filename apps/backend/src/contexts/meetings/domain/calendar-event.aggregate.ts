import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import {
  expandOccurrences,
  isReadableRule,
  moveInRule,
  skipInRule,
  type MeetingRecurrence,
  type Occurrence,
  type Repeating,
} from './recurrence-expander.js';

export interface CalendarEventState {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  color: string | null;
  recurrence: MeetingRecurrence | null;
  /**
   * The zone whose clock the member was reading when they wrote this.
   *
   * Set once, at creation, from the member's profile, and never changed —
   * changing it would rewrite what the member typed. It is what
   * `recurrence-expander.ts` needs to recover "18:00" from a stored instant,
   * and so what makes FR-007's travel clause work: the digits come from here
   * (or from `lockTimezone`), and the clock they are read on is the member's
   * current one.
   */
  authoredTimezone: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_EVENT_TITLE_LENGTH = 200;
export const MAX_EVENT_NOTES_LENGTH = 20_000;

export interface CalendarEventPatch {
  title?: string;
  notes?: string | null;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  color?: string | null;
  recurrence?: MeetingRecurrence | null;
}

export class CalendarEventRuleError extends Error {
  constructor(
    readonly code:
      | 'title_required'
      | 'bad_window'
      | 'bad_recurrence'
      | 'no_recurrence'
      | 'not_deleted',
    message: string,
  ) {
    super(message);
    this.name = 'CalendarEventRuleError';
  }
}

/**
 * A birthday, a holiday, a block of focus time (FR-011).
 *
 * ## Why this is its own aggregate rather than a flag on `Meeting`
 *
 * Because the two disagree about almost everything a meeting *is*. A meeting
 * has a place you go or a link you join, a length bounded by the working day,
 * preparation, reminders and an outcome; a personal event has a colour and may
 * fill a whole day. `allDay` on `Meeting` would then be a flag that switches
 * off the location requirement, the duration bound and the status — which is
 * two aggregates in one class, and the branch would be in the expander as well
 * (FR-001 puts whole-day entries here for exactly this reason).
 *
 * ## But the *repeat* is identical, and that is deliberate
 *
 * FR-011: a repeating event skips, moves and ends exactly as a repeating
 * meeting does. So both aggregates hold the same `recurrence` object and both
 * call the same expander and the same `skipInRule` / `moveInRule`. One
 * implementation of the hardest logic in the phase, held to one fixture table —
 * a second copy for events is how a birthday moved one year would come out
 * differently from a meeting moved one week.
 */
export class CalendarEvent extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  title: string;
  notes: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  color: string | null;
  recurrence: MeetingRecurrence | null;
  readonly authoredTimezone: string;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: CalendarEventState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.title = state.title;
    this.notes = state.notes;
    this.startAt = state.startAt;
    this.endAt = state.endAt;
    this.allDay = state.allDay;
    this.color = state.color;
    this.recurrence = state.recurrence;
    this.authoredTimezone = state.authoredTimezone;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: CalendarEventState): CalendarEvent {
    return new CalendarEvent(state);
  }

  static create(
    state: Omit<
      CalendarEventState,
      'updatedAt' | 'deletedAt' | 'authoredTimezone'
    > & { timezone: string },
  ): CalendarEvent {
    const title = requireTitle(state.title);
    requireWindow(state.startAt, state.endAt);
    const recurrence = validatedRecurrence(state.recurrence, state.timezone);

    return new CalendarEvent({
      ...state,
      authoredTimezone: state.timezone,
      title,
      notes: truncate(state.notes, MAX_EVENT_NOTES_LENGTH),
      recurrence,
      deletedAt: null,
      updatedAt: state.createdAt,
    });
  }

  /**
   * A patch. No event is raised, and that is a decision rather than an omission.
   *
   * Nothing subscribes: a personal event produces no notifications (FR-011
   * lists a title, a time, a colour and a repeat, and no reminders), so an
   * event raised here would have no consumer — and "an event with consumers and
   * no producer is dead documentation" cuts both ways. The row reaches the
   * phone through `/sync` like every other row, and the sync facade raises
   * `sync.ChangesApplied` so the member's other devices are nudged.
   */
  edit(
    patch: CalendarEventPatch,
    timezone: string,
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

    if (patch.notes !== undefined) {
      const notes = truncate(patch.notes, MAX_EVENT_NOTES_LENGTH);
      if (notes !== this.notes) {
        this.notes = notes;
        changed.push('notes');
      }
    }

    const startAt = patch.startAt ?? this.startAt;
    const endAt = patch.endAt ?? this.endAt;
    if (patch.startAt !== undefined || patch.endAt !== undefined) {
      requireWindow(startAt, endAt);
      if (startAt.getTime() !== this.startAt.getTime()) {
        this.startAt = startAt;
        changed.push('startAt');
      }
      if (endAt.getTime() !== this.endAt.getTime()) {
        this.endAt = endAt;
        changed.push('endAt');
      }
    }

    if (patch.allDay !== undefined && patch.allDay !== this.allDay) {
      this.allDay = patch.allDay;
      changed.push('allDay');
    }

    if (patch.color !== undefined && patch.color !== this.color) {
      this.color = patch.color;
      changed.push('color');
    }

    if (patch.recurrence !== undefined) {
      this.recurrence = validatedRecurrence(patch.recurrence, timezone);
      changed.push('recurrence');
    }

    if (changed.length === 0) return changed;
    this.updatedAt = at;
    return changed;
  }

  /** "Not this year." The date joins the exception list (FR-011). */
  skipOccurrence(originalStart: Date, at: Date = new Date()): void {
    this.recurrence = skipInRule(
      this.requireRecurrence('This event does not repeat.'),
      originalStart,
    );
    this.updatedAt = at;
  }

  /** One occurrence moved, keyed by the rule's own moment (FR-011). */
  moveOccurrence(
    originalStart: Date,
    startAt: Date,
    at: Date = new Date(),
  ): void {
    this.recurrence = moveInRule(
      this.requireRecurrence('This event does not repeat.'),
      originalStart,
      { startAt },
    );
    this.updatedAt = at;
  }

  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
  }

  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new CalendarEventRuleError(
        'not_deleted',
        'Only a deleted event can be erased.',
      );
    }
  }

  /** Minutes from start to end, which is what the expander works in. */
  get durationMin(): number {
    return Math.max(
      1,
      Math.round((this.endAt.getTime() - this.startAt.getTime()) / 60_000),
    );
  }

  /**
   * Occurrences in a window, through the same expander a meeting uses.
   *
   * `lockTimezone: null` — an event follows the member. A birthday is a date
   * rather than an instant, so pinning it to a zone would be pinning a date to
   * a zone, and a member who flies would find their own birthday on the wrong
   * day. The location is empty for the reason the class comment gives.
   */
  occurrencesBetween(from: Date, to: Date, zone: string): Occurrence[] {
    if (this.isDeleted) return [];
    return expandOccurrences(this.asRepeating(), from, to, zone);
  }

  private asRepeating(): Repeating {
    return {
      title: this.title,
      startAt: this.startAt,
      durationMin: this.durationMin,
      location: { onlineLink: null, address: null },
      recurrence: this.recurrence,
      lockTimezone: null,
      authoredTimezone: this.authoredTimezone,
    };
  }

  private requireRecurrence(message: string): MeetingRecurrence {
    if (!this.recurrence) {
      throw new CalendarEventRuleError('no_recurrence', message);
    }
    return this.recurrence;
  }
}

function requireTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_EVENT_TITLE_LENGTH);
  if (title === '') {
    throw new CalendarEventRuleError('title_required', 'An event needs a title.');
  }
  return title;
}

/**
 * `endAt` after `startAt`, and no longer than a year.
 *
 * The upper bound is not tidiness: the expander computes an occurrence's window
 * from the duration, and an event of unbounded length would appear on every
 * agenda between its two ends. A block of focus time is hours; a holiday is
 * days; anything claiming to be longer than a year is a client with a bug.
 */
function requireWindow(startAt: Date, endAt: Date): void {
  const span = endAt.getTime() - startAt.getTime();
  if (!(span > 0) || span > 366 * 86_400_000) {
    throw new CalendarEventRuleError(
      'bad_window',
      'An event ends after it starts, and lasts at most a year.',
    );
  }
}

function validatedRecurrence(
  recurrence: MeetingRecurrence | null | undefined,
  zone: string,
): MeetingRecurrence | null {
  if (!recurrence) return null;
  const copy: MeetingRecurrence = {
    dtstart: recurrence.dtstart,
    rrule: recurrence.rrule,
    exdates: [...(recurrence.exdates ?? [])],
    overrides: (recurrence.overrides ?? []).map((override) => ({ ...override })),
  };
  if (!isReadableRule(copy, zone)) {
    throw new CalendarEventRuleError(
      'bad_recurrence',
      `Cannot read the repeat rule "${recurrence.rrule}".`,
    );
  }
  return copy;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.slice(0, max);
  return trimmed === '' ? null : trimmed;
}
