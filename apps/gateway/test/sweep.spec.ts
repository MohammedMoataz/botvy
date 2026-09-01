import { describe, expect, it, vi } from 'vitest';
import { SweepService } from '../src/reminders/sweep.service.js';

/**
 * The sweep's delivery accounting, with Prisma and FCM stubbed. The case that
 * matters most is a user with no registered device: the row must survive to be
 * delivered later, because marking it sent to nobody loses the reminder for
 * good — which is exactly what shipped before.
 */
function makeService(opts: { tokens?: string[]; claimed?: number } = {}) {
  const notification = {
    id: 'n1',
    reminderId: 'r1',
    label: '1h',
    notifyAt: new Date('2026-09-01T09:00:00Z'),
    sentAt: null,
    reminder: {
      title: 'Dentist',
      user: { devices: (opts.tokens ?? ['tok']).map((fcmToken) => ({ fcmToken })) },
    },
  };

  const prisma = {
    reminderNotification: {
      findMany: vi.fn().mockResolvedValue([notification]),
      updateMany: vi.fn().mockResolvedValue({ count: opts.claimed ?? 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    device: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    setting: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const push = { send: vi.fn().mockResolvedValue({ delivered: 1, invalidTokens: [] }) };
  const defaults: Record<string, unknown> = {
    'reminders.expiryHours': 24,
    'reminders.sweepBatch': 200,
    'push.copy': { reminder: { en: 'Reminder' } },
  };
  const settings = { get: vi.fn().mockImplementation((key: string) => defaults[key]) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new SweepService(prisma as any, push as any, settings as any);
  return { service, prisma, push, settings };
}

const NOW = new Date('2026-09-01T10:00:00Z');

describe('SweepService.run', () => {
  it('delivers a due notification and claims it', async () => {
    const { service, prisma, push } = makeService();
    const result = await service.run(NOW);

    expect(push.send).toHaveBeenCalledWith(
      ['tok'],
      expect.objectContaining({ body: 'Dentist (1h)' }),
    );
    expect(prisma.reminderNotification.updateMany).toHaveBeenCalled();
    expect(result).toMatchObject({ pushed: 1, markedSent: 1, skippedNoDevice: 0 });
  });

  it('leaves a notification unsent when the user has no device token', async () => {
    const { service, prisma, push } = makeService({ tokens: [] });
    const result = await service.run(NOW);

    expect(prisma.reminderNotification.updateMany).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ markedSent: 0, skippedNoDevice: 1 });
  });

  it('does not send when another sweep already claimed the row', async () => {
    const { service, push } = makeService({ claimed: 0 });
    const result = await service.run(NOW);

    expect(push.send).not.toHaveBeenCalled();
    expect(result.markedSent).toBe(0);
  });

  it('drops undelivered notifications older than the retry window', async () => {
    const { service, prisma } = makeService();
    await service.run(NOW);

    const where = prisma.reminderNotification.deleteMany.mock.calls[0][0].where;
    expect(where.sentAt).toBeNull();
    expect(where.notifyAt.lt).toEqual(new Date('2026-08-31T10:00:00Z'));
  });

  it('records when it last ran so a stalled scheduler is visible', async () => {
    const { service, prisma } = makeService();
    await service.run(NOW);

    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'ops.lastSweepAt' } }),
    );
  });
});
