import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { CalendarEvent } from './domain/calendar-event.aggregate.js';
import { Meeting } from './domain/meeting.aggregate.js';
import type { MeetingRecurrence } from './domain/recurrence-expander.js';

/**
 * What this context's events actually carry.
 *
 * ## Why the payload is asserted rather than the consumer's behaviour
 *
 * Because asserting the consumer passes with the fallback in place, and that is
 * exactly how P2 shipped three defects that were all one defect. Its
 * `TaskScheduled` and `TaskRescheduled` payloads omitted `title`, and the alert
 * saga reads `payload.title ?? 'Task due'` — so **every task notification in
 * the product said "Task due"** rather than naming the task. Nothing failed.
 * Thirty-eight tests passed. `TaskRescheduled` also omitted `allDay`, and
 * `undefined === false` is false, so every edit silently dropped the member's
 * lead times.
 *
 * A payload crosses the boundary as `unknown`, so the type system cannot say a
 * field is missing. Only a spec that reads the payload can, and it has to read
 * the payload rather than the reaction.
 *
 * ## And why the field list is written out here rather than derived
 *
 * A test that compared the payload to `meeting.alertFacts()` would pass for any
 * pair of matching mistakes. The list below is the contract in
 * `specs/013-platform-v2-blueprint/contracts/events.md`, typed out a second
 * time on purpose: when the two disagree, one of them is wrong and somebody has
 * to look.
 */

const CAIRO = 'Africa/Cairo';

function at(hhmm: string, dayOffset = 0): Date {
  const base = new Date(Date.now() + dayOffset * 86_400_000);
  const instant = wallClockToUtc(`${localDate(base, CAIRO)}T${hhmm}`, CAIRO);
  if (!instant) throw new Error(`cannot resolve ${hhmm}`);
  return instant;
}

function weekly(dtstart: Date): MeetingRecurrence {
  return {
    dtstart,
    rrule: 'FREQ=WEEKLY;COUNT=6',
    exdates: [],
    overrides: [],
  };
}

function meeting(recurrence: MeetingRecurrence | null = null): Meeting {
  const startAt = at('18:00');
  return Meeting.schedule({
    id: 'm-1',
    userId: 'u-1',
    title: 'Standup with Sara',
    description: null,
    startAt,
    durationMin: 45,
    lockTimezone: null,
    location: { onlineLink: 'https://meet.example/abc', address: null },
    prepNotes: null,
    prepMinutes: 15,
    reminderOffsets: [1440, 30],
    recurrence,
    source: 'app',
    createdAt: new Date(),
    timezone: CAIRO,
  });
}

function eventsOf(aggregate: Meeting | CalendarEvent): DomainEvent[] {
  return [...aggregate.pendingEvents];
}

function named(events: DomainEvent[], name: string): DomainEvent {
  const found = events.find((event) => event.name === name);
  expect(found, `no ${name} was raised`).toBeDefined();
  return found!;
}

/** Every field a consumer of a scheduling event reads. */
const SCHEDULING_FIELDS = [
  'meetingId',
  'title',
  'startAt',
  'durationMin',
  'rrule',
  'lockTimezone',
  'reminderOffsets',
  'prepMinutes',
  'status',
] as const;

