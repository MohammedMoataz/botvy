import { beforeEach, describe, expect, it } from 'vitest';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import type { SyncChange } from '../../shared/persistence/ports/sync-change.js';
import { Meeting } from './domain/meeting.aggregate.js';
import { CalendarEventSyncAdapter } from './infrastructure/calendar-event-sync.adapter.js';
import {
  InMemoryCalendarEventRepository,
  InMemoryMeetingRepository,
} from './infrastructure/in-memory-meetings.repositories.js';
import { MeetingSyncAdapter } from './infrastructure/meeting-sync.adapter.js';

/**
 * The two sync adapters against the conflict rule and the four traps
 * `CLAUDE.md` names for this transport.
 *
 * Each of these cases is a bug that has actually shipped somewhere in this
 * codebase or is one line away from doing so: a delete that rewrote a status
 * (twice), a rejection reported as `stale` against a rule that would never
 * accept the row (a retry loop for ever), a foreign id matched by an
 * unscoped write filter, and a delta pull that dropped its tombstones so the
 * phone's delete sweep never learned about a deletion.
 *
 * ## Every date is computed from the clock, never written down
 *
 * `Date.now()` is the anchor for all of it. A fixture pinned to a real date is
 * a time bomb: it passes until the day the clock reaches it, and the moment a
 * meeting's `startAt` falls behind `now` the alert planning drops lead times
 * and cases start failing for reasons that have nothing to do with sync.
 */

const USER = 'user-1';
const OTHER = 'user-2';
const CAIRO = 'Africa/Cairo';
const NEW_YORK = 'America/New_York';
/** Client-minted UUIDv7-shaped ids: the phone creates both of these offline. */
const MEETING_ID = '0192f000-0000-7000-8000-0000000000a1';
const EVENT_ID = '0192f000-0000-7000-8000-0000000000e1';

const inMinutes = (n: number) => new Date(Date.now() + n * 60_000);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

class StubMember extends MemberContextPort {
  zone = CAIRO;

  async clock(): Promise<MemberClock> {
    return { timezone: this.zone };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: ['0m'], quietHours: { from: '22:00', to: '07:00' } };
  }
}

interface Harness {
  uow: InMemoryUnitOfWork;
  meetings: InMemoryMeetingRepository;
  events: InMemoryCalendarEventRepository;
  member: StubMember;
  meetingSync: MeetingSyncAdapter;
  eventSync: CalendarEventSyncAdapter;
}

function harness(): Harness {
  const uow = new InMemoryUnitOfWork();
  const meetings = new InMemoryMeetingRepository(uow);
  const events = new InMemoryCalendarEventRepository(uow);
  const member = new StubMember();
  return {
    uow,
    meetings,
    events,
    member,
    meetingSync: new MeetingSyncAdapter(uow, meetings, member),
    eventSync: new CalendarEventSyncAdapter(uow, events, member),
  };
}

/** A pushed row, with the protocol's defaults filled in. */
function change(partial: Partial<SyncChange> & { id: string }): SyncChange {
  return {
    op: 'update',
    updatedAt: new Date(),
    baseUpdatedAt: null,
    fields: {},
    ...partial,
  };
}

/** A meeting already on the server, saved through a real unit of work. */
async function seedMeeting(
  h: Harness,
  overrides: Partial<Parameters<typeof Meeting.schedule>[0]> = {},
): Promise<Meeting> {
  const meeting = Meeting.schedule({
    id: MEETING_ID,
    userId: USER,
    title: 'Standup',
    description: null,
    startAt: inMinutes(90),
    durationMin: 30,
    lockTimezone: null,
    location: { onlineLink: 'https://meet.example/standup', address: null },
    prepNotes: null,
    prepMinutes: 0,
    reminderOffsets: [10],
    recurrence: null,
    source: 'app',
    createdAt: minutesAgo(10),
    timezone: CAIRO,
    ...overrides,
  });
  // Inside a unit of work, because `schedule` raises an event and the
  // in-memory uow refuses to collect one outside a transaction — the aggregate
  // and its outbox entry commit together or not at all.
  await h.uow.run(() => h.meetings.save(meeting));
  return meeting;
}

/** The fields a valid meeting push carries, for the cases that need a create. */
function validMeetingFields(): Record<string, unknown> {
  return {
    title: 'Kickoff',
    startAt: inMinutes(120).toISOString(),
    durationMin: 45,
    location: { onlineLink: null, address: '12 Nile St' },
    prepMinutes: 15,
    reminderOffsets: [30, 10],
  };
}

