import type { BotvyClient } from './client.js';
import { newId } from './ids.js';
import type {
  MeetingLocation,
  MeetingRecurrence,
  Repeating,
} from './recurrence.js';
import type { SyncedRow } from './sync-store.js';

export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled';

export type MeetingSource = 'app' | 'chat' | 'extension';

/**
 * A meeting as a surface holds it: **the shape the sync pull sends**, with
 * instants as ISO strings, plus the two sync columns from `SyncedRow`.
 *
 * ## It is the pull's shape, not the GraphQL read model's
 *
 * The same trap `TaskRow` was written into and had to be corrected out of, so
 * it is worth naming again here rather than being learned twice. `TaskRow` was
 * first typed from the server's read model — the one behind the GraphQL
 * queries, which renders a `recurrenceText` sentence — while rows actually
 * arrive from `POST /api/v1/sync`, which sends the *rule*. Three fields were
 * promised and `undefined` on every row; two that were always there were
 * missing, and nothing said so because a JSON payload crosses as `unknown`.
 *
 * So this is typed field for field from `MeetingSyncAdapter.pull`, which lists
 * them deliberately rather than spreading the aggregate. The read model's
 * niceties — a rendered repeat sentence, a merged agenda — are not here,
 * because a client holding a local copy needs something else entirely: it has
 * to work out where a repeating meeting falls with no connection (FR-010), and
 * that is impossible from a rendered sentence. `recurrence` is the rule, and
 * `expandOccurrences` is what a surface does with it.
 */
export interface MeetingRow extends SyncedRow {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  durationMin: number;
  allDay: boolean;
  /** Set when the series is pinned to a place's clock; null to follow the member. */
  lockTimezone: string | null;
  /** The clock the member was reading when they chose the time. Never changes. */
  authoredTimezone: string;
  location: MeetingLocation;
  prepNotes: string | null;
  prepMinutes: number;
  /** Advance warnings, in minutes before the start. */
  reminderOffsets: number[];
  /** The rule, never expanded rows. Null for a meeting that does not repeat. */
  recurrence: MeetingRecurrence | null;
  status: MeetingStatus;
  completedAt: string | null;
  source: MeetingSource;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * A personal event — a birthday, a holiday, a block of focus time — as the pull
 * sends it.
 *
 * A second row rather than a flag on `MeetingRow` because the two disagree
 * about almost everything: an event has a colour and may fill a whole day, and
 * has no location, no preparation, no reminders and no status. What they share
 * is the repeat, which is the same `MeetingRecurrence` and the same expander —
 * a second copy of that is how a birthday moved one year would come out
 * differently from a meeting moved one week.
 */
export interface CalendarEventRow extends SyncedRow {
  id: string;
  title: string;
  notes: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string | null;
  recurrence: MeetingRecurrence | null;
  authoredTimezone: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * What a create sends. `id` is minted here when the caller has no opinion.
 *
 * `durationMin` absent means the member's own default meeting length, and
 * `reminderOffsets` absent means their own advance warnings — both resolved
 * server-side, because a client that filled them in would be shipping a
 * hard-coded default for an operator knob and a member preference.
 */
export interface NewMeeting {
  id?: string;
  title: string;
  description?: string | null;
  startAt: string;
  durationMin?: number | null;
  location: MeetingLocation;
  prepNotes?: string | null;
  prepMinutes?: number | null;
  reminderOffsets?: number[] | null;
  recurrence?: MeetingRecurrence | null;
  lockTimezone?: string | null;
  source?: MeetingSource;
}

export interface CreateMeetingAck {
  id: string;
  updatedAt: string;
  /** True when the call created nothing because the meeting was already there. */
  replayed: boolean;
}

/**
 * The member's meetings, for whichever surface asked.
 *
 * One method, and that is the whole of it for now: the extension's panel adds a
 * meeting and reads its rows out of Dexie through the sync pull, so there is no
 * in-memory table here and no list to keep. `TasksStore` holds one because the
 * portal reads from it; a second one nothing reads would be a store to keep in
 * step with no reader to notice when it drifted.
 *
 * `POST /api/v1/meetings` answers with an acknowledgement rather than a view —
 * commands are REST and reads are not — so the caller's job with the ack is to
 * stamp the server's `updatedAt` on whatever it drew optimistically.
 */
export class MeetingsStore {
  constructor(private readonly client: BotvyClient) {}

  /**
   * A new meeting.
   *
   * The id is minted here and a repeat of it is not an error: the route answers
   * 200 with `replayed: true` rather than 201, so a retry after a timeout is
   * the protocol working rather than a second meeting on the member's calendar.
   * Which is also why no idempotency key is sent — the id *is* the key.
   *
   * `location` is required by the type because **the server refuses a meeting
   * with neither a link nor an address** (FR-001), and a client that sent one
   * anyway would be spending a round trip to be told what it already knew. The
   * caller validates before it calls; this signature is what makes forgetting
   * to hard to do.
   */
  async create(meeting: NewMeeting): Promise<CreateMeetingAck> {
    const id = meeting.id ?? newId();
    return this.client.rest<CreateMeetingAck>('POST', '/meetings', {
      ...meeting,
      id,
    });
  }
}

/**
 * A meeting row as the expander wants it.
 *
 * The projection exists so that the two zones and the location travel together
 * — `expandOccurrences` reads `lockTimezone`, `authoredTimezone` and the
 * location, and a caller assembling the object by hand is a caller that can
 * leave one of them out. An event's projection is not here because nothing
 * expands events yet; the day a surface draws them, it belongs beside this one.
 */
export function meetingAsRepeating(row: MeetingRow): Repeating {
  return {
    title: row.title,
    startAt: row.startAt,
    durationMin: row.durationMin,
    location: row.location,
    recurrence: row.recurrence,
    lockTimezone: row.lockTimezone,
    authoredTimezone: row.authoredTimezone,
  };
}