describe('the meetings events carry what their consumers read', () => {
  it('MeetingScheduled carries every scheduling field', () => {
    const raised = named(eventsOf(meeting()), 'meetings.MeetingScheduled');
    const payload = raised.payload as Record<string, unknown>;

    for (const field of SCHEDULING_FIELDS) {
      expect(payload, `MeetingScheduled is missing ${field}`).toHaveProperty(
        field,
      );
    }
    // The two that P2 got wrong, asserted for their *values* rather than their
    // presence: a `title` of undefined and a `title` of '' both satisfy
    // `toHaveProperty`, and both would send the member "Meeting" on their lock
    // screen.
    expect(payload.title).toBe('Standup with Sara');
    expect(payload.prepMinutes).toBe(15);
    expect(payload.reminderOffsets).toEqual([1440, 30]);
    expect(payload.status).toBe('scheduled');
    expect(raised.userId).toBe('u-1');
    expect(raised.context).toBe('meetings');
    expect(raised.aggregate).toEqual({ type: 'meeting', id: 'm-1' });
  });

  it('MeetingChanged carries the same fields, so an edit re-plans correctly', () => {
    const subject = meeting();
    subject.pullEvents();
    subject.edit({ title: 'Standup', durationMin: 30 }, CAIRO);

    const payload = named(eventsOf(subject), 'meetings.MeetingChanged')
      .payload as Record<string, unknown>;
    for (const field of SCHEDULING_FIELDS) {
      expect(payload, `MeetingChanged is missing ${field}`).toHaveProperty(
        field,
      );
    }
    expect(payload.title).toBe('Standup');
    expect(payload.durationMin).toBe(30);
  });

  it('carries the rule, so a consumer knows the meeting repeats', () => {
    const once = named(eventsOf(meeting()), 'meetings.MeetingScheduled')
      .payload as Record<string, unknown>;
    expect(once.rrule).toBeNull();

    const series = named(
      eventsOf(meeting(weekly(at('18:00')))),
      'meetings.MeetingScheduled',
    ).payload as Record<string, unknown>;
    expect(series.rrule).toBe('FREQ=WEEKLY;COUNT=6');
  });

  it('OccurrenceSkipped and OccurrenceMoved name the occurrence as well', () => {
    const subject = meeting(weekly(at('18:00')));
    subject.pullEvents();

    const second = at('18:00', 7);
    subject.skipOccurrence(second);
    const skipped = named(eventsOf(subject), 'meetings.OccurrenceSkipped')
      .payload as Record<string, unknown>;
    expect(skipped.originalStart).toEqual(second);
    for (const field of SCHEDULING_FIELDS) {
      expect(skipped, `OccurrenceSkipped is missing ${field}`).toHaveProperty(
        field,
      );
    }

    subject.pullEvents();
    const third = at('18:00', 14);
    const target = at('20:00', 14);
    subject.moveOccurrence(third, target);
    const moved = named(eventsOf(subject), 'meetings.OccurrenceMoved')
      .payload as Record<string, unknown>;
    // Both, and they are different facts: which occurrence, and where it went.
    // The saga needs the first to find the alerts it must remove and the second
    // to know where to put them.
    expect(moved.originalStart).toEqual(third);
    expect(moved.movedTo).toEqual(target);
  });

  it('the closing three name the meeting, which is all a consumer needs', () => {
    for (const [act, name] of [
      [(m: Meeting) => m.complete(), 'meetings.MeetingCompleted'],
      [(m: Meeting) => m.cancel(), 'meetings.MeetingCancelled'],
      [(m: Meeting) => m.tombstone(), 'meetings.MeetingDeleted'],
    ] as const) {
      const subject = meeting();
      subject.pullEvents();
      act(subject);
      const payload = named(eventsOf(subject), name).payload as Record<
        string,
        unknown
      >;
      expect(payload.meetingId).toBe('m-1');
      expect(payload).toHaveProperty('at');
    }
  });

  it('restoring re-announces the meeting, so its alerts come back', () => {
    /*
     * The one that would have been easy to leave out. `tombstone` raises
     * `MeetingDeleted` and the saga drops the alerts; a restore that raised
     * nothing would put the meeting back on the calendar with no reminders at
     * all, and nothing would ever say so. Planning learned this as
     * `restore → announceScheduled`.
     */
    const subject = meeting();
    subject.tombstone();
    subject.pullEvents();
    subject.restore();
    const payload = named(eventsOf(subject), 'meetings.MeetingChanged')
      .payload as Record<string, unknown>;
    expect(payload.meetingId).toBe('m-1');
    expect(payload.status).toBe('scheduled');
  });

  it('an edit that changed nothing raises nothing', () => {
    // Otherwise every keystroke in the editor wakes the saga to re-plan an
    // identical set, and the reconcile is not free: it reads the member's
    // whole pending set for the meeting and re-expands the window.
    const subject = meeting();
    subject.pullEvents();
    const changed = subject.edit({ title: 'Standup with Sara' }, CAIRO);
    expect(changed).toEqual([]);
    expect(eventsOf(subject)).toEqual([]);
  });

  it('a personal event raises nothing, and that is the decision', () => {
    /*
     * Not an omission — nothing subscribes. FR-011 gives a personal event a
     * title, a time, a colour and a repeat, and no reminders, so an event
     * raised here would have no consumer. "An event with consumers and no
     * producer is dead documentation" cuts both ways, and this spec is where
     * the decision is recorded: the day a personal event *does* need to notify
     * somebody, this test fails and whoever is adding it reads why.
     */
    const startAt = at('09:00');
    const subject = CalendarEvent.create({
      id: 'e-1',
      userId: 'u-1',
      title: 'Focus block',
      notes: null,
      startAt,
      endAt: new Date(startAt.getTime() + 3_600_000),
      allDay: false,
      color: '#0ea5e9',
      recurrence: null,
      createdAt: new Date(),
      timezone: CAIRO,
    });
    expect(eventsOf(subject)).toEqual([]);

    subject.edit({ title: 'Deep work' }, CAIRO);
    subject.tombstone();
    expect(eventsOf(subject)).toEqual([]);
  });
});
