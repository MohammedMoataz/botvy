import { describe, expect, it, vi } from 'vitest';
import { NightlyService } from '../src/coaching/nightly.service.js';

/**
 * Exercises the nightly cycle's decisions — rest days, allergy withholding,
 * plan-vs-reported precedence — with the model and the database stubbed, so
 * the rules that decide what a user receives are verifiable without either.
 */
function makeService(opts: {
  isRestDay?: boolean;
  safe?: boolean;
  violations?: string[];
  tokens?: string[];
}) {
  const push = { send: vi.fn().mockResolvedValue({ delivered: 1, invalidTokens: [] }) };
  const recordWorkout = vi.fn().mockResolvedValue({});
  const coaching = {
    optedInUsers: vi.fn().mockResolvedValue([
      {
        userId: 'u1',
        timezone: 'UTC',
        user: { devices: (opts.tokens ?? ['tok']).map((fcmToken) => ({ fcmToken })) },
      },
    ]),
    context: vi.fn().mockResolvedValue({
      streak: 0,
      completionRatio: 0,
      today: '2026-08-30',
      isRestDay: opts.isRestDay ?? false,
      avoidMuscleGroups: ['chest'],
    }),
    planIsSafe: vi
      .fn()
      .mockResolvedValue({ safe: opts.safe ?? true, violations: opts.violations ?? [] }),
    recordWorkout,
    markAwaitingCheckin: vi.fn().mockResolvedValue({}),
  };
  const prisma = {};
  const settings = { get: vi.fn().mockResolvedValue({}) };
  // The question and the program are written into the coaching chat now, not
  // only pushed — so the transcript has the question the answer replies to.
  const conversations = {
    speak: vi.fn().mockResolvedValue({ id: 'conv-coaching' }),
  };
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
  return { service, push, coaching, conversations, recordWorkout };
}

const goodProgram = async () => ({
  text: 'Squats and oats.',
  exercises: ['Squat'],
  muscleGroups: ['legs'],
});

describe('NightlyService.pushPrograms', () => {
  it('sends a rest message and stores no workout on a rest day', async () => {
    const { service, push, recordWorkout } = makeService({ isRestDay: true });
    const result = await service.pushPrograms(goodProgram);

    expect(result.skippedRestDay).toBe(1);
    expect(recordWorkout).not.toHaveBeenCalled();
    expect(push.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Rest day' }),
    );
  });

  it('withholds a plan that violates a declared allergy instead of warning', async () => {
    const { service, push, recordWorkout } = makeService({
      safe: false,
      violations: ['peanut'],
    });
    const result = await service.pushPrograms(goodProgram);

    expect(result.withheldUnsafe).toBe(1);
    expect(result.sent).toBe(0);
    expect(recordWorkout).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });

  it('delivers and records a safe plan', async () => {
    const { service, push, recordWorkout } = makeService({});
    const result = await service.pushPrograms(goodProgram);

    expect(result.sent).toBe(1);
    expect(result.withheldUnsafe).toBe(0);
    expect(recordWorkout).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ source: 'planned', workoutDate: '2026-08-30' }),
    );
  });

  it('sends nothing when generation fails rather than sending unchecked text', async () => {
    const { service, push, recordWorkout } = makeService({});
    const result = await service.pushPrograms(async () => null);

    expect(result.sent).toBe(0);
    expect(recordWorkout).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });

  it('still records state for a user with no registered devices', async () => {
    const { service, push, recordWorkout } = makeService({ tokens: [] });
    const result = await service.pushPrograms(goodProgram);

    expect(recordWorkout).toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });
});

describe('NightlyService.askCheckins', () => {
  it('marks every opted-in user awaiting and pushes the question', async () => {
    const { service, push, coaching } = makeService({});
    const result = await service.askCheckins();

    expect(coaching.markAwaitingCheckin).toHaveBeenCalledWith('u1', expect.any(Date));
    expect(result.sent).toBe(1);
    expect(push.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Evening check-in' }),
    );
  });

  it('still marks awaiting for a user with no devices', async () => {
    const { service, push, coaching } = makeService({ tokens: [] });
    const result = await service.askCheckins();

    expect(coaching.markAwaitingCheckin).toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });
});
