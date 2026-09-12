import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../../../shared/audit/in-memory-audit.adapter.js';
import { InMemoryUnitOfWork } from '../../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { Preferences } from '../../domain/preferences.aggregate.js';
import { Profile } from '../../domain/profile.aggregate.js';
import {
  InMemoryPreferencesRepository,
  InMemoryProfileRepository,
} from '../../infrastructure/in-memory-profile.repositories.js';
import { ProfileQueryHandler } from './profile.query.js';

/**
 * `schedulesFor` is the batched read P3's tick runs over every member, and the
 * three things worth pinning down about it are the three ways it could quietly
 * break the tick rather than fail:
 *
 * 1. An id that comes back with no entry would leave a member with no touches
 *    at all, and nothing would say so.
 * 2. A member whose rows have not arrived yet — the relay is eventual — has to
 *    get the installation defaults rather than a null the tick would have to
 *    branch on.
 * 3. One read per member instead of one per collection would still be
 *    functionally correct, and would still pass every assertion above, while
 *    turning a ten-second pass into a job that outlives its own five-minute
 *    interval. That is why the count is asserted and not just the content.
 */
const NOW = new Date('2026-09-10T09:00:00.000Z');

describe('member schedules', () => {
  let uow: InMemoryUnitOfWork;
  let profiles: InMemoryProfileRepository;
  let preferences: InMemoryPreferencesRepository;
  let settings: SettingsService;
  let query: ProfileQueryHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    profiles = new InMemoryProfileRepository(uow);
    preferences = new InMemoryPreferencesRepository(uow);
    settings = new SettingsService(
      new InMemorySettingsStore(),
      new InMemoryAuditAdapter(),
    );
    query = new ProfileQueryHandler(profiles, preferences, settings);
  });

  async function seed(
    userId: string,
    overrides: Partial<{
      timezone: string;
      planTomorrowTime: string;
      endOfDayTime: string;
      morningBriefingTime: string;
      checkinEnabled: boolean;
    }> = {},
  ): Promise<void> {
    await profiles.save(profileFor(userId, overrides.timezone));
    await preferences.save(
      Preferences.create({
        userId,
        planTomorrowTime: overrides.planTomorrowTime ?? '21:00',
        endOfDayTime: overrides.endOfDayTime ?? '22:00',
        morningBriefingTime: overrides.morningBriefingTime ?? '08:00',
        nextPracticeCutoff: '21:00',
        leadTimes: ['1h', '0m'],
        quietHours: { from: '22:00', to: '07:00' },
        weekStartsOn: 'monday',
        checkinEnabled: overrides.checkinEnabled ?? true,
        meetingDurationMin: 30,
        mealMode: 'llm',
        aiSuggestions: true,
        createdAt: NOW,
      }),
    );
  }

  function profileFor(userId: string, timezone = 'Africa/Cairo'): Profile {
    return Profile.create({
      userId,
      displayName: null,
      photoPath: null,
      timezone,
      locale: 'en',
      metrics: [],
      foodLikes: [],
      foodDislikes: [],
      allergies: [],
      symptoms: [],
      onboardingCompletedAt: null,
      createdAt: NOW,
    });
  }

  it('answers every id it was asked for, in that order', async () => {
    await seed('u-1', { timezone: 'Europe/Berlin', endOfDayTime: '23:30' });
    await seed('u-2', { timezone: 'Asia/Tokyo', endOfDayTime: '20:00' });

    const schedules = await query.schedulesFor(['u-2', 'u-1']);

    expect(schedules.map((row) => row.userId)).toEqual(['u-2', 'u-1']);
    expect(schedules[0]).toMatchObject({
      userId: 'u-2',
      timezone: 'Asia/Tokyo',
      endOfDayTime: '20:00',
    });
    expect(schedules[1]).toMatchObject({
      userId: 'u-1',
      timezone: 'Europe/Berlin',
      endOfDayTime: '23:30',
    });
  });

  /**
   * The window after registration, before the relay has delivered
   * `identity.UserRegistered` to `bootstrap-on-registered`. The tick must not
   * have to know this state exists.
   */
  it('falls back to the installation defaults for a member with no rows yet', async () => {
    const schedules = await query.schedulesFor(['brand-new']);

    expect(schedules).toEqual([
      {
        userId: 'brand-new',
        timezone: 'Africa/Cairo',
        planTomorrowTime: '21:00',
        endOfDayTime: '22:00',
        morningBriefingTime: '08:00',
        checkinEnabled: true,
      },
    ]);
  });

  /** An operator's retuned seed is what a member with no rows gets. */
  it('takes the fallback from the settings registry, not from a literal', async () => {
    await settings.set('defaults.morningBriefingTime', '06:15', {
      kind: 'user',
      id: 'admin-1',
      role: 'admin',
    });

    const [schedule] = await query.schedulesFor(['brand-new']);

    expect(schedule?.morningBriefingTime).toBe('06:15');
  });

  /**
   * The bootstrap writes the two rows in sequence, so "profile but no
   * preferences" and the reverse are both reachable. Neither half may drag the
   * other down to a default the member did not choose.
   */
  it('falls back to each half independently', async () => {
    await profiles.save(profileFor('half', 'America/New_York'));

    const [schedule] = await query.schedulesFor(['half']);

    expect(schedule).toEqual({
      userId: 'half',
      timezone: 'America/New_York',
      planTomorrowTime: '21:00',
      endOfDayTime: '22:00',
      morningBriefingTime: '08:00',
      checkinEnabled: true,
    });
  });

  it('mixes present and absent members in one answer', async () => {
    await seed('there', { timezone: 'Asia/Tokyo' });

    const schedules = await query.schedulesFor(['there', 'not-there']);

    expect(schedules).toHaveLength(2);
    expect(schedules[0]?.timezone).toBe('Asia/Tokyo');
    expect(schedules[1]?.timezone).toBe('Africa/Cairo');
  });

  /**
   * The assertion that stops the loop coming back. Fifty members, two reads —
   * one per collection — not a hundred.
   */
  it('issues one read per collection rather than one per member', async () => {
    const userIds: string[] = [];
    for (let index = 0; index < 50; index += 1) {
      const userId = `u-${index}`;
      userIds.push(userId);
      await seed(userId);
    }
    profiles.reads = 0;
    preferences.reads = 0;

    const schedules = await query.schedulesFor(userIds);

    expect(schedules).toHaveLength(50);
    expect(profiles.reads).toBe(1);
    expect(preferences.reads).toBe(1);
  });

  it('asks the stores nothing at all for an empty batch', async () => {
    expect(await query.schedulesFor([])).toEqual([]);
    expect(profiles.reads).toBe(0);
    expect(preferences.reads).toBe(0);
  });
});
