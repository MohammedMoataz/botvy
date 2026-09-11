import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { CalendarEvent } from './domain/calendar-event.aggregate.js';
import { Meeting } from './domain/meeting.aggregate.js';
import {
  TimedTasksPort,
  TrainingSessionsPort,
  type AgendaSession,
  type AgendaTask,
} from './domain/meetings.ports.js';
import type { MeetingRecurrence } from './domain/recurrence-expander.js';
import {
  InMemoryCalendarEventRepository,
  InMemoryMeetingRepository,
} from './infrastructure/in-memory-meetings.repositories.js';
import { AgendaQueryHandler } from './features/agenda/agenda.query.js';
import { MeetingOccurrencesQueryHandler } from './features/meeting-occurrences/meeting-occurrences.query.js';
import { MonthOverviewQueryHandler } from './features/month-overview/month-overview.query.js';

/**
 * The read side of Meetings: the agenda merge, the month grid, and the
 * occurrence port two other contexts read this collection through.
 *
 * `meetings-recurrence.spec.ts` holds the expansion table — where an
 * occurrence falls, and what a skip, a move and a clock change do to it. This
 * file assumes that works and tests the layer above: which day a row is
 * grouped into, which kind it is labelled with, what order the day comes back
 * in, and whether the two readers of one expansion agree.
 *
 * ## Every date is computed from the clock, never written down
 *
 * `Date.now()` is the anchor for all of it. A fixture pinned to a real date is
 * a time bomb: it passes until the day the clock reaches it, and the cases
 * most likely to rot are exactly the interesting ones. The helpers are copied
 * from the recurrence spec rather than imported from it — a spec importing
 * another spec is two suites that fail together for one reason, and these are
 * six lines each.
 */

const CAIRO = 'Africa/Cairo';
/** Behind UTC. The zone that makes the grouping test discriminating; see below. */
const NEW_YORK = 'America/New_York';

// ------------------------------------------------------------- clock helpers

/** The instant a wall clock names in a zone, on a given local date. */
function at(date: string, hhmm: string, zone: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

function today(zone: string): string {
  return localDate(new Date(), zone);
}

function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const moved = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days),
  );
  return moved.toISOString().slice(0, 10);
}

/** `MO`, `TU`, … for a local date, which is what an RRULE's `BYDAY` wants. */
function byDayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][weekday]!;
}

// -------------------------------------------------------------- the test rig

/** The member's zone, and nothing else this suite needs from Profile. */
class FakeMemberContext extends MemberContextPort {
  constructor(public timezone: string) {
    super();
  }

  async clock(): Promise<MemberClock> {
    return { timezone: this.timezone };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: ['1h', '0m'], quietHours: { from: '22:00', to: '07:00' } };
  }
}

/** Planning's `timedBetween`, as a list the test sets. */
class FakeTimedTasks extends TimedTasksPort {
  rows: AgendaTask[] = [];

  async between(_userId: string, from: Date, to: Date): Promise<AgendaTask[]> {
    return this.rows.filter(
      (task) =>
        task.dueAt.getTime() >= from.getTime() &&
        task.dueAt.getTime() <= to.getTime(),
    );
  }
}

/** Training's, for the one case that needs a session on the day. */
class FakeTrainingSessions extends TrainingSessionsPort {
  rows: AgendaSession[] = [];

  async between(
    _userId: string,
    from: Date,
    to: Date,
  ): Promise<AgendaSession[]> {
    return this.rows.filter(
      (session) =>
        session.startAt.getTime() >= from.getTime() &&
        session.startAt.getTime() <= to.getTime(),
    );
  }
}

/**
 * The binding `meetings.module.ts` must register until P6 exists.
 *
 * Written out here rather than assumed, because the whole point of an
 * empty-list stub is that it is *not* a thrower: a `TrainingSessionsPort` bound
 * to something that raises "not implemented yet" would take the entire agenda
 * down — every kind of item on the day, for a context that has not been built.
 * The test below binds this class so the shape the module needs is stated in a
 * place that fails if somebody changes it.
 */
