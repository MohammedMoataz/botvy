import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';
import {
  expandOccurrences,
  isReadableRule,
  moveInRule,
  nextOccurrenceAfter,
  orphanedOverrides,
  skipInRule,
  type MeetingLocation,
  type MeetingRecurrence,
  type Occurrence,
} from './recurrence-expander.js';

/**
 * `scheduled → completed | cancelled`.
 *
 * Three states and no `open`, because a meeting is not a task: it is not
 * something you have or have not done until you do it, it is something that is
 * in the diary until it either happened or did not. Completed and cancelled are
 * different facts about the same diary entry and the Deleted view shows which,
 * which is why **deleting never touches the status** — the same rule as
 * Planning's, for the same reason.
 */
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled';

/** Where the row came from, for the member's own benefit when they wonder. */
export type MeetingSource = 'app' | 'chat' | 'extension';

export interface MeetingState {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startAt: Date;
  durationMin: number;
  /**
   * Present because the blueprint's document carries it, and **unset and
   * unread** in this phase: a whole-day entry is a personal event (FR-001), so
   * a second way to say the same thing would be one more branch in the expander
   * for nothing. It is on the row rather than removed from it because the
   * migration that would drop it is a migration for no gain.
   */
  allDay: boolean;
  /** The zone the series is pinned to, or null to follow the member (FR-007). */
  lockTimezone: string | null;
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
  location: MeetingLocation;
  prepNotes: string | null;
  prepMinutes: number;
  /**
   * Minutes before the occurrence, taken from the member's own defaults **at
   * creation** and stored here.
   *
   * Stored rather than resolved on read so a later change to
   * `defaults.leadTimes` never silently moves the reminders of a meeting that
   * already exists. A member who set up a standing call and then changed their
   * global warning would otherwise find the call's warnings had moved with it.
   */
  reminderOffsets: number[];
  recurrence: MeetingRecurrence | null;
  status: MeetingStatus;
  completedAt: Date | null;
  source: MeetingSource;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 20_000;
export const MAX_PREP_NOTES_LENGTH = 20_000;
export const MAX_REMINDER_OFFSETS = 6;
/** Eight hours. Longer than any meeting; a whole day is a personal event. */
export const MAX_DURATION_MIN = 480;
export const MAX_PREP_MINUTES = 480;

export interface MeetingPatch {
  title?: string;
  description?: string | null;
  startAt?: Date;
  durationMin?: number;
  lockTimezone?: string | null;
  location?: MeetingLocation;
  prepNotes?: string | null;
  prepMinutes?: number;
  reminderOffsets?: number[];
  recurrence?: MeetingRecurrence | null;
}

/** Refused rather than corrected, so the caller can say why. */
export class MeetingRuleError extends Error {
  constructor(
    readonly code:
      | 'title_required'
      | 'location_required'
      | 'bad_duration'
      | 'bad_prep'
      | 'bad_offsets'
      | 'bad_recurrence'
      | 'no_recurrence'
      | 'orphaned_overrides'
      | 'not_deleted',
    message: string,
    /** The overrides a forced edit would discard, for `orphaned_overrides`. */
    readonly orphans: Date[] = [],
  ) {
    super(message);
    this.name = 'MeetingRuleError';
  }
}

/**
 * One meeting, and for a repeating one, one *series*.
 *
 * ## Occurrences are derived, and the series is one row (FR-006)
 *
 * `recurrence` holds the rule, the dates the member skipped and the occurrences
 * they moved. Nothing here expands into rows: a weekly meeting with no end is
 * one document, a skip is an entry in a list, and a move is an override keyed
 * by the moment the rule produced. Materialising occurrences would make "skip
 * one" ambiguous — is the row gone, or cancelled, or moved? — and would push a
 * long series down the sync channel a device has to store.
 *
 * ## An outcome belongs to the meeting; a date is skipped or moved (FR-013)
 *
 * There is deliberately no `completeOccurrence` and no `cancelOccurrence`.
 * "This meeting happened" and "this meeting is off" are statements about the
 * meeting, and within a series the member's two available statements about one
 * date are "not this one" and "this one, later". A per-occurrence status would
 * be a fourth representation of a series' state, disagreeing with the other
 * three the first time a rule changed.
 */
export class Meeting extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  title: string;
  description: string | null;
  startAt: Date;
  durationMin: number;
  allDay: boolean;
  lockTimezone: string | null;
  readonly authoredTimezone: string;
  location: MeetingLocation;
  prepNotes: string | null;
  prepMinutes: number;
  reminderOffsets: number[];
  recurrence: MeetingRecurrence | null;
  status: MeetingStatus;
  completedAt: Date | null;
  readonly source: MeetingSource;
  readonly createdAt: Date;
  deletedAt: Date | null;

