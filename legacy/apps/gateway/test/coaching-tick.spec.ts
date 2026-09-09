import { describe, expect, it, vi } from 'vitest';
import { NightlyService } from '../src/coaching/nightly.service.js';

/**
 * The coaching clock. One five-minute tick has to behave like the old
 * once-a-night cron: each user asked once, at *their* local time, and still
 * asked if the gateway was asleep when that moment passed.
 */
function makeService(profile: Record<string, unknown> = {}) {
  const row = {
    userId: 'u1',
    timezone: 'Africa/Cairo',
    checkinTime: null,
    programTime: null,
    lastCheckinSentDate: null,
    lastProgramSentDate: null,
    language: null,
    user: { devices: [{ fcmToken: 'tok' }] },
    ...profile,
  };

  const prisma = {
    coachingProfile: { update: vi.fn().mockResolvedValue(row) },
    setting: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const push = { send: vi.fn().mockResolvedValue({ delivered: 1, invalidTokens: [] }) };
  const coaching = {
    optedInUsers: vi.fn().mockResolvedValue([row]),
    markAwaitingCheckin: vi.fn().mockResolvedValue({}),
    context: vi.fn().mockResolvedValue({
      streak: 0,
      completionRatio: 0,
      today: '2026-09-01',
      isRestDay: false,
      avoidMuscleGroups: [],
    }),
    planIsSafe: vi.fn().mockResolvedValue({ safe: true, violations: [] }),
    recordWorkout: vi.fn().mockResolvedValue({}),
  };
  const values: Record<string, unknown> = {
    'coaching.checkinTime': '21:00',
    'coaching.programTime': '22:00',
    'defaults.timezone': 'Africa/Cairo',
    'push.copy': {},
  };
  const settings = { get: vi.fn().mockImplementation((k: string) => values[k]) };

  const conversations = { speak: vi.fn().mockResolvedValue({ id: 'conv-coaching' }) };

  const service = new NightlyService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    push as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coaching as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings as any,
  );
  return { service, prisma, push, coaching, conversations };
}

const program = async () => ({ text: 'Squats.', exercises: ['Squat'], muscleGroups: ['legs'] });

// Cairo is UTC+3, so these UTC instants are 20:30, 21:30 and 23:30 locally.
const BEFORE_CHECKIN = new Date('2026-09-01T17:30:00Z');
const AFTER_CHECKIN = new Date('2026-09-01T18:30:00Z');
const AFTER_BOTH = new Date('2026-09-01T20:30:00Z');

describe('NightlyService.tick', () => {
  it('does nothing before the user\'s local check-in time', async () => {
    const { service, push, coaching } = makeService();
    const result = await service.tick(program, BEFORE_CHECKIN);

    expect(coaching.markAwaitingCheckin).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ checkinsSent: 0, programsSent: 0 });
  });

  it('asks once the user\'s local time has passed', async () => {
    const { service, coaching } = makeService();
    const result = await service.tick(program, AFTER_CHECKIN);

    expect(coaching.markAwaitingCheckin).toHaveBeenCalled();
    expect(result.checkinsSent).toBe(1);
    expect(result.programsSent).toBe(0);
  });

  it('does not ask twice on the same local date', async () => {
    const { service, coaching } = makeService({ lastCheckinSentDate: '2026-09-01' });
    const result = await service.tick(program, AFTER_CHECKIN);

    expect(coaching.markAwaitingCheckin).not.toHaveBeenCalled();
    expect(result.checkinsSent).toBe(0);
  });

  it('claims the date before sending, so a crash cannot double-send', async () => {
    const { service, prisma } = makeService();
    await service.tick(program, AFTER_CHECKIN);

    expect(prisma.coachingProfile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { lastCheckinSentDate: '2026-09-01' },
    });
  });

  it('catches up on both events when it runs late', async () => {
    const { service } = makeService();
    const result = await service.tick(program, AFTER_BOTH);

    expect(result).toMatchObject({ checkinsSent: 1, programsSent: 1 });
  });

  it('honours a user\'s own check-in time over the global default', async () => {
    const { service } = makeService({ checkinTime: '23:00' });
    const result = await service.tick(program, AFTER_CHECKIN); // 21:30 local

    expect(result.checkinsSent).toBe(0);
  });

  it('writes the question into the coaching chat, not only into a push', async () => {
    // It used to exist solely as a notification: a user who opened the app
    // instead of tapping it was expected to answer a question that was nowhere
    // on screen, and their answer landed in a transcript with no question above
    // it.
    const { service, conversations } = makeService();
    await service.tick(program, AFTER_CHECKIN);

    expect(conversations.speak).toHaveBeenCalledWith('u1', expect.any(String));
  });

  it('tells the phone which chat the check-in belongs to', async () => {
    const { service, push } = makeService();
    await service.tick(program, AFTER_CHECKIN);

    expect(push.send.mock.calls[0][1].data).toMatchObject({
      type: 'checkin',
      conversationId: 'conv-coaching',
    });
  });

  it('records that it ran so a stalled clock is visible', async () => {
    const { service, prisma } = makeService();
    await service.tick(program, AFTER_CHECKIN);

    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'ops.lastCoachingTickAt' } }),
    );
  });
});