describe('the apply order', () => {
  it('puts both after reminders and before the rhythm, with room between', () => {
    const h = harness();
    // The contract's `entities` list is labels, tasks, reminders, meetings,
    // calendar events, then the rhythm's three at 40/41/42. Neither of these
    // two has a dependency — the assertion is that the sequence still reads
    // the way the contract writes it, so nobody "fixes" it in the wrong
    // direction later.
    expect(h.meetingSync.applyOrder).toBeGreaterThan(30);
    expect(h.eventSync.applyOrder).toBeGreaterThan(h.meetingSync.applyOrder);
    expect(h.eventSync.applyOrder).toBeLessThan(40);
  });
});

describe('a meeting push against the conflict rule', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('refuses a stale push with the entity and the server row', async () => {
    const server = await seedMeeting(h);

    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'update',
        // The base no longer matches, so the clock is consulted — and this
        // device's edit is older than the server's row.
        baseUpdatedAt: minutesAgo(30),
        updatedAt: minutesAgo(20),
        fields: { title: 'Renamed on a plane' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    // The client branches on `entity` before touching any table: writing a
    // refused meeting through the task path corrupts rather than crashes.
    expect(outcome.rejection.entity).toBe('meetings');
    expect(outcome.rejection.id).toBe(MEETING_ID);
    expect(outcome.rejection.reason).toBe('stale');
    // And the row itself, because the client's obligation on `stale` is to
    // overwrite its copy from it. A rejection without the row makes the phone
    // ask again, get the same refusal, and loop.
    expect(outcome.rejection.server).not.toBeNull();
    expect((outcome.rejection.server as Meeting).id).toBe(MEETING_ID);
    expect((outcome.rejection.server as Meeting).title).toBe('Standup');
    expect(h.meetings.rows.get(MEETING_ID)?.title).toBe('Standup');
    expect((outcome.rejection.server as Meeting).updatedAt.getTime()).toBe(
      server.updatedAt.getTime(),
    );
  });

  it('refuses a purge of a live row as not_deleted', async () => {
    const server = await seedMeeting(h);

    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'purge',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('meetings');
    expect(outcome.rejection.reason).toBe('not_deleted');
    // Erasing a live row is data loss dressed as housekeeping: the row stays.
    expect(h.meetings.rows.has(MEETING_ID)).toBe(true);
  });

  it('refuses an id belonging to another member, and never as stale', async () => {
    const theirs = await seedMeeting(h, { userId: OTHER });

    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'update',
        // The pushing device claims a base that *does* match the stored row,
        // which is exactly the shape that would sail through an unscoped write
        // filter — the refusal has to come from the scope of the read, not from
        // the clock.
        baseUpdatedAt: theirs.updatedAt,
        updatedAt: new Date(),
        fields: { title: 'Not mine' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('meetings');
    // `gone`, indistinguishable from an id that never existed — and the point
    // of the assertion is the second half: `stale` would tell the phone to take
    // the server's copy and retry, against a row it may never see, for ever.
    expect(outcome.rejection.reason).toBe('gone');
    expect(outcome.rejection.reason).not.toBe('stale');
    // And the other member's row is untouched.
    const row = h.meetings.rows.get(MEETING_ID);
    expect(row?.userId).toBe(OTHER);
    expect(row?.title).toBe('Standup');
    expect(row?.updatedAt.getTime()).toBe(theirs.updatedAt.getTime());
  });

  it('refuses a row no domain rule will ever accept as invalid', async () => {
    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'create',
        updatedAt: new Date(),
        fields: {
          ...validMeetingFields(),
          // Neither a link nor an address: a meeting the member could not join
          // and could not travel to. `location_required`.
          location: { onlineLink: null, address: null },
        },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('meetings');
    // `invalid`, so the client surfaces it to the member. `stale` would have
    // the phone refresh and re-send the same bytes against the same rule for
    // ever.
    expect(outcome.rejection.reason).toBe('invalid');
    expect(h.meetings.rows.has(MEETING_ID)).toBe(false);
  });
});

describe('a meeting push that is accepted', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('inserts a create for an id the server has never seen', async () => {
    // The offline case: the phone minted the id and created the row with no
    // network, so the server's first sight of it is this push.
    const clientEdit = minutesAgo(5);
    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'create',
        updatedAt: clientEdit,
        fields: validMeetingFields(),
      }),
      new Date(),
    );

    expect(outcome).toEqual({ applied: true, id: MEETING_ID });
    const row = h.meetings.rows.get(MEETING_ID);
    expect(row?.userId).toBe(USER);
    expect(row?.title).toBe('Kickoff');
    expect(row?.status).toBe('scheduled');
    // `createdAt` is the client's own edit time, not the server's `now`: the
    // row was created when the member made it, on a plane.
    expect(row?.createdAt.getTime()).toBe(clientEdit.getTime());
    // The member's zone as the server knows it, from `MemberContextPort`.
    expect(row?.authoredTimezone).toBe(CAIRO);
    expect(h.uow.events.map((event) => event.name)).toContain(
      'meetings.MeetingScheduled',
    );
  });

  it('leaves the status alone when a delete arrives', async () => {
    const server = await seedMeeting(h);
    server.cancel(minutesAgo(2));
    await h.uow.run(() => h.meetings.save(server));
    expect(h.meetings.rows.get(MEETING_ID)?.status).toBe('cancelled');

    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'delete',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        // A client that sends a whole row on a delete must not be able to move
        // the status through the back door either.
        fields: { status: 'scheduled', title: 'Standup' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    const row = h.meetings.rows.get(MEETING_ID);
    expect(row?.deletedAt).not.toBeNull();
    /*
     * The status is the only record of whether the meeting happened, was called
     * off, or was simply removed from the diary, and the Deleted view exists to
     * show exactly that. A delete that rewrote it has shipped twice in this
     * codebase, which is why this assertion is here rather than trusted to the
     * aggregate's own spec.
     */
    expect(row?.status).toBe('cancelled');
  });

  it('never lets a pushed row rewrite authoredTimezone', async () => {
    const server = await seedMeeting(h);
    expect(h.meetings.rows.get(MEETING_ID)?.authoredTimezone).toBe(CAIRO);

    // The member has since flown, so their profile now reads New York — and
    // the pushed row, from a device that was offline, claims New York too.
    h.member.zone = NEW_YORK;

    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'update',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        fields: { title: 'Standup (renamed)', authoredTimezone: NEW_YORK },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    const row = h.meetings.rows.get(MEETING_ID);
    expect(row?.title).toBe('Standup (renamed)');
    /*
     * `authoredTimezone` records what the member's clock read when they typed
     * the time, and the expander recovers the digits of "every Monday at 18:00"
     * from the stored instant against it. Letting a client rewrite it would let
     * a stale device silently move every occurrence of a series, with no field
     * on the row visibly changing.
     */
    expect(row?.authoredTimezone).toBe(CAIRO);
  });

  it('forces a series edit through rather than refusing an orphaned override', async () => {
    // "Every day, four times", with the third occurrence moved.
    const dtstart = inMinutes(60);
    const third = new Date(dtstart.getTime() + 2 * 86_400_000);
    const server = await seedMeeting(h, {
      startAt: dtstart,
      recurrence: {
        dtstart,
        rrule: 'FREQ=DAILY;COUNT=4',
        exdates: [],
        overrides: [
          { originalStart: third, startAt: new Date(third.getTime() + 3_600_000) },
        ],
      },
    });

    const outcome = await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'update',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        // Shortened to two, which orphans the moved third occurrence. The
        // interactive editor raises a dialog here; a sync push has no member in
        // front of it to answer one, and refusing it would make the phone retry
        // a request that can never be accepted.
        fields: {
          recurrence: {
            dtstart: dtstart.toISOString(),
            rrule: 'FREQ=DAILY;COUNT=2',
            exdates: [],
            overrides: [],
          },
        },
      }),
      new Date(),
    );

    expect(outcome).toEqual({ applied: true, id: MEETING_ID });
    const row = h.meetings.rows.get(MEETING_ID);
    expect(row?.recurrence?.rrule).toBe('FREQ=DAILY;COUNT=2');
    // The trade this makes: the moved occurrence is gone, and the honest place
    // for that warning is the editor, which is where the member is.
    expect(row?.recurrence?.overrides).toEqual([]);
  });
});

