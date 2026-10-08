import { describe, expect, it } from 'vitest';
import type { MemberContextPort } from '../../shared/member/member-context.port.js';
import {
  MeetingsChatActions,
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
