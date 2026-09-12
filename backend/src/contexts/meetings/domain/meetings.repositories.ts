import { SyncableRepository } from '../../../shared/persistence/ports/syncable-repository.js';
import type { CalendarEvent } from './calendar-event.aggregate.js';
import type { Meeting } from './meeting.aggregate.js';

/**
 * Meetings' two collections, as ports.
 *
 * Both reach the phone, so both extend the syncable port: `pullSince` answers
 * "what changed after this cursor", tombstones included, because on a delta a
 * tombstone is the only way a deletion travels.
 *
 * ## `forWindow` is the shape the whole context reads through, and why
 *
 * A recurring series cannot be found by its `startAt`: "every Monday since
 * March" has a start date months behind any window a member is looking at, and
 * its occurrences are computed rather than stored (FR-006). So a window read
 * cannot be a range query — it is "every series, plus the one-offs that could
 * touch this window", and the expander decides the rest.
 *
 * That is a deliberate trade and it is worth naming: the alternative is
 * materialising occurrences so the database can filter them, which is what
 * FR-006 forbids and what would flood a phone with a long series. A member has
 * tens of meetings, not thousands, so loading their series and expanding in
 * process costs a few hundred microseconds — measured against the plan's 80 ms
 * budget for a month of 200 occurrences, the expansion is not the expensive
 * part. If a member ever had thousands of *series* this would need revisiting;
 * a member with thousands of series has a different problem.
 */
export abstract class MeetingRepository extends SyncableRepository<Meeting> {
  /**
   * Every series, plus the one-off meetings that could touch the window.
   *
   * Live rows only — deleted, completed and cancelled meetings expand to
   * nothing anyway (`Meeting.occurrencesBetween` refuses them), and filtering
   * in the query keeps the expansion off rows that can produce no occurrence.
   */
  abstract forWindow(userId: string, from: Date, to: Date): Promise<Meeting[]>;

  /** The member's meetings for a list screen; tombstones excluded. */
  abstract listFor(
    userId: string,
    options: { includeCompleted: boolean },
  ): Promise<Meeting[]>;

  /**
   * Every member who has at least one live meeting.
   *
   * The nightly reconcile's input. It exists here rather than being derived
   * from Identity because the pass has nothing to do for a member with no
   * meetings, and asking Identity for every account would make the job's cost
   * grow with registrations instead of with diaries.
   */
  abstract memberIdsWithMeetings(): Promise<string[]>;

  /** Erases tombstones deleted before `before`. Unscoped for the nightly sweep. */
  abstract purgeTombstonesBefore(before: Date, userId?: string): Promise<number>;

  /** Every row this member owns, for the purge on `identity.UserDeleted`. */
  abstract removeAllFor(userId: string): Promise<number>;
}

export abstract class CalendarEventRepository extends SyncableRepository<CalendarEvent> {
  /** Every repeating event, plus the one-offs that could touch the window. */
  abstract forWindow(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CalendarEvent[]>;

  abstract purgeTombstonesBefore(before: Date, userId?: string): Promise<number>;

  abstract removeAllFor(userId: string): Promise<number>;
}
