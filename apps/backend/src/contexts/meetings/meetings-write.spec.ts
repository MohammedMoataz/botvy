import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import {
  EVENT_SCHEMA_VERSION,
  type DomainEvent,
} from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, localHhMm, wallClockToUtc } from '../../shared/time/time.js';
import { CalendarEventRuleError } from './domain/calendar-event.aggregate.js';
import { MeetingRuleError } from './domain/meeting.aggregate.js';
import type { MeetingRecurrence } from './domain/recurrence-expander.js';
import { CancelMeetingHandler } from './features/cancel-meeting/cancel-meeting.handler.js';
import { CompleteMeetingHandler } from './features/complete-meeting/complete-meeting.handler.js';
import {
  CreateCalendarEventHandler,
  type CreateCalendarEventCommand,
} from './features/create-event/create-event.handler.js';
import {
  CreateMeetingHandler,
  InvalidMeetingId,
  leadTimeMinutes,
  type CreateMeetingCommand,
} from './features/create-meeting/create-meeting.handler.js';
import { DeleteCalendarEventHandler } from './features/delete-event/delete-event.handler.js';
import { DeleteMeetingHandler } from './features/delete-meeting/delete-meeting.handler.js';
import { MoveCalendarEventOccurrenceHandler } from './features/move-event-occurrence/move-event-occurrence.handler.js';
import { MoveMeetingOccurrenceHandler } from './features/move-occurrence/move-occurrence.handler.js';
import { PurgeCalendarEventHandler } from './features/purge-event/purge-event.handler.js';
import { PurgeMeetingHandler } from './features/purge-meeting/purge-meeting.handler.js';
import { MeetingsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { RestoreCalendarEventHandler } from './features/restore-event/restore-event.handler.js';
import { MeetingDefaultsPort } from './domain/meetings.ports.js';
import { RestoreMeetingHandler } from './features/restore-meeting/restore-meeting.handler.js';
import { SkipCalendarEventOccurrenceHandler } from './features/skip-event-occurrence/skip-event-occurrence.handler.js';
import { SkipMeetingOccurrenceHandler } from './features/skip-occurrence/skip-occurrence.handler.js';
import { UpdateCalendarEventHandler } from './features/update-event/update-event.handler.js';
import {
  MeetingNotFound,
  UpdateMeetingHandler,
} from './features/update-meeting/update-meeting.handler.js';
import {
  InMemoryCalendarEventRepository,
  InMemoryMeetingRepository,
} from './infrastructure/in-memory-meetings.repositories.js';

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';
const DAY_MS = 86_400_000;

/**
 * The write side of Meetings: every command slice against the in-memory
 * adapters and an in-memory unit of work.
 *
 * The recurrence *table* lives in `meetings-recurrence.spec.ts` — that file
 * grades the expander, this one grades the handlers: which defaults a create
 * resolves, which refusals reach the caller, what a replayed create does, and
 * the rules this codebase has broken before (a delete that touched the status,
 * a purge of a live row).
 *
 * ## Every date is computed from the clock, never written down
 *
 * `Date.now()` anchors all of it. A fixture pinned to a real date passes until
 * the day the clock reaches it, and the dates here — a weekly series six weeks
 * long, an occurrence moved in week five — are exactly the shape that rots. The
 * helpers are duplicated from the recurrence spec rather than imported: a spec
 * that borrows another spec's fixtures fails for reasons that belong to the
 * other file.
 */

// ------------------------------------------------------------- clock helpers

/** The instant a wall clock names in a zone, on a given local date. */
function at(date: string, hhmm: string, zone: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

/**
 * Today's local date in `zone`, from `Date.now()`.
 *
 * Derived rather than written, which is the whole rule about fixtures here.
 */
function today(zone: string): string {
  return localDate(new Date(), zone);
}

// -------------------------------------------------------------- the harness

/**
 * The shared scheduling facts, stubbed.
 *
 * Cairo, because that is where "the member's clock, not the server's" actually
 * shows: at 23:00 UTC it is already tomorrow in Cairo, so a spec that ran in
 * UTC would agree with a broken implementation for most of the day.
 *
 * The lead times are three rather than the registry's two, so the conversion to
 * minutes is graded on all three units a lead time can carry.
 */
class StubMemberContext extends MemberContextPort {
  constructor(private readonly timezone = CAIRO) {
    super();
  }

  async clock(): Promise<MemberClock> {
    return { timezone: this.timezone };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return {
      leadTimes: ['1d', '1h', '0m'],
      quietHours: { from: '22:00', to: '07:00' },
    };
  }
}

/**
 * The member's own default meeting length.
 *
 * A stub for `MeetingDefaultsPort`, which is bound in the real module to
 * Profile's published `preferencesFor` read. It is a *port* and not the
 * settings registry because `meetingDurationMin` is a member preference seeded
 * from `settings.defaults.*` (constitution XII) — reading the installation
 * value instead means the editor silently ignores what the member set, and the
 * two agree for anybody who has not changed it, which is exactly what would
 * have made that bug invisible.
 *
 * So the stub answers a number *different* from the registry default on
 * purpose. A stub echoing 30 would pass whether the handler asked the member or
 * the installation.
 */
class StubMeetingDefaults extends MeetingDefaultsPort {
  constructor(private readonly minutes = 45) {
    super();
  }

  async durationMinFor(_userId: string): Promise<number> {
    return this.minutes;
  }
}

interface Bench {
  uow: InMemoryUnitOfWork;
  meetings: InMemoryMeetingRepository;
  events: InMemoryCalendarEventRepository;
  settings: SettingsService;
  defaults: StubMeetingDefaults;
  create: CreateMeetingHandler;
  update: UpdateMeetingHandler;
  skip: SkipMeetingOccurrenceHandler;
  move: MoveMeetingOccurrenceHandler;
  complete: CompleteMeetingHandler;
  cancel: CancelMeetingHandler;
  remove: DeleteMeetingHandler;
  restore: RestoreMeetingHandler;
  purge: PurgeMeetingHandler;
  purgeOnDeleted: MeetingsPurgeOnDeletedHandler;
  createEvent: CreateCalendarEventHandler;
  updateEvent: UpdateCalendarEventHandler;
  skipEvent: SkipCalendarEventOccurrenceHandler;
  moveEvent: MoveCalendarEventOccurrenceHandler;
  removeEvent: DeleteCalendarEventHandler;
  restoreEvent: RestoreCalendarEventHandler;
  purgeEvent: PurgeCalendarEventHandler;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const meetings = new InMemoryMeetingRepository(uow);
  const events = new InMemoryCalendarEventRepository(uow);
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const member = new StubMemberContext();
  const defaults = new StubMeetingDefaults();

  return {
    uow,
    meetings,
    events,
    settings,
    defaults,
    create: new CreateMeetingHandler(uow, meetings, member, defaults),
    update: new UpdateMeetingHandler(uow, meetings, member),
    skip: new SkipMeetingOccurrenceHandler(uow, meetings),
    move: new MoveMeetingOccurrenceHandler(uow, meetings),
    complete: new CompleteMeetingHandler(uow, meetings),
    cancel: new CancelMeetingHandler(uow, meetings),
    remove: new DeleteMeetingHandler(uow, meetings),
    restore: new RestoreMeetingHandler(uow, meetings),
    purge: new PurgeMeetingHandler(uow, meetings, events),
    purgeOnDeleted: new MeetingsPurgeOnDeletedHandler(uow, meetings, events),
    createEvent: new CreateCalendarEventHandler(uow, events, member),
    updateEvent: new UpdateCalendarEventHandler(uow, events, member),
    skipEvent: new SkipCalendarEventOccurrenceHandler(uow, events),
    moveEvent: new MoveCalendarEventOccurrenceHandler(uow, events),
    removeEvent: new DeleteCalendarEventHandler(uow, events),
    restoreEvent: new RestoreCalendarEventHandler(uow, events),
    purgeEvent: new PurgeCalendarEventHandler(uow, events),
  };
}

/** Names raised, for the assertions that care about the event and not its payload. */
const names = (b: Bench) => b.uow.events.map((event) => event.name);

const ONLINE = { onlineLink: 'https://meet.example/abc', address: null };

/** A one-off meeting today at 18:00 Cairo, with everything named explicitly. */
function meetingBody(
  overrides: Partial<CreateMeetingCommand> = {},
): CreateMeetingCommand {
  return {
    id: newId(),
    title: 'Standup',
    startAt: at(today(CAIRO), '18:00', CAIRO),
    durationMin: 30,
    location: ONLINE,
    reminderOffsets: [30],
    ...overrides,
  };
}

/** `FREQ=WEEKLY;COUNT=n` from today's 18:00, the six-week series of SC-001. */
function weekly(count: number, dtstart: Date): MeetingRecurrence {
  return {
    dtstart,
    rrule: `FREQ=WEEKLY;COUNT=${count}`,
    exdates: [],
    overrides: [],
  };
}

/**
 * The moments the rule produces, in order — the keys every occurrence command
 * takes.
 *
 * Asked of the expander rather than computed as `dtstart + 7 × 86 400 000`,
 * because a week is not always 604 800 000 milliseconds: a weekly series
 * crossing a clock change keeps its wall time and so moves its instant by an
 * hour (FR-007). Arithmetic here would name a moment the rule never produced,
 * and the whole exception model is keyed by the rule's own moment — so the
 * fixture would pass all year and fail for the fortnight around a transition.
 */
async function originalStarts(b: Bench, id: string): Promise<Date[]> {
  const meeting = await b.meetings.findById(MEMBER, id);
  if (!meeting) throw new Error(`no meeting ${id}`);
  return meeting
    .occurrencesBetween(...windowAround(meeting.startAt), CAIRO)
    .map((occurrence) => occurrence.originalStart);
}

/** A window wide enough for any series these fixtures build. */
function windowAround(startAt: Date): [Date, Date] {
  return [
    new Date(startAt.getTime() - DAY_MS),
    new Date(startAt.getTime() + 90 * DAY_MS),
  ];
}

function userDeleted(userId: string): DomainEvent {
  return {
    eventId: newId(),
    name: 'identity.UserDeleted',
    context: 'identity',
    aggregate: { type: 'user', id: userId },
    userId,
    occurredAt: new Date(),
    payload: {},
    schemaVersion: EVENT_SCHEMA_VERSION,
  };
}

// ------------------------------------------------------------------ creating

describe('creating a meeting', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('accepts the id the client minted and raises MeetingScheduled', async () => {
    const body = meetingBody();
    const result = await b.create.handle(MEMBER, body);

    expect(result.id).toBe(body.id);
    expect(result.replayed).toBe(false);
    expect(names(b)).toEqual(['meetings.MeetingScheduled']);
  });

  it('refuses a meeting with neither a link nor an address (FR-001)', async () => {
    // Both failure modes of a meeting with no location are bad and neither is
    // recoverable from the row: a member who cannot join it, and a member who
    // does not know where to go.
    await expect(
      b.create.handle(
        MEMBER,
        meetingBody({ location: { onlineLink: null, address: null } }),
      ),
    ).rejects.toThrow(MeetingRuleError);

    expect(b.meetings.rows.size).toBe(0);
  });

  it('accepts a link and an address together — one meeting, not two', async () => {
    const body = meetingBody({
      location: { onlineLink: 'https://meet.example/abc', address: 'Room 1' },
    });
    await b.create.handle(MEMBER, body);

    const meeting = await b.meetings.findById(MEMBER, body.id);
    expect(meeting?.location).toEqual({
      onlineLink: 'https://meet.example/abc',
      address: 'Room 1',
    });
  });

  it('refuses an id that is not a UUID', async () => {
    await expect(
      b.create.handle(MEMBER, meetingBody({ id: 'meeting-1' })),
    ).rejects.toThrow(InvalidMeetingId);
  });

  it("takes the member's own default length when none is named (FR-001)", async () => {
    const body = meetingBody({ durationMin: null });
    await b.create.handle(MEMBER, body);

    const meeting = await b.meetings.findById(MEMBER, body.id);
    // 45, the member's preference — not 30, the installation default. Asserting
    // against the registry would pass either way, which is the whole reason
    // this went through a member-aware port in the first place.
    expect(meeting?.durationMin).toBe(45);
    expect(meeting?.durationMin).not.toBe(
      await b.settings.get('defaults.meetingDurationMin'),
    );
  });

  it("takes the member's lead times as minute offsets when none are named (FR-003)", async () => {
    // Converted once, at creation, and stored — so a later change to the
    // preference never silently moves this meeting's reminders. Sorted
    // furthest-first by the aggregate.
    const body = meetingBody({ reminderOffsets: null });
    await b.create.handle(MEMBER, body);

    const meeting = await b.meetings.findById(MEMBER, body.id);
    expect(meeting?.reminderOffsets).toEqual([1440, 60, 0]);
  });

  it('reads every unit a lead time can carry, and nothing else', () => {
    expect(leadTimeMinutes('0m')).toBe(0);
    expect(leadTimeMinutes('30m')).toBe(30);
    expect(leadTimeMinutes('1h')).toBe(60);
    expect(leadTimeMinutes('1d')).toBe(1440);
    // Null rather than a throw: one bad preference entry must not stop the
    // other warnings being set up.
    expect(leadTimeMinutes('soon')).toBeNull();
  });

  it('answers a replayed create as the create that already happened', async () => {
    const body = meetingBody();
    const first = await b.create.handle(MEMBER, body);
    b.uow.events.length = 0;

    const replay = await b.create.handle(MEMBER, {
      ...body,
      title: 'Renamed by a client that lost the response',
    });

    expect(replay.replayed).toBe(true);
    expect(replay.updatedAt).toEqual(first.updatedAt);
    expect(b.meetings.rows.size).toBe(1);
    // The row is the one that exists, unchanged — a replay is not an edit.
    const meeting = await b.meetings.findById(MEMBER, body.id);
    expect(meeting?.title).toBe('Standup');
    // And the half that is easy to miss: no second event. A duplicate
    // MeetingScheduled would have the alert saga reconcile a window it had
    // already reconciled.
    expect(names(b)).toEqual([]);
  });

  it('keeps the zone the member was reading as authoredTimezone (FR-007)', async () => {
    const body = meetingBody();
    await b.create.handle(MEMBER, body);

    const meeting = await b.meetings.findById(MEMBER, body.id);
    expect(meeting?.authoredTimezone).toBe(CAIRO);
    // The digits survive the trip: 18:00 in the zone it was written in.
    expect(localHhMm(meeting!.startAt, CAIRO)).toBe('18:00');
  });

  it('refuses a repeat rule it cannot read, at the write', async () => {
    await expect(
      b.create.handle(
        MEMBER,
        meetingBody({
          recurrence: {
            dtstart: at(today(CAIRO), '18:00', CAIRO),
            rrule: 'FREQ=NONSENSE',
            exdates: [],
            overrides: [],
          },
        }),
      ),
    ).rejects.toThrow(MeetingRuleError);
  });
});

// -------------------------------------------------------------- series edits

describe('editing a series', () => {
  let b: Bench;
  let id: string;
  let dtstart: Date;
  /** The six moments the rule produces. `starts[4]` is week five. */
  let starts: Date[];

  beforeEach(async () => {
    b = bench();
    dtstart = at(today(CAIRO), '18:00', CAIRO);
    const body = meetingBody({ recurrence: weekly(6, dtstart) });
    id = body.id;
    await b.create.handle(MEMBER, body);
    starts = await originalStarts(b, id);
    expect(starts).toHaveLength(6);
    b.uow.events.length = 0;
  });

  it('raises MeetingChanged and nothing when nothing changed', async () => {
    const changed = await b.update.handle(MEMBER, id, { title: 'Weekly sync' });
    expect(changed.changed).toEqual(['title']);
    expect(names(b)).toEqual(['meetings.MeetingChanged']);

    b.uow.events.length = 0;
    const again = await b.update.handle(MEMBER, id, { title: 'Weekly sync' });
    expect(again.changed).toEqual([]);
    expect(names(b)).toEqual([]);
  });

  it('refuses an edit that would orphan a moved occurrence, and names it', async () => {
    // Week five moved by an hour, then the series shortened to three: the
    // override now describes an occurrence the rule never produces. Refused
    // rather than silently dropped, because a moved occurrence is the member's
    // own decision about a particular date.
    const weekFive = starts[4]!;
    await b.move.handle(
      MEMBER,
      id,
      weekFive,
      new Date(weekFive.getTime() + 3_600_000),
    );
    b.uow.events.length = 0;

    const refusal = await b.update
      .handle(MEMBER, id, { recurrence: weekly(3, dtstart) })
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(MeetingRuleError);
    const error = refusal as MeetingRuleError;
    expect(error.code).toBe('orphaned_overrides');
    expect(error.orphans.map((moment) => moment.getTime())).toEqual([
      weekFive.getTime(),
    ]);

    // Nothing was saved and nothing was announced: the rule is still six weeks
    // long and the override is still there.
    const meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.recurrence?.rrule).toBe('FREQ=WEEKLY;COUNT=6');
    expect(meeting?.recurrence?.overrides).toHaveLength(1);
    expect(names(b)).toEqual([]);
  });

  it('goes through with force, discarding exactly the orphans', async () => {
    const weekTwo = starts[1]!;
    const weekFive = starts[4]!;
    await b.move.handle(
      MEMBER,
      id,
      weekTwo,
      new Date(weekTwo.getTime() + 3_600_000),
    );
    await b.move.handle(
      MEMBER,
      id,
      weekFive,
      new Date(weekFive.getTime() + 3_600_000),
    );
    b.uow.events.length = 0;

    const result = await b.update.handle(MEMBER, id, {
      recurrence: weekly(3, dtstart),
      force: true,
    });

    expect(result.changed).toContain('recurrence');
    const meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.recurrence?.rrule).toBe('FREQ=WEEKLY;COUNT=3');
    // Week two is still inside the new rule and keeps its move; week five is
    // gone. "Discard the orphans" is not "discard the overrides".
    expect(
      meeting?.recurrence?.overrides.map((o) => o.originalStart.getTime()),
    ).toEqual([weekTwo.getTime()]);
    expect(names(b)).toEqual(['meetings.MeetingChanged']);
  });

  it('answers a meeting that is not this member’s as missing', async () => {
    await expect(
      b.update.handle(OTHER, id, { title: 'Not yours' }),
    ).rejects.toThrow(MeetingNotFound);
  });
});

