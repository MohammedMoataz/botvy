import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { Meeting } from './domain/meeting.aggregate.js';
import { CalendarEvent } from './domain/calendar-event.aggregate.js';
import {
  InMemoryCalendarEventRepository,
  InMemoryMeetingRepository,
} from './infrastructure/in-memory-meetings.repositories.js';

/**
 * What `forWindow` has to return, and why it cannot be a range query.
 *
 * This is the read the whole context goes through — the agenda, the month
 * overview and the alert reconciliation all start here — and it has a shape
 * that looks wrong until you see what it is for. A recurring series cannot be
 * found by its `startAt`: "every Monday since March" has a start date months
 * behind any window a member is looking at, and its occurrences are computed
 * rather than stored (FR-006). So the query is "every series, plus the one-offs
 * that could touch this window", and the expander decides the rest.
 *
 * Two halves, and each has a way of being silently wrong:
 *
 *  - **The series half.** Filtering on `startAt` at all would drop every
 *    established series, so a member's standing meetings would simply vanish
 *    from next month's calendar. Nothing would fail; the month would just look
 *    empty.
 *  - **The one-off half's lower bound.** A meeting from 09:30 to 10:30 belongs
 *    on an agenda for 10:00 onwards, and its `startAt` is *before* the window.
 *    The adapters carry a day of slack on the lower bound for exactly this, and
 *    a comment claiming slack is not slack until something reads it back.
 *
 * The two adapters are held to one behaviour by `adapters.contract.spec.ts` for
 * everything generic; this file is the part of the contract that is Meetings'
 * own. It runs against the in-memory adapter, so it pins the *intent* — the
 * Mongo filter is exercised by `infra/verify-p5.mjs` against a real store.
 */

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';
const DAY_MS = 86_400_000;

function at(hhmm: string, dayOffset = 0): Date {
  const base = new Date(Date.now() + dayOffset * DAY_MS);
  const instant = wallClockToUtc(`${localDate(base, CAIRO)}T${hhmm}`, CAIRO);
  if (!instant) throw new Error(`cannot resolve ${hhmm} + ${dayOffset}d`);
  return instant;
}

function meeting(
  id: string,
  overrides: Partial<Parameters<typeof Meeting.schedule>[0]> = {},
): Meeting {
  return Meeting.schedule({
    id,
    userId: MEMBER,
    title: id,
    description: null,
    startAt: at('10:00'),
    durationMin: 30,
    lockTimezone: null,
    location: { onlineLink: null, address: 'Room 1' },
    prepNotes: null,
    prepMinutes: 0,
    reminderOffsets: [],
    recurrence: null,
    source: 'app',
    createdAt: new Date(),
    timezone: CAIRO,
    ...overrides,
  });
}