  private constructor(state: MeetingState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.title = state.title;
    this.description = state.description;
    this.startAt = state.startAt;
    this.durationMin = state.durationMin;
    this.allDay = state.allDay;
    this.lockTimezone = state.lockTimezone;
    this.authoredTimezone = state.authoredTimezone;
    this.location = state.location;
    this.prepNotes = state.prepNotes;
    this.prepMinutes = state.prepMinutes;
    this.reminderOffsets = state.reminderOffsets;
    this.recurrence = state.recurrence;
    this.status = state.status;
    this.completedAt = state.completedAt;
    this.source = state.source;
    this.createdAt = state.createdAt;
    this.updatedAt = state.updatedAt;
    this.deletedAt = state.deletedAt;
  }

  static rehydrate(state: MeetingState): Meeting {
    return new Meeting(state);
  }

  /**
   * A new meeting, with the id the client minted.
   *
   * The id arrives from outside because the phone creates meetings with no
   * network and needs a stable reference before the server has seen the row; a
   * retried create is then a no-op rather than a second meeting.
   *
   * `timezone` is the member's zone right now, and it is used for two things:
   * validating the rule, and being stored as `authoredTimezone` — the clock the
   * member was reading when they chose "18:00". No *resolved instant* is stored
   * against a zone, which is what would break FR-007 for a member who moves;
   * which zone the series is expanded in is decided on every read, from
   * `lockTimezone` or the member's current profile.
   */
  static schedule(
    state: Omit<
      MeetingState,
      | 'updatedAt'
      | 'deletedAt'
      | 'completedAt'
      | 'status'
      | 'allDay'
      | 'authoredTimezone'
    > & { timezone: string; allDay?: boolean },
  ): Meeting {
    const title = requireTitle(state.title);
    const location = requireLocation(state.location);
    const durationMin = requireDuration(state.durationMin);
    const prepMinutes = requirePrep(state.prepMinutes);
    const reminderOffsets = requireOffsets(state.reminderOffsets);
    const recurrence = validatedRecurrence(
      state.recurrence,
      state.lockTimezone ?? state.timezone,
    );

    const meeting = new Meeting({
      ...state,
      // The member's zone at the moment of writing, kept for ever. See the
      // field's own note, and `recurrence-expander.ts`'s two-zones section.
      authoredTimezone: state.timezone,
      title,
      description: truncate(state.description, MAX_DESCRIPTION_LENGTH),
      prepNotes: truncate(state.prepNotes, MAX_PREP_NOTES_LENGTH),
      location,
      durationMin,
      prepMinutes,
      reminderOffsets,
      recurrence,
      allDay: false,
      status: 'scheduled',
      completedAt: null,
      deletedAt: null,
      updatedAt: state.createdAt,
    });

    meeting.raise(
      'meetings.MeetingScheduled',
      'meeting',
      meeting.alertFacts(),
      state.createdAt,
    );
    return meeting;
  }