class StubbedTrainingSessions extends TrainingSessionsPort {
  async between(): Promise<AgendaSession[]> {
    return [];
  }
}

const USER = 'u-1';

interface Rig {
  uow: InMemoryUnitOfWork;
  meetings: InMemoryMeetingRepository;
  events: InMemoryCalendarEventRepository;
  member: FakeMemberContext;
  tasks: FakeTimedTasks;
  sessions: TrainingSessionsPort;
  occurrences: MeetingOccurrencesQueryHandler;
  agenda: AgendaQueryHandler;
  month: MonthOverviewQueryHandler;
}

/**
 * Wired the way `meetings.module.ts` wires it, by hand.
 *
 * Note that `AgendaQueryHandler` is handed the *occurrence handler* and not the
 * meeting repository. That is the composition under test in the last case of
 * this file: the calendar and the alert saga read one method, so they cannot
 * disagree about where an occurrence is.
 */
function rig(timezone = CAIRO, sessions: TrainingSessionsPort = new FakeTrainingSessions()): Rig {
  const uow = new InMemoryUnitOfWork();
  const meetings = new InMemoryMeetingRepository(uow);
  const events = new InMemoryCalendarEventRepository(uow);
  const member = new FakeMemberContext(timezone);
  const tasks = new FakeTimedTasks();
  const occurrences = new MeetingOccurrencesQueryHandler(meetings, member);
  const agenda = new AgendaQueryHandler(
    occurrences,
    tasks,
    sessions,
    events,
    meetings,
    member,
  );
  const month = new MonthOverviewQueryHandler(agenda, member);
  return {
    uow,
    meetings,
    events,
    member,
    tasks,
    sessions,
    occurrences,
    agenda,
    month,
  };
}

// ---------------------------------------------------------------- fixtures

/**
 * A meeting, saved. Inside `uow.run` because `schedule` raises
 * `MeetingScheduled` and the in-memory unit of work refuses an event raised
 * outside a transaction — the row and its outbox entry commit together or the
 * outbox is at-most-once wearing a name.
 */
async function scheduleMeeting(
  target: Rig,
  overrides: Partial<Parameters<typeof Meeting.schedule>[0]> & {
    startAt: Date;
  },
): Promise<Meeting> {
  const meeting = Meeting.schedule({
    id: 'm-1',
    userId: USER,
    title: 'Standup',
    description: null,
    durationMin: 30,
    lockTimezone: null,
    location: { onlineLink: 'https://meet.example/abc', address: null },
    prepNotes: null,
    prepMinutes: 0,
    reminderOffsets: [1440, 30],
    recurrence: null,
    source: 'app',
    createdAt: new Date(),
    timezone: target.member.timezone,
    ...overrides,
  });
  await target.uow.run(async () => target.meetings.save(meeting));
  return meeting;
}

async function createEvent(
  target: Rig,
  overrides: Partial<Parameters<typeof CalendarEvent.create>[0]> & {
    startAt: Date;
    endAt: Date;
  },
): Promise<CalendarEvent> {
  const event = CalendarEvent.create({
    id: 'e-1',
    userId: USER,
    title: 'Dentist',
    notes: null,
    allDay: false,
    color: '#3b82f6',
    recurrence: null,
    createdAt: new Date(),
    timezone: target.member.timezone,
    ...overrides,
  });
  await target.uow.run(async () => target.events.save(event));
  return event;
}

function rule(
  rrule: string,
  dtstart: Date,
  extras: Partial<MeetingRecurrence> = {},
): MeetingRecurrence {
  return { dtstart, rrule, exdates: [], overrides: [], ...extras };
}

// ------------------------------------------------------------------- the day

