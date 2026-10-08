import { describe, expect, it } from 'vitest';
import type { MemberContextPort } from '../../shared/member/member-context.port.js';
import {
  MeetingsChatActions,
  PlatformAgenda,
  TrainingChatActions,
} from './infrastructure/chat.adapters.js';

/*
 * 032: meeting and session cards carried a display string ("Tue 2 Sep, 17:00")
 * in `at`, and the phone parses `at` as an instant for every kind — so those
 * two card kinds showed no time at all. Every card's `at` is ISO-8601 now.
 */

const AT = new Date('2026-10-12T14:00:00.000Z');
const member = {
  clock: async () => ({ timezone: 'Africa/Cairo', locale: 'en' }),
} as unknown as MemberContextPort;

describe('card times (032)', () => {
  it('a meeting card carries an ISO instant', async () => {
    const occurrences = {
      forMember: async () => [
        { meetingId: 'm1', title: 'Dentist', startAt: AT },
      ],
    };
    const adapter = new MeetingsChatActions(
      {} as never,
      {} as never,
      occurrences as never,
      member,
    );

    const [card] = await adapter.listUpcoming('u1', new Date(), 7);

    expect(card!.at).toBe(AT.toISOString());
  });

  it('a session card carries an ISO instant', async () => {
    const sessions = {
      between: async () => [
        {
          id: 's1',
          title: 'Legs',
          sport: 'gym',
          plannedAt: AT,
          status: 'planned',
        },
      ],
    };
    const adapter = new TrainingChatActions(
      {} as never,
      {} as never,
      sessions as never,
      {} as never,
      {} as never,
      {} as never,
      member,
    );

    const [card] = await adapter.listUpcoming('u1', new Date(), 7);

    expect(card!.at).toBe(AT.toISOString());
  });
});

describe('PlatformAgenda (032)', () => {
  const now = new Date('2026-10-08T10:00:00.000Z'); // Thu 13:00 in Cairo
  const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

  function agenda() {
    const tasks = {
      page: async (_u: string, query: { view: string }) => ({
        nodes:
          query.view === 'overdue'
            ? [{ title: 'Tax return', dueAt: hours(-72), allDay: true }]
            : [
                { title: 'Report', dueAt: hours(30), allDay: false },
                // Five days out: past the three-day window.
                { title: 'Far away', dueAt: hours(120), allDay: false },
              ],
      }),
    };
    const reminders = {
      page: async () => ({
        nodes: [
          { title: 'Bins', effectiveAt: hours(5) },
          { title: 'Later', effectiveAt: hours(72) },
        ],
      }),
    };
    const occurrences = {
      forMember: async () => [
        {
          title: 'Dentist',
          startAt: hours(28),
          durationMin: 30,
          location: { address: '12 Tahrir St', onlineLink: null },
        },
        {
          title: 'Standup',
          startAt: hours(48),
          durationMin: 15,
          location: { address: null, onlineLink: 'https://meet.example/x' },
        },
      ],
    };
    const sessions = {
      between: async () => [
        { title: 'Legs', sport: 'gym', plannedAt: hours(6), status: 'planned' },
        {
          title: 'Swim',
          sport: 'swim',
          plannedAt: hours(8),
          status: 'skipped',
        },
      ],
    };
    const athletes = {
      handle: async () => ({
        slots: [
          { weekday: 3, start: '18:00', sport: 'gym', durationMin: 60 },
          { weekday: 1, start: '07:00', sport: 'swim', durationMin: 45 },
        ],
      }),
    };
    return new PlatformAgenda(
      tasks as never,
      reminders as never,
      occurrences as never,
      sessions as never,
      athletes as never,
      member,
    );
  }

  it('renders each section in the member zone, within its window', async () => {
    const view = await agenda().forMember('u1', now, 6);

    expect(view.overdueTasks).toEqual(['Tax return (was due Mon 5 Oct)']);
    expect(view.upcomingTasks).toEqual(['Fri 9 Oct 19:00 Report']);
    expect(view.reminders).toEqual(['Thu 8 Oct 18:00 Bins']);
    expect(view.meetings).toEqual([
      'Fri 9 Oct 17:00 Dentist, 30 min at 12 Tahrir St',
      'Sat 10 Oct 13:00 Standup, 15 min (online)',
    ]);
    expect(view.sessions).toEqual(['Thu 8 Oct 19:00 Legs (gym)']);
    expect(view.slots).toEqual([
      'Mon 07:00 swim, 45 min',
      'Wed 18:00 gym, 60 min',
    ]);
  });

  it('asks nothing when the view is off', async () => {
    const view = await agenda().forMember('u1', now, 0);
    expect(Object.values(view).every((section) => section.length === 0)).toBe(
      true,
    );
  });
});