describe('the meeting pull', () => {
  it('carries tombstones, on a delta as well as a snapshot', async () => {
    const h = harness();
    const server = await seedMeeting(h);
    // A cursor the phone already holds: after the create (ten minutes ago) and
    // before the delete, so the delta below contains the deletion and nothing
    // else. Not `new Date()`, which lands in the same millisecond as the delete
    // and would make the case pass or fail on scheduler luck.
    const cursor = minutesAgo(1);

    await h.meetingSync.apply(
      USER,
      change({
        id: MEETING_ID,
        op: 'delete',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
      }),
      new Date(),
    );

    const snapshot = (await h.meetingSync.pull(USER, null)) as Array<{
      id: string;
      deletedAt: Date | null;
      status: string;
      authoredTimezone: string;
    }>;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.id).toBe(MEETING_ID);
    expect(snapshot[0]?.deletedAt).not.toBeNull();
    expect(snapshot[0]?.status).toBe('scheduled');
    expect(snapshot[0]?.authoredTimezone).toBe(CAIRO);

    /*
     * And on a delta, which is the case that matters: the client's delete sweep
     * runs only against a full snapshot, so on a delta the tombstone is the
     * *only* way the deletion travels. A pull that filtered them out would
     * leave the row on the phone until something else happened to force a
     * snapshot.
     */
    const delta = (await h.meetingSync.pull(USER, cursor)) as Array<{
      id: string;
      deletedAt: Date | null;
    }>;
    expect(delta.map((row) => row.id)).toEqual([MEETING_ID]);
    expect(delta[0]?.deletedAt).not.toBeNull();
  });
});