  /**
   * A series edit, and one event describing what it did to the alerts.
   *
   * ## The warning before an override is discarded
   *
   * A rule change can leave an override describing an occurrence the new rule
   * never produces — "every week, six times" shortened to three, with week five
   * already moved. The spec says the member is warned before it is discarded,
   * so an unforced edit that would orphan an override is **refused**, carrying
   * the moments at stake, and the client turns that into a dialog. `force`
   * discards them.
   *
   * Refused rather than silently kept, because an orphan the rule cannot
   * explain shows up on the calendar as an occurrence of a series that has no
   * such occurrence, and it would keep sending reminders. Refused rather than
   * silently dropped, because a moved occurrence is the member's own decision
   * about a particular date and losing it without being asked is exactly the
   * "damaged the series" failure this phase exists to avoid.
   */
  edit(
    patch: MeetingPatch,
    timezone: string,
    options: { force?: boolean } = {},
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

    if (patch.description !== undefined) {
      const description = truncate(patch.description, MAX_DESCRIPTION_LENGTH);
      if (description !== this.description) {
        this.description = description;
        changed.push('description');
      }
    }

    if (patch.startAt !== undefined && !sameInstant(patch.startAt, this.startAt)) {
      this.startAt = patch.startAt;
      changed.push('startAt');
    }

    if (patch.durationMin !== undefined) {
      const durationMin = requireDuration(patch.durationMin);
      if (durationMin !== this.durationMin) {
        this.durationMin = durationMin;
        changed.push('durationMin');
      }
    }

    if (
      patch.lockTimezone !== undefined &&
      patch.lockTimezone !== this.lockTimezone
    ) {
      this.lockTimezone = patch.lockTimezone;
      changed.push('lockTimezone');
    }

    if (patch.location !== undefined) {
      const location = requireLocation(patch.location);
      if (
        location.onlineLink !== this.location.onlineLink ||
        location.address !== this.location.address
      ) {
        this.location = location;
        changed.push('location');
      }
    }

    if (patch.prepNotes !== undefined) {
      const prepNotes = truncate(patch.prepNotes, MAX_PREP_NOTES_LENGTH);
      if (prepNotes !== this.prepNotes) {
        this.prepNotes = prepNotes;
        changed.push('prepNotes');
      }
    }

    if (patch.prepMinutes !== undefined) {
      const prepMinutes = requirePrep(patch.prepMinutes);
      if (prepMinutes !== this.prepMinutes) {
        this.prepMinutes = prepMinutes;
        changed.push('prepMinutes');
      }
    }

    if (patch.reminderOffsets !== undefined) {
      const offsets = requireOffsets(patch.reminderOffsets);
      if (offsets.join(',') !== this.reminderOffsets.join(',')) {
        this.reminderOffsets = offsets;
        changed.push('reminderOffsets');
      }
    }

    if (patch.recurrence !== undefined) {
      // The two zones the expander distinguishes: where the digits are written
      // and which clock they are read on. The orphan check has to use the same
      // pair, or a member editing a series from another zone would be told
      // their moved occurrences were about to be discarded when they were not.
      const digitsZone = this.lockTimezone ?? this.authoredTimezone;
      const expansionZone = this.lockTimezone ?? timezone;
      const recurrence = validatedRecurrence(patch.recurrence, digitsZone);

      /*
       * The overrides the member already made are carried onto the new rule
       * before the orphan check, because a client editing "every week on
       * Monday" to "every week on Monday and Wednesday" sends the rule and not
       * the exception lists — and a patch that silently reset them would throw
       * away every skip and every move for a change that kept them all valid.
       */
      const merged: MeetingRecurrence | null = recurrence
        ? {
            ...recurrence,
            exdates:
              recurrence.exdates.length > 0
                ? recurrence.exdates
                : (this.recurrence?.exdates ?? []),
            overrides:
              recurrence.overrides.length > 0
                ? recurrence.overrides
                : (this.recurrence?.overrides ?? []),
          }
        : null;

      if (merged) {
        const orphans = orphanedOverrides(merged, digitsZone, expansionZone);
        if (orphans.length > 0 && !options.force) {
          throw new MeetingRuleError(
            'orphaned_overrides',
            `This change would discard ${orphans.length} moved occurrence(s).`,
            orphans.map((override) => override.originalStart),
          );
        }
        if (orphans.length > 0) {
          const discarded = new Set(
            orphans.map((override) => override.originalStart.getTime()),
          );
          merged.overrides = merged.overrides.filter(
            (override) => !discarded.has(override.originalStart.getTime()),
          );
        }
      }

      this.recurrence = merged;
      changed.push('recurrence');
    }

    if (changed.length === 0) return changed;

    this.updatedAt = at;
    // Every one of these fields changes what an occurrence *is* or when it is,
    // and Notifications rebuilds the whole window from the rule anyway — so
    // unlike Planning's task there is no cheap subset to filter on here. A
    // description-only edit is the one case that costs a reconcile it did not
    // need, and a reconcile that finds nothing to change writes nothing.
    this.raise('meetings.MeetingChanged', 'meeting', this.alertFacts(), at);
    return changed;
  }