describe('MeetingRepository.forWindow', () => {
  let uow: InMemoryUnitOfWork;
  let meetings: InMemoryMeetingRepository;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    meetings = new InMemoryMeetingRepository(uow);
  });

  async function save(subject: Meeting): Promise<void> {
    await uow.run(() => meetings.save(subject));
  }

  it('returns a series whose start is long behind the window', async () => {
    // The half that would silently empty a member's calendar.
    const dtstart = at('18:00', -120);
    await save(
      meeting('standing', {
        startAt: dtstart,
        recurrence: {
          dtstart,
          rrule: 'FREQ=WEEKLY',
          exdates: [],
          overrides: [],
        },
      }),
    );

    const found = await meetings.forWindow(
      MEMBER,
      at('00:00', 30),
      at('00:00', 60),
    );
    expect(found.map((row) => row.id)).toEqual(['standing']);
  });

  it('returns a one-off already under way when the window opens', async () => {
    // 09:30 to 11:00, asked about from 10:00. The one-day slack on the lower
    // bound is what loads it; without it the member reads as free during a
    // meeting they are sitting in.
    await save(
      meeting('running', { startAt: at('09:30'), durationMin: 90 }),
    );

    const found = await meetings.forWindow(MEMBER, at('10:00'), at('12:00'));
    expect(found.map((row) => row.id)).toEqual(['running']);
  });

  it('leaves out a one-off that is nowhere near the window', async () => {
    // The other direction: the slack is a day, not a licence to load
    // everything. A member with three years of past meetings should not pay for
    // them on every month view.
    await save(meeting('ancient', { startAt: at('10:00', -400) }));
    await save(meeting('distant', { startAt: at('10:00', 400) }));

    const found = await meetings.forWindow(MEMBER, at('00:00'), at('00:00', 7));
    expect(found).toEqual([]);
  });

  it('leaves out what cannot produce an occurrence anyway', async () => {
    /*
     * Completed, cancelled and deleted meetings expand to nothing —
     * `Meeting.occurrencesBetween` refuses them — so filtering here is not a
     * second rule, it is keeping the expansion off rows that can only answer
     * "none". The reason it matters is cost: a member with a year of completed
     * standing meetings would otherwise have every one of them parsed and
     * expanded on every calendar read, to produce nothing.
     */
    const completed = meeting('completed');
    completed.complete();
    await save(completed);

    const cancelled = meeting('cancelled');
    cancelled.cancel();
    await save(cancelled);

    const deleted = meeting('deleted');
    deleted.tombstone();
    await save(deleted);

    await save(meeting('live'));

    const found = await meetings.forWindow(MEMBER, at('00:00'), at('00:00', 1));
    expect(found.map((row) => row.id)).toEqual(['live']);
  });

  it('never returns another member’s row', async () => {
    const theirs = meeting('theirs');
    // Written directly with the other member's id, because the point is that
    // the *filter* scopes and not the caller.
    await uow.run(() =>
      meetings.save(
        Meeting.schedule({
          id: 'theirs',
          userId: OTHER,
          title: theirs.title,
          description: null,
          startAt: at('10:00'),
          durationMin: 30,
          lockTimezone: null,
          location: { onlineLink: null, address: 'Room 1' },
          prepNotes: null,
          prepMinutes: 0,
          reminderOffsets: [],
          recurrence: null,
          source: 'app',
          createdAt: new Date(),
          timezone: CAIRO,
        }),
      ),
    );

    const found = await meetings.forWindow(MEMBER, at('00:00'), at('00:00', 1));
    expect(found).toEqual([]);
  });

  it('pullSince includes tombstones, because that is how a delete travels', async () => {
    const deleted = meeting('deleted');
    deleted.tombstone();
    await save(deleted);

    const rows = await meetings.pullSince(MEMBER, null);
    expect(rows.map((row) => row.id)).toEqual(['deleted']);
    expect(rows[0]!.isDeleted).toBe(true);
  });
});

describe('CalendarEventRepository.forWindow', () => {
  it('applies the same two rules to personal events', async () => {
    const uow = new InMemoryUnitOfWork();
    const events = new InMemoryCalendarEventRepository(uow);

    const dtstart = at('09:00', -400);
    const birthday = CalendarEvent.create({
      id: 'birthday',
      userId: MEMBER,
      title: 'Birthday',
      notes: null,
      startAt: dtstart,
      endAt: new Date(dtstart.getTime() + DAY_MS),
      allDay: true,
      color: null,
      recurrence: {
        dtstart,
        rrule: 'FREQ=YEARLY',
        exdates: [],
        overrides: [],
      },
      createdAt: new Date(),
      timezone: CAIRO,
    });

    const overnight = CalendarEvent.create({
      id: 'overnight',
      userId: MEMBER,
      title: 'Focus block',
      notes: null,
      startAt: at('22:00', -1),
      endAt: at('02:00'),
      allDay: false,
      color: null,
      recurrence: null,
      createdAt: new Date(),
      timezone: CAIRO,
    });

    await uow.run(async () => {
      await events.save(birthday);
      await events.save(overnight);
    });

    const found = await events.forWindow(MEMBER, at('00:00'), at('00:00', 1));
    expect(found.map((row) => row.id).sort()).toEqual([
      'birthday',
      'overnight',
    ]);
  });
});