describe('the agenda for one day', () => {
  let app: Rig;
  let date: string;

  beforeEach(() => {
    app = rig();
    date = today(CAIRO);
  });

  it('orders a meeting, two timed tasks, a session and an event by instant and labels each with its kind', async () => {
    /*
     * The spec's story 3 scenario 1, plus a personal event: the one screen in
     * the product that is genuinely cross-context, and the case that would
     * pass vacuously if the merge quietly dropped a source. Every kind is
     * present exactly once except tasks, of which there are two, so an
     * implementation that de-duplicated by kind would fail here.
     */
    await scheduleMeeting(app, { startAt: at(date, '09:00', CAIRO) });
    app.tasks.rows = [
      {
        id: 't-1',
        title: 'Send the invoice',
        dueAt: at(date, '11:00', CAIRO),
        priority: 2,
        color: '#f59e0b',
      },
      {
        id: 't-2',
        title: 'Call the dentist',
        dueAt: at(date, '15:00', CAIRO),
        priority: 1,
        color: null,
      },
    ];
    (app.sessions as FakeTrainingSessions).rows = [
      {
        id: 's-1',
        title: 'Intervals',
        sport: 'running',
        startAt: at(date, '07:00', CAIRO),
        durationMin: 45,
      },
    ];
    await createEvent(app, {
      startAt: at(date, '13:00', CAIRO),
      endAt: at(date, '14:00', CAIRO),
      title: 'Focus block',
    });

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    expect(days).toHaveLength(1);
    expect(days[0]!.date).toBe(date);
    expect(days[0]!.items.map((item) => [item.kind, item.id])).toEqual([
      ['session', 's-1'],
      ['meeting', 'm-1'],
      ['task', 't-1'],
      ['event', 'e-1'],
      ['task', 't-2'],
    ]);
    // The label colour rides along, so the agenda tints the row as the list does.
    expect(days[0]!.items[2]!.color).toBe('#f59e0b');
    // A task has a moment and no length; everything else has an end.
    expect(days[0]!.items[2]!.endAt).toBeNull();
    expect(days[0]!.items[1]!.endAt).toEqual(at(date, '09:30', CAIRO));
  });

  it('carries its object on the two kinds this context owns and on no others', async () => {
    /*
     * The asymmetry, asserted rather than left to a comment. A meeting row and
     * an event row hand over the thing the member would open; a task row and a
     * session row cannot, because declaring Planning's or Training's type here
     * is what constitution IX refuses — so they carry `(kind, id)` and the
     * client asks the context that owns them.
     *
     * If somebody later "completes" the shape by adding a local lookalike for
     * a task, this is the test that should have to be changed on purpose.
     */
    await scheduleMeeting(app, { startAt: at(date, '09:00', CAIRO) });
    app.tasks.rows = [
      {
        id: 't-1',
        title: 'Send the invoice',
        dueAt: at(date, '11:00', CAIRO),
        priority: 2,
        color: null,
      },
    ];
    (app.sessions as FakeTrainingSessions).rows = [
      {
        id: 's-1',
        title: 'Intervals',
        sport: 'running',
        startAt: at(date, '07:00', CAIRO),
        durationMin: 45,
      },
    ];
    await createEvent(app, {
      startAt: at(date, '13:00', CAIRO),
      endAt: at(date, '14:00', CAIRO),
    });

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );
    const byKind = new Map(days[0]!.items.map((item) => [item.kind, item]));

    expect(byKind.get('meeting')!.meeting?.id).toBe('m-1');
    expect(byKind.get('meeting')!.event).toBeNull();
    expect(byKind.get('event')!.event?.id).toBe('e-1');
    expect(byKind.get('event')!.meeting).toBeNull();
    for (const kind of ['task', 'session'] as const) {
      expect(byKind.get(kind)!.meeting).toBeNull();
      expect(byKind.get(kind)!.event).toBeNull();
    }
  });

  it('contributes a prep block immediately before a meeting with preparation time', async () => {
    // FR-002, story 1 scenario 3. Two rows from one meeting, and the prep row
    // ends exactly where the meeting starts — a gap or an overlap between them
    // would draw a hole in the member's day that is not there.
    await scheduleMeeting(app, {
      startAt: at(date, '09:00', CAIRO),
      prepMinutes: 15,
      title: 'Board review',
    });

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    const items = days[0]!.items;
    expect(items.map((item) => item.kind)).toEqual(['prep', 'meeting']);
    expect(items[0]!.occurrenceAt).toEqual(at(date, '08:45', CAIRO));
    expect(items[0]!.endAt).toEqual(at(date, '09:00', CAIRO));
    expect(items[0]!.title).toBe('Prepare: Board review');
    // The prep row carries the meeting's own id *and* its object, so tapping
    // it opens the meeting it is preparation for. Identity of a row is
    // (kind, id, occurrenceAt), not id alone.
    expect(items[0]!.id).toBe('m-1');
    expect(items[0]!.meeting?.id).toBe('m-1');
    expect(items[0]!.meeting).toEqual(items[1]!.meeting);
    expect(items[1]!.occurrenceAt).toEqual(at(date, '09:00', CAIRO));
  });

  it('adds no prep block when preparation is zero', async () => {
    await scheduleMeeting(app, {
      startAt: at(date, '09:00', CAIRO),
      prepMinutes: 0,
    });

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    expect(days[0]!.items.map((item) => item.kind)).toEqual(['meeting']);
  });

  it('shows an all-day personal event on its day, marked so the client can lift it off the hour grid', async () => {
    // FR-011 scenario 1. It is grouped into the day like everything else — a
    // member looking at Tuesday wants to know Tuesday is a holiday — and
    // flagged, because it has no place on an hour grid.
    await createEvent(app, {
      startAt: at(date, '00:00', CAIRO),
      endAt: at(addLocalDays(date, 1), '00:00', CAIRO),
      allDay: true,
      title: 'Public holiday',
    });

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    expect(days[0]!.date).toBe(date);
    expect(days[0]!.items).toHaveLength(1);
    expect(days[0]!.items[0]!.kind).toBe('event');
    expect(days[0]!.items[0]!.allDay).toBe(true);
  });
});