// ---------------------------------------------------- occurrences: skip, move

describe('one occurrence of a series', () => {
  let b: Bench;
  let id: string;
  let dtstart: Date;
  let starts: Date[];

  beforeEach(async () => {
    b = bench();
    dtstart = at(today(CAIRO), '18:00', CAIRO);
    const body = meetingBody({ recurrence: weekly(6, dtstart) });
    id = body.id;
    await b.create.handle(MEMBER, body);
    starts = await originalStarts(b, id);
    b.uow.events.length = 0;
  });

  it('skipping raises OccurrenceSkipped and adds the exdate (FR-005)', async () => {
    const weekThree = starts[2]!;
    await b.skip.handle(MEMBER, id, weekThree);

    expect(names(b)).toEqual(['meetings.OccurrenceSkipped']);
    const meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.recurrence?.exdates.map((d) => d.getTime())).toEqual([
      weekThree.getTime(),
    ]);
    // The series is intact: five of six weeks still expand (SC-001's first half).
    expect(
      meeting?.occurrencesBetween(...windowAround(dtstart), CAIRO),
    ).toHaveLength(5);
  });

  it('moving raises OccurrenceMoved and keeps the rest of the series', async () => {
    const weekFive = starts[4]!;
    const moved = new Date(weekFive.getTime() + 3_600_000);
    await b.move.handle(MEMBER, id, weekFive, moved);

    expect(names(b)).toEqual(['meetings.OccurrenceMoved']);
    const meeting = await b.meetings.findById(MEMBER, id);
    const occurrences = meeting!.occurrencesBetween(
      ...windowAround(dtstart),
      CAIRO,
    );
    expect(occurrences).toHaveLength(6);
    const week = occurrences.find(
      (o) => o.originalStart.getTime() === weekFive.getTime(),
    );
    expect(week?.startAt.getTime()).toBe(moved.getTime());
    expect(week?.moved).toBe(true);
    // Every other occurrence is exactly where the rule put it.
    expect(
      occurrences
        .filter((o) => o.originalStart.getTime() !== weekFive.getTime())
        .every((o) => o.startAt.getTime() === o.originalStart.getTime()),
    ).toBe(true);
  });

  it('moving a skipped occurrence clears its own exdate', async () => {
    // The spec's edge case, read against the model that is stored: skipping a
    // date and then moving it are the member's two ways of dealing with that
    // date, and the second overrides the first. Without this the rule date
    // stays excluded, the override keyed to it is never reached, and the
    // member's drag silently does nothing.
    const weekTwo = starts[1]!;
    await b.skip.handle(MEMBER, id, weekTwo);
    const moved = new Date(weekTwo.getTime() + 2 * 3_600_000);
    await b.move.handle(MEMBER, id, weekTwo, moved);

    const meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.recurrence?.exdates).toEqual([]);
    const occurrences = meeting!.occurrencesBetween(
      ...windowAround(dtstart),
      CAIRO,
    );
    expect(occurrences).toHaveLength(6);
    expect(
      occurrences.find((o) => o.originalStart.getTime() === weekTwo.getTime())
        ?.startAt.getTime(),
    ).toBe(moved.getTime());
  });

  it('refuses to skip or move a meeting that does not repeat', async () => {
    const body = meetingBody();
    await b.create.handle(MEMBER, body);
    const start = body.startAt;

    await expect(b.skip.handle(MEMBER, body.id, start)).rejects.toThrow(
      MeetingRuleError,
    );
    await expect(
      b.move.handle(MEMBER, body.id, start, new Date(start.getTime() + 3_600_000)),
    ).rejects.toThrow(MeetingRuleError);
  });

  /**
   * FR-013, asserted as the API that *is* offered rather than as the absence of
   * a method — an assertion that a method does not exist passes for ever, tells
   * a reader nothing about what to do instead, and would survive somebody
   * adding `completeOccurrence` under another name.
   *
   * So: the outcome verbs act on the meeting and take no date, and the two
   * commands that do take a date leave the outcome alone.
   */
  it('offers skip and move for a date, and complete and cancel for the meeting', async () => {
    await b.skip.handle(MEMBER, id, starts[2]!);
    await b.move.handle(
      MEMBER,
      id,
      starts[3]!,
      new Date(starts[3]!.getTime() + 3_600_000),
    );

    // Neither statement about a date said anything about the outcome.
    let meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.status).toBe('scheduled');

    // The outcome verbs name the meeting and no date at all, and they settle
    // the whole series: a completed series expands to nothing, which is also
    // how its reminders stop.
    await b.complete.handle(MEMBER, id);
    meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.status).toBe('completed');
    expect(meeting?.completedAt).not.toBeNull();
    expect(
      meeting?.occurrencesBetween(...windowAround(dtstart), CAIRO),
    ).toEqual([]);

    await b.cancel.handle(MEMBER, id);
    meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.status).toBe('cancelled');
    expect(meeting?.completedAt).toBeNull();

    expect(names(b)).toEqual([
      'meetings.OccurrenceSkipped',
      'meetings.OccurrenceMoved',
      'meetings.MeetingCompleted',
      'meetings.MeetingCancelled',
    ]);
  });
});