describe('a personal event push', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('inserts an offline create and names its own entity', async () => {
    const startAt = inMinutes(240);
    const outcome = await h.eventSync.apply(
      USER,
      change({
        id: EVENT_ID,
        op: 'create',
        updatedAt: minutesAgo(3),
        fields: {
          title: 'Focus block',
          startAt: startAt.toISOString(),
          endAt: new Date(startAt.getTime() + 5_400_000).toISOString(),
          allDay: false,
          color: '#0f766e',
        },
      }),
      new Date(),
    );

    expect(outcome).toEqual({ applied: true, id: EVENT_ID });
    const row = h.events.rows.get(EVENT_ID);
    expect(row?.userId).toBe(USER);
    expect(row?.authoredTimezone).toBe(CAIRO);

    const rows = (await h.eventSync.pull(USER, null)) as Array<{
      id: string;
      color: string | null;
      deletedAt: Date | null;
    }>;
    expect(rows.map((event) => event.id)).toEqual([EVENT_ID]);
    expect(rows[0]?.color).toBe('#0f766e');
    // Carried even before anything is deleted, so the phone never has to treat
    // an absent key as "not deleted" for one entity.
    expect(rows[0]?.deletedAt).toBeNull();
  });

  it('refuses a window no rule will accept as invalid, under its own entity name', async () => {
    const startAt = inMinutes(240);
    const outcome = await h.eventSync.apply(
      USER,
      change({
        id: EVENT_ID,
        op: 'create',
        updatedAt: new Date(),
        fields: {
          title: 'Backwards',
          startAt: startAt.toISOString(),
          endAt: new Date(startAt.getTime() - 60_000).toISOString(),
        },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('calendar_events');
    expect(outcome.rejection.reason).toBe('invalid');
    expect(h.events.rows.has(EVENT_ID)).toBe(false);
  });

  it('leaves authoredTimezone alone on an update, like a meeting', async () => {
    const startAt = inMinutes(240);
    await h.eventSync.apply(
      USER,
      change({
        id: EVENT_ID,
        op: 'create',
        updatedAt: minutesAgo(3),
        fields: {
          title: 'Birthday',
          startAt: startAt.toISOString(),
          endAt: new Date(startAt.getTime() + 3_600_000).toISOString(),
        },
      }),
      new Date(),
    );
    const stored = h.events.rows.get(EVENT_ID);

    h.member.zone = NEW_YORK;
    const outcome = await h.eventSync.apply(
      USER,
      change({
        id: EVENT_ID,
        op: 'update',
        baseUpdatedAt: stored?.updatedAt ?? null,
        updatedAt: new Date(),
        fields: { title: 'Birthday party', authoredTimezone: NEW_YORK },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    expect(h.events.rows.get(EVENT_ID)?.title).toBe('Birthday party');
    expect(h.events.rows.get(EVENT_ID)?.authoredTimezone).toBe(CAIRO);
  });
});