  /** "Not this one." The date joins the exception list (FR-005). */
  skipOccurrence(originalStart: Date, at: Date = new Date()): void {
    const recurrence = this.requireRecurrence(
      'This meeting does not repeat, so there is nothing to skip.',
    );
    this.recurrence = skipInRule(recurrence, originalStart);
    this.updatedAt = at;
    this.raise(
      'meetings.OccurrenceSkipped',
      'meeting',
      { ...this.alertFacts(), originalStart },
      at,
    );
  }

  /**
   * "This one, later." An override keyed by the rule's own moment (FR-005).
   *
   * Moving onto a date the member had skipped clears that skip — the spec's
   * edge case, enforced in `moveInRule` so every caller gets it.
   */
  moveOccurrence(
    originalStart: Date,
    startAt: Date,
    durationMin: number | null = null,
    at: Date = new Date(),
  ): void {
    const recurrence = this.requireRecurrence(
      'This meeting does not repeat, so there is no occurrence to move.',
    );
    this.recurrence = moveInRule(recurrence, originalStart, {
      startAt,
      durationMin:
        durationMin === null ? null : requireDuration(durationMin),
    });
    this.updatedAt = at;
    this.raise(
      'meetings.OccurrenceMoved',
      'meeting',
      { ...this.alertFacts(), originalStart, movedTo: startAt },
      at,
    );
  }

  /**
   * It happened.
   *
   * The whole meeting, series included, which is FR-013: a completed series is
   * one that has run its course, and a member who wants to record one date and
   * keep the rest skips or moves instead. A meeting in the past can still be
   * completed, because the record is the point.
   */
  complete(at: Date = new Date()): void {
    this.status = 'completed';
    this.completedAt = at;
    this.updatedAt = at;
    this.raise(
      'meetings.MeetingCompleted',
      'meeting',
      { meetingId: this.id, at },
      at,
    );
  }

  /** It is off. Distinct from completed and from deleted. */
  cancel(at: Date = new Date()): void {
    this.status = 'cancelled';
    this.completedAt = null;
    this.updatedAt = at;
    this.raise(
      'meetings.MeetingCancelled',
      'meeting',
      { meetingId: this.id, at },
      at,
    );
  }

  /**
   * Removed from view, and **nothing else**.
   *
   * The status is untouched on purpose: it is the only record of whether the
   * meeting happened, was called off, or was simply removed from the diary, and
   * the Deleted view exists to show exactly that.
   */
  tombstone(at: Date = new Date()): void {
    this.deletedAt = at;
    this.updatedAt = at;
    this.raise(
      'meetings.MeetingDeleted',
      'meeting',
      { meetingId: this.id, at },
      at,
    );
  }

  /** Back from the Deleted view, with its status exactly as it was. */
  restore(at: Date = new Date()): void {
    this.deletedAt = null;
    this.updatedAt = at;
    this.raise('meetings.MeetingChanged', 'meeting', this.alertFacts(), at);
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /**
   * Gone for good. Guarded, because a purge of a live row is data loss dressed
   * as housekeeping — the sweep purges by the tombstone horizon, and a client
   * asking to erase something it has not deleted is a client with a bug.
   */
  assertPurgeable(): void {
    if (!this.isDeleted) {
      throw new MeetingRuleError(
        'not_deleted',
        'Only a deleted meeting can be erased.',
      );
    }
  }

  /**
   * Occurrences in a window, expanded in the member's zone or this meeting's
   * own (FR-007).
   *
   * A completed, cancelled or deleted meeting expands to nothing. That is the
   * one place the status touches the calendar, and it is why the alert saga does
   * not need a status branch of its own: it asks for occurrences and gets none.
   */
  occurrencesBetween(from: Date, to: Date, zone: string): Occurrence[] {
    if (this.status !== 'scheduled' || this.isDeleted) return [];
    return expandOccurrences(this, from, to, zone);
  }

  /** The next occurrence at or after `at`, for a list that says "next: Tuesday". */
  nextOccurrence(at: Date, zone: string): Date | null {
    if (this.status !== 'scheduled' || this.isDeleted) return null;
    return nextOccurrenceAfter(this, at, zone);
  }

  private requireRecurrence(message: string): MeetingRecurrence {
    if (!this.recurrence) {
      throw new MeetingRuleError('no_recurrence', message);
    }
    return this.recurrence;
  }

  /**
   * Everything Notifications and the rhythm build from this meeting, in one
   * place.
   *
   * The same method as Planning's `alertFacts`, and for the same reason: P2
   * shipped `TaskScheduled` without a `title`, so **every task notification in
   * the product said "Task due"**, and `TaskRescheduled` without `allDay`, so
   * editing a task silently dropped the member's lead times. A payload crosses
   * the boundary as `unknown`, so the type system cannot say a field is missing
   * and the consumer's fallback quietly wins instead.
   *
   * So there is one builder and every raise site calls it — including the two
   * occurrence events, which add their own date on top rather than composing a
   * payload of their own. `contracts/events.md` lists these fields, and
   * `meetings-events.spec.ts` asserts the payload itself rather than the
   * consumer's behaviour, which would pass with the fallback in place.
   */
  private alertFacts(): {
    meetingId: string;
    title: string;
    startAt: Date;
    durationMin: number;
    rrule: string | null;
    lockTimezone: string | null;
    reminderOffsets: number[];
    prepMinutes: number;
    status: MeetingStatus;
  } {
    return {
      meetingId: this.id,
      title: this.title,
      startAt: this.startAt,
      durationMin: this.durationMin,
      rrule: this.recurrence?.rrule ?? null,
      lockTimezone: this.lockTimezone,
      reminderOffsets: [...this.reminderOffsets],
      prepMinutes: this.prepMinutes,
      status: this.status,
    };
  }
}

// ------------------------------------------------------------------- guards

function requireTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_TITLE_LENGTH);
  if (title === '') {
    throw new MeetingRuleError('title_required', 'A meeting needs a name.');
  }
  return title;
}