// ------------------------------------------------- delete, restore and purge

describe('deleting a meeting', () => {
  let b: Bench;
  let id: string;
  beforeEach(async () => {
    b = bench();
    const body = meetingBody();
    id = body.id;
    await b.create.handle(MEMBER, body);
    b.uow.events.length = 0;
  });

  it('leaves the status exactly as it was', async () => {
    // This rule has been broken twice in this codebase. The status is the only
    // record of whether the meeting happened, was called off or was simply
    // removed from the diary, and the Deleted view exists to show which.
    await b.cancel.handle(MEMBER, id);
    await b.remove.handle(MEMBER, id);

    const meeting = await b.meetings.findById(MEMBER, id);
    expect(meeting?.isDeleted).toBe(true);
    expect(meeting?.status).toBe('cancelled');

    // And a restore gives back what was there, rather than reopening it.
    await b.restore.handle(MEMBER, id);
    const restored = await b.meetings.findById(MEMBER, id);
    expect(restored?.isDeleted).toBe(false);
    expect(restored?.status).toBe('cancelled');
  });

  it('does not move the deletion time on a retried delete', async () => {
    const first = await b.remove.handle(MEMBER, id);
    const again = await b.remove.handle(MEMBER, id);

    expect(again.updatedAt).toEqual(first.updatedAt);
    // A repeated delete from a retrying client must not keep pushing the purge
    // horizon further out — and must not raise a second MeetingDeleted.
    expect(names(b)).toEqual(['meetings.MeetingDeleted']);
  });

  it('refuses to purge a row that is not a tombstone', async () => {
    const refusal = await b.purge
      .handle(MEMBER, id)
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(MeetingRuleError);
    expect((refusal as MeetingRuleError).code).toBe('not_deleted');
    expect(b.meetings.rows.size).toBe(1);
  });

  it('erases a tombstone the member asks to erase', async () => {
    await b.remove.handle(MEMBER, id);
    await b.purge.handle(MEMBER, id);

    expect(b.meetings.rows.size).toBe(0);
  });

  it('sweeps tombstones past the horizon across both collections', async () => {
    const eventId = newId();
    const start = at(today(CAIRO), '09:00', CAIRO);
    await b.createEvent.handle(MEMBER, {
      id: eventId,
      title: 'Holiday',
      startAt: start,
      endAt: new Date(start.getTime() + 3_600_000),
    });

    await b.remove.handle(MEMBER, id);
    await b.removeEvent.handle(MEMBER, eventId);

    /*
     * The horizon moves rather than the rows. Back-dating a `tombstone()` would
     * write an `updatedAt` older than the row already carries, which the
     * optimistic filter correctly refuses — so a fixture that "deleted it forty
     * days ago" would be testing the stale-write guard instead of the sweep.
     * Asking about a horizon just after now is the same question from the other
     * side, and it is the question the nightly pass actually asks.
     */
    const purged = await b.purge.purgeTombstones(new Date(Date.now() + DAY_MS));
    expect(purged).toBe(2);
    expect(b.meetings.rows.size).toBe(0);
    expect(b.events.rows.size).toBe(0);
  });
});