describe('training on the agenda (T641)', () => {
  it('puts the session on the day beside the meeting, in time order', async () => {
    /*
     * What the stub could not say. `TrainingSessionsPort` was bound to an
     * empty-list placeholder from P5 to P6, so the case that stood here
     * asserted only that the port *did not throw* — which was the right thing
     * to assert about a context nobody had built, and says nothing about the
     * requirement.
     *
     * FR-011 is the requirement, and it is a claim about this composition
     * rather than about either side of it: the agenda already knew the
     * `session` kind and the day view already ordered by time, so the only
     * thing that was missing was rows. This is the case that fails if the
     * binding is ever pointed back at a constant.
     */
    const app = rig();
    const date = today(CAIRO);
    await scheduleMeeting(app, { startAt: at(date, '09:00', CAIRO) });
    (app.sessions as FakeTrainingSessions).rows = [
      {
        id: 'session-1',
        title: 'Upper body',
        sport: 'gym',
        startAt: at(date, '18:00', CAIRO),
        durationMin: 60,
      },
    ];

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    expect(days[0]!.items.map((item) => item.kind)).toEqual([
      'meeting',
      'session',
    ]);
    expect(days[0]!.items[1]!.title).toBe('Upper body');
  });

  it('contributes nothing on a day with no session, and the rest of it still renders', async () => {
    /*
     * The half of the old case that still means something, and it means two
     * things now.
     *
     * A day with no training is the ordinary case — a rest day is stored as
     * nothing at all — so the agenda has to render a meeting-only day without
     * an empty training row on it. And the failure mode the original case was
     * written against survives the binding: a port bound to something that
     * *throws* would take the entire agenda down, no meeting, no task, no
     * event. `StubbedTrainingSessions` is still written out so the shape the
     * module needs stays stated somewhere that fails if it changes.
     */
    const app = rig(CAIRO, new StubbedTrainingSessions());
    const date = today(CAIRO);
    await scheduleMeeting(app, { startAt: at(date, '09:00', CAIRO) });

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    expect(days[0]!.items.map((item) => item.kind)).toEqual(['meeting']);
    expect(
      days[0]!.items.some((item) => item.kind === 'session'),
    ).toBe(false);
  });

  it('leaves out a session that falls outside the window asked about', async () => {
    // The range is the port's contract and the agenda trusts it, so the fake
    // filters the way the real query does. A day view that showed next week's
    // session would be an adapter passing the window through unread.
    const app = rig();
    const date = today(CAIRO);
    (app.sessions as FakeTrainingSessions).rows = [
      {
        id: 'session-2',
        title: 'Long ride',
        sport: 'cycling',
        startAt: at(addLocalDays(date, 3), '06:00', CAIRO),
        durationMin: 120,
      },
    ];

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    expect(days.flatMap((day) => day.items)).toEqual([]);
  });
});