/**
 * At least one of a link and an address, and both are allowed (FR-001).
 *
 * Refused rather than defaulted, because the two failure modes of a meeting
 * with no location are both bad and neither is recoverable from the row: a
 * member who cannot join it, and a member who does not know where to go. The
 * editor asks for one before it will save.
 */
function requireLocation(location: MeetingLocation): MeetingLocation {
  const onlineLink = trimToNull(location?.onlineLink);
  const address = trimToNull(location?.address);
  if (!onlineLink && !address) {
    throw new MeetingRuleError(
      'location_required',
      'A meeting needs a link or an address.',
    );
  }
  return { onlineLink, address };
}

function requireDuration(durationMin: number): number {
  if (
    !Number.isInteger(durationMin) ||
    durationMin < 1 ||
    durationMin > MAX_DURATION_MIN
  ) {
    throw new MeetingRuleError(
      'bad_duration',
      `A meeting lasts between 1 and ${MAX_DURATION_MIN} minutes. Something filling a whole day is a personal event.`,
    );
  }
  return durationMin;
}

function requirePrep(prepMinutes: number): number {
  if (
    !Number.isInteger(prepMinutes) ||
    prepMinutes < 0 ||
    prepMinutes > MAX_PREP_MINUTES
  ) {
    throw new MeetingRuleError(
      'bad_prep',
      `Preparation is 0 to ${MAX_PREP_MINUTES} minutes.`,
    );
  }
  return prepMinutes;
}

/**
 * Minutes before the occurrence, sorted furthest-first and de-duplicated.
 *
 * Sorted so the stored order is the order a client renders, and de-duplicated
 * because two identical offsets would be two alerts with the same label — and
 * the alert reconciliation keys on the label, so the second would silently
 * overwrite the first and the member would wonder where their warning went.
 */
function requireOffsets(offsets: number[]): number[] {
  const unique = [...new Set(offsets ?? [])];
  if (unique.length > MAX_REMINDER_OFFSETS) {
    throw new MeetingRuleError(
      'bad_offsets',
      `At most ${MAX_REMINDER_OFFSETS} reminders for one meeting.`,
    );
  }
  for (const offset of unique) {
    // A week is the far bound; a negative offset would be a reminder *after*
    // the meeting, which is a different feature nobody has asked for.
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_080) {
      throw new MeetingRuleError(
        'bad_offsets',
        'A reminder is 0 to 10080 minutes before the meeting.',
      );
    }
  }
  return unique.sort((left, right) => right - left);
}

/**
 * A rule the library refuses is refused here, at the write, where the member
 * can be told what is wrong with it. Accepting it would leave a series whose
 * occurrences nothing can compute — and the failure would surface days later,
 * on a calendar screen, with no clue why.
 */
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
    throw new MeetingRuleError(
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

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}