// ------------------------------------------------------------ personal events

describe('a personal event', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  function eventBody(
    overrides: Partial<CreateCalendarEventCommand> = {},
  ): CreateCalendarEventCommand {
    const start = at(today(CAIRO), '09:00', CAIRO);
    return {
      id: newId(),
      title: 'Focus time',
      startAt: start,
      endAt: new Date(start.getTime() + 2 * 3_600_000),
      ...overrides,
    };
  }

  it('refuses an endAt before its startAt', async () => {
    const start = at(today(CAIRO), '09:00', CAIRO);
    await expect(
      b.createEvent.handle(
        MEMBER,
        eventBody({ startAt: start, endAt: new Date(start.getTime() - 60_000) }),
      ),
    ).rejects.toThrow(CalendarEventRuleError);

    expect(b.events.rows.size).toBe(0);
  });

  it('refuses a zero-length window as well', async () => {
    // The expander derives an occurrence's window from the length, so an event
    // of no length is a row that can never be drawn.
    const start = at(today(CAIRO), '09:00', CAIRO);
    await expect(
      b.createEvent.handle(MEMBER, eventBody({ startAt: start, endAt: start })),
    ).rejects.toThrow(CalendarEventRuleError);
  });

  it('raises nothing, by design, and still writes the row', async () => {
    // `CalendarEvent.edit` says why: nothing subscribes, so an event raised
    // here would have no consumer. The row reaches the phone through /sync.
    const body = eventBody();
    await b.createEvent.handle(MEMBER, body);
    await b.updateEvent.handle(MEMBER, body.id, { title: 'Deep work' });

    expect(names(b)).toEqual([]);
    const event = await b.events.findById(MEMBER, body.id);
    expect(event?.title).toBe('Deep work');
  });

  it('is idempotent on the client-minted id', async () => {
    const body = eventBody();
    await b.createEvent.handle(MEMBER, body);
    const replay = await b.createEvent.handle(MEMBER, body);

    expect(replay.replayed).toBe(true);
    expect(b.events.rows.size).toBe(1);
  });

  it('skips and moves one occurrence exactly as a meeting does (FR-011)', async () => {
    const dtstart = at(today(CAIRO), '09:00', CAIRO);
    const body = eventBody({
      recurrence: weekly(4, dtstart),
    });
    await b.createEvent.handle(MEMBER, body);

    let event = await b.events.findById(MEMBER, body.id);
    const starts = event!
      .occurrencesBetween(...windowAround(dtstart), CAIRO)
      .map((occurrence) => occurrence.originalStart);
    expect(starts).toHaveLength(4);

    const weekTwo = starts[1]!;
    await b.skipEvent.handle(MEMBER, body.id, weekTwo);
    event = await b.events.findById(MEMBER, body.id);
    expect(
      event?.occurrencesBetween(...windowAround(dtstart), CAIRO),
    ).toHaveLength(3);

    // And the same edge case: moving the skipped date clears the skip.
    const moved = new Date(weekTwo.getTime() + 3_600_000);
    await b.moveEvent.handle(MEMBER, body.id, weekTwo, moved);
    event = await b.events.findById(MEMBER, body.id);
    expect(event?.recurrence?.exdates).toEqual([]);
    const occurrences = event!.occurrencesBetween(
      ...windowAround(dtstart),
      CAIRO,
    );
    expect(occurrences).toHaveLength(4);
    expect(
      occurrences.find((o) => o.originalStart.getTime() === weekTwo.getTime())
        ?.startAt.getTime(),
    ).toBe(moved.getTime());
  });

  it('deletes to a tombstone, restores, and refuses a purge of a live row', async () => {
    const body = eventBody();
    await b.createEvent.handle(MEMBER, body);

    await expect(b.purgeEvent.handle(MEMBER, body.id)).rejects.toThrow(
      CalendarEventRuleError,
    );

    await b.removeEvent.handle(MEMBER, body.id);
    expect((await b.events.findById(MEMBER, body.id))?.isDeleted).toBe(true);

    await b.restoreEvent.handle(MEMBER, body.id);
    expect((await b.events.findById(MEMBER, body.id))?.isDeleted).toBe(false);

    await b.removeEvent.handle(MEMBER, body.id);
    await b.purgeEvent.handle(MEMBER, body.id);
    expect(b.events.rows.size).toBe(0);
  });
});