// ----------------------------------------------------------------- the month

describe('the month grid', () => {
  it('marks a day busy on one item of any single kind and leaves an empty day unmarked', async () => {
    /*
     * FR-009, at its boundary: **one** item, of one kind, and the day is busy.
     * The threshold is the requirement rather than a tuneable, so this is the
     * case that fails if somebody later decides two items make a day busy — at
     * which point a member taps an unmarked day and finds a meeting on it.
     */
    const app = rig();
    const month = today(CAIRO).slice(0, 7);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    // The 10th and the 11th, which every month has — no month-end arithmetic
    // and so nothing to rot on the 31st.
    const busyDate = `${month}-10`;
    const emptyDate = `${month}-11`;

    await scheduleMeeting(app, { startAt: at(busyDate, '09:00', CAIRO) });

    const grid = await app.month.forMonth(USER, year, monthNumber);

    // A row per day, empty ones included: a grid has to know the 11th is empty
    // in order to leave it unmarked.
    expect(grid).toHaveLength(
      new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(),
    );

    const busy = grid.find((day) => day.date === busyDate)!;
    expect(busy.busy).toBe(true);
    expect(busy.total).toBe(1);
    expect(busy.byKind).toEqual({
      meeting: 1,
      prep: 0,
      task: 0,
      session: 0,
      event: 0,
    });

    const empty = grid.find((day) => day.date === emptyDate)!;
    expect(empty.busy).toBe(false);
    expect(empty.total).toBe(0);
  });

  it('counts a preparation block as an item of its own', async () => {
    // Two rows from one meeting, because a preparation block is time the
    // member is not free. The month marker and the day view agree by
    // construction — the grid counts what the agenda returns.
    const app = rig();
    const month = today(CAIRO).slice(0, 7);
    await scheduleMeeting(app, {
      startAt: at(`${month}-10`, '09:00', CAIRO),
      prepMinutes: 15,
    });

    const grid = await app.month.forMonth(
      USER,
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
    );

    const day = grid.find((row) => row.date === `${month}-10`)!;
    expect(day.total).toBe(2);
    expect(day.byKind.meeting).toBe(1);
    expect(day.byKind.prep).toBe(1);
  });
});

// ------------------------------------------------------ one expansion, two readers

