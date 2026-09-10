/**
 * The things this context needs and does not own: three for the sweep, two for
 * the meetings branch of the alert planning saga.
 *
 * Each is a port declared here, in `domain/`, and bound in this context's own
 * `infrastructure/` to the owning context's published surface. That is the seam
 * constitution IX sanctions and the one the lint rule leaves open:
 * `infrastructure/` is the single layer allowed to know another context exists,
 * because binding a local port to somebody else's query is its job.
 *
 * The alternative — the sweep reading Identity's tables and deleting Planning's
 * rows — is what v1 did, and it is what principle I exists to forbid. The sweep
 * knows *what it needs done*; the context that owns the data decides *how*, and
 * reports back a number the sweep can put in its own output.
 */

/** One device that might receive a notification. Identity's shape, narrowed. */
export interface NotifiableDevice {
  userId: string;
  deviceId: string;
  pushToken: string | null;
  /**
   * When this device last synced.
   *
   * The sweep's whole reason for asking. A device whose `lastSeenAt` is at or
   * after an alert's `plannedAt` has already pulled that alert and scheduled it
   * locally — the phone's own alarm works with the network off, so the server
   * is the fallback, not the primary. Sending to it anyway notifies the member
   * twice for one thing.
   */
  lastSeenAt: Date | null;
}

/** Bound to Identity's `DevicesQueryHandler`. */
export abstract class DeviceLookupPort {
  abstract forUsers(userIds: string[]): Promise<NotifiableDevice[]>;
}

/**
 * Bound to Identity's device removal.
 *
 * A push token FCM reports invalid belongs to a device row in *PostgreSQL*,
 * which this context cannot open and should not want to. It asks.
 */
export abstract class DeviceRemovalPort {
  abstract removeByPushToken(tokens: string[]): Promise<number>;
}

/**
 * Bound to Planning's and Reminders' own purge handlers.
 *
 * Tombstones past the horizon are *their* rows. The sweep is simply the thing
 * that runs on a timer, so it asks each owner to purge its own collections and
 * adds up what they report — which is why the number in the sweep's output is
 * honest: it is a count of rows those contexts deleted, reported by the
 * contexts that deleted them.
 */
export abstract class TombstonePurgePort {
  abstract purgeBefore(before: Date): Promise<number>;
}

/**
 * One occurrence of one meeting, narrowed to what a *scheduler* reads.
 *
 * Meetings' own view carries a location and a `moved` flag as well; neither
 * has anything to do with when to warn somebody, and a port that copied the
 * whole shape would be this context claiming an interest in fields it never
 * looks at.
 *
 * `originalStart` and `startAt` are both here and they are not the same
 * question. `startAt` is where the occurrence actually sits, so it is what the
 * warnings are counted back from. `originalStart` is the moment the *rule*
 * produced, which is the override key on the meeting and therefore the stable
 * identity of this occurrence across a move — so it is what the alert records
 * as `source.occurrenceAt`. Keying on `startAt` instead would make a dragged
 * occurrence a different occurrence, and the reconcile would delete and
 * re-create rather than move what it already holds.
 */
export interface MeetingOccurrence {
  meetingId: string;
  title: string;
  /** The moment the rule produced: the override key, and the alert's key. */
  originalStart: Date;
  /** Where it actually sits, after any override. Warnings count back from here. */
  startAt: Date;
  durationMin: number;
  prepMinutes: number;
  /** Minutes before the occurrence, stored on the meeting at creation. */
  reminderOffsets: number[];
}

/**
 * Bound to Meetings' `MeetingOccurrencesQueryHandler`.
 *
 * ## Why the saga may not simply read `meetings`
 *
 * Two reasons, and the second is the one that would bite. `meetings` is
 * Meetings' collection and this is Notifications, which principle I settles on
 * its own. But even with the collection in hand there is nothing in a row to
 * read: occurrences are derived from a recurrence rule and are never
 * materialised (FR-006), so "the next fourteen days of this meeting" is the
 * output of an expander that resolves wall-clock digits against the member's
 * current zone. Expanding here would put a second copy of the hardest logic on
 * the server alone, and the first divergence between the two would be an alarm
 * at one hour with a calendar insisting the meeting is at another.
 */
export abstract class MeetingOccurrencesPort {
  abstract forMember(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<MeetingOccurrence[]>;
}

/**
 * Bound to Meetings' own repository.
 *
 * The nightly pass's input. It asks *Meetings* who has a diary rather than
 * asking Identity for every account, because a member with no meetings gives
 * the pass nothing to do — so the job's cost grows with diaries instead of with
 * registrations. And the sweep may not read `meetings` to find out for the same
 * reason it may not read occurrences: the collection is not its.
 */
export abstract class MeetingMembersPort {
  abstract withMeetings(): Promise<string[]>;
}