// --------------------------------------------------------- a deleted account

describe('purging a deleted member', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('removes both collections and leaves another member alone', async () => {
    await b.create.handle(MEMBER, meetingBody());
    await b.create.handle(OTHER, meetingBody());
    const start = at(today(CAIRO), '09:00', CAIRO);
    await b.createEvent.handle(MEMBER, {
      id: newId(),
      title: 'Birthday',
      startAt: start,
      endAt: new Date(start.getTime() + 3_600_000),
    });

    const verdict = await b.purgeOnDeleted.handle(userDeleted(MEMBER));

    expect(verdict).toBe('purged');
    expect(b.meetings.rows.size).toBe(1);
    expect([...b.meetings.rows.values()][0]?.userId).toBe(OTHER);
    expect(b.events.rows.size).toBe(0);
  });

  it('is idempotent, because the relay delivers at least once', async () => {
    await b.create.handle(MEMBER, meetingBody());
    expect(await b.purgeOnDeleted.handle(userDeleted(MEMBER))).toBe('purged');
    expect(await b.purgeOnDeleted.handle(userDeleted(MEMBER))).toBe(
      'nothing-to-do',
    );
  });

  it('does nothing for an event that carries no userId', async () => {
    const anonymous = { ...userDeleted(MEMBER), userId: null };
    expect(await b.purgeOnDeleted.handle(anonymous)).toBe('nothing-to-do');
  });
});