describe('the occurrence port and the agenda', () => {
  it('expand exactly the same occurrences for the same window', async () => {
    /*
     * The alert saga and the calendar must never disagree about where an
     * occurrence is: a member whose alarm goes off at 10:00 for a meeting the
     * calendar shows at 11:00 has no way to tell which one is lying, and both
     * come from the same rule.
     *
     * So this asserts the two agree — with the series bent both ways first,
     * because a skip and a move are exactly where two independent expansions
     * would drift apart.
     */
    const app = rig();
    const date = today(CAIRO);
    const first = at(date, '09:00', CAIRO);
    const meeting = await scheduleMeeting(app, {
      startAt: first,
      recurrence: rule(
        `FREQ=WEEKLY;BYDAY=${byDayOf(date)};COUNT=4`,
        first,
      ),
    });

    const week = 7 * 86_400_000;
    await app.uow.run(async () => {
      meeting.skipOccurrence(new Date(first.getTime() + week));
      meeting.moveOccurrence(
        new Date(first.getTime() + 2 * week),
        new Date(first.getTime() + 2 * week + 3_600_000),
      );
      await app.meetings.save(meeting);
    });

    const from = at(date, '00:00', CAIRO);
    const to = at(addLocalDays(date, 28), '00:00', CAIRO);

    const occurrences = await app.occurrences.forMember(USER, from, to);
    const days = await app.agenda.between(USER, from, to);
    const fromAgenda = days
      .flatMap((day) => day.items)
      .filter((item) => item.kind === 'meeting');

    // Four in the rule, one skipped: three left, one of them an hour later.
    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((occurrence) => occurrence.moved)).toEqual([
      false,
      true,
      false,
    ]);
    expect(
      fromAgenda.map((item) => [item.id, item.occurrenceAt, item.endAt]),
    ).toEqual(
      occurrences.map((occurrence) => [
        occurrence.meetingId,
        occurrence.startAt,
        occurrence.endAt,
      ]),
    );
  });

  it('answers one local day through onDate, resolved in the member’s zone', async () => {
    // P3's two callers: the evening proposal asks for tomorrow's date, the
    // morning briefing for today's. Neither should have to know what instants
    // that day's midnights name.
    const app = rig();
    const date = today(CAIRO);
    const tomorrow = addLocalDays(date, 1);
    await scheduleMeeting(app, { startAt: at(tomorrow, '10:00', CAIRO) });

    expect(await app.occurrences.onDate(USER, date)).toEqual([]);
    const found = await app.occurrences.onDate(USER, tomorrow);
    expect(found).toHaveLength(1);
    expect(found[0]!.startAt).toEqual(at(tomorrow, '10:00', CAIRO));
    // The scheduling facts the saga reconciles from, which the agenda does not
    // carry: an alert per offset, plus one for the preparation block.
    expect(found[0]!.reminderOffsets).toEqual([1440, 30]);
    expect(found[0]!.originalStart).toEqual(found[0]!.startAt);
  });
});

// ------------------------------------------------------- whose day is it, anyway

describe('grouping', () => {
  it('puts a 23:30 meeting on the member’s local day', async () => {
    const app = rig();
    const date = today(CAIRO);
    await scheduleMeeting(app, { startAt: at(date, '23:30', CAIRO) });

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', CAIRO),
      at(addLocalDays(date, 1), '00:00', CAIRO),
    );

    expect(days.map((day) => day.date)).toEqual([date]);
  });

  it('puts a late meeting on the member’s day even when UTC has already rolled over', async () => {
    /*
     * The case above is the one the spec asks for and it is **not** the one
     * that catches the bug: Cairo is ahead of UTC, so 23:30 there is 21:30 UTC
     * on the same date, and a grouping computed against the server's clock
     * would pass it. This one is the discriminating half — New York is behind
     * UTC, so 23:30 local is already tomorrow in UTC, and a `date` built from
     * `toISOString().slice(0, 10)` puts the member's Tuesday night meeting on
     * Wednesday.
     *
     * Constitution XI, and the v1 bug it was written after: resolving a
     * user-facing time against the server's own clock once shifted every
     * extracted reminder by three hours.
     */
    const app = rig(NEW_YORK);
    const date = today(NEW_YORK);
    const startAt = at(date, '23:30', NEW_YORK);
    await scheduleMeeting(app, { startAt });

    // The premise: UTC really has moved on. If this ever stops holding, the
    // assertion below has stopped testing anything.
    expect(startAt.toISOString().slice(0, 10)).not.toBe(date);

    const days = await app.agenda.between(
      USER,
      at(date, '00:00', NEW_YORK),
      at(addLocalDays(date, 1), '00:00', NEW_YORK),
    );

    expect(days.map((day) => day.date)).toEqual([date]);
    expect(days[0]!.items[0]!.occurrenceAt).toEqual(startAt);
  });
});
