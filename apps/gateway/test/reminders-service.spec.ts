import { describe, expect, it, vi } from 'vitest';
import { RemindersService } from '../src/reminders/reminders.service.js';

/**
 * The reminder lifecycle rules, with Prisma stubbed: what a reschedule does to
 * a custom set of lead times, what finishing a reminder does to its pending
 * pings, and that a retried offline create does not produce a second row.
 */
function makeService(existing?: Record<string, unknown>) {
  const reminder = {
    id: 'r1',
    userId: 'u1',
    title: 'Dentist',
    remindAt: new Date('2026-09-02T17:00:00Z'),
    leadTimes: ['1d', '2h', '0m'],
    status: 'active',
    deletedAt: null,
    ...existing,
  };

  const prisma = {
    reminder: {
      create: vi.fn().mockResolvedValue(reminder),
      update: vi.fn().mockResolvedValue(reminder),
      delete: vi.fn().mockResolvedValue(reminder),
      findUnique: vi.fn().mockResolvedValue(reminder),
      findMany: vi.fn().mockResolvedValue([reminder]),
    },
    reminderNotification: {
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    device: { findMany: vi.fn().mockResolvedValue([{ fcmToken: 'tok' }]) },
  };
  const push = { send: vi.fn().mockResolvedValue({ delivered: 1, invalidTokens: [] }) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new RemindersService(prisma as any, push as any);
  return { service, prisma, push, reminder };
}

describe('RemindersService.update', () => {
  it('re-plans a reschedule from the reminder\'s own lead times', async () => {
    const { service, prisma } = makeService();
    await service.update('u1', 'r1', { remindAt: new Date('2026-12-01T17:00:00Z') });

    const rows = prisma.reminderNotification.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { label: string }) => r.label)).toEqual([
      '1 day before',
      '2 hours before',
      'now',
    ]);
  });

  it('uses the lead times supplied in the patch when there are any', async () => {
    const { service, prisma } = makeService();
    await service.update('u1', 'r1', { leadTimes: ['30m', '0m'] });

    const rows = prisma.reminderNotification.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { label: string }) => r.label)).toEqual(['30 minutes before', 'now']);
  });

  it('deletes pending pings when a reminder is marked done', async () => {
    const { service, prisma } = makeService();
    await service.update('u1', 'r1', { status: 'done' });

    expect(prisma.reminderNotification.deleteMany).toHaveBeenCalledWith({
      where: { reminderId: 'r1', sentAt: null },
    });
    expect(prisma.reminderNotification.createMany).not.toHaveBeenCalled();
  });

  it('re-plans the pings when a finished reminder is made active again', async () => {
    const { service, prisma } = makeService({ status: 'cancelled' });
    await service.update('u1', 'r1', { status: 'active' });

    expect(prisma.reminderNotification.createMany).toHaveBeenCalled();
  });

  it('refuses to touch another user\'s reminder', async () => {
    const { service } = makeService({ userId: 'someone-else' });
    await expect(service.update('u1', 'r1', { title: 'x' })).rejects.toThrow('not found');
  });
});

describe('RemindersService.create', () => {
  it('returns the existing reminder when an offline create is retried', async () => {
    const { service, prisma } = makeService();
    const result = await service.create('u1', {
      title: 'Dentist',
      remindAt: new Date('2026-09-02T17:00:00Z'),
      clientId: 'c1',
    });

    expect(prisma.reminder.create).not.toHaveBeenCalled();
    expect(result.id).toBe('r1');
    // Scoped to the owner: another account's client id is not this user's row.
    expect(prisma.reminder.findUnique.mock.calls[0][0].where).toEqual({
      userId_clientId: { userId: 'u1', clientId: 'c1' },
    });
  });

  it('stores the lead times it planned from', async () => {
    const { service, prisma } = makeService();
    prisma.reminder.findUnique.mockResolvedValue(null);
    await service.create('u1', {
      title: 'Dentist',
      remindAt: new Date('2026-09-02T17:00:00Z'),
      leadTimes: ['3h', '0m'],
      clientId: 'c2',
    });

    expect(prisma.reminder.create.mock.calls[0][0].data).toMatchObject({
      leadTimes: ['3h', '0m'],
      clientId: 'c2',
    });
  });
});

describe('RemindersService.remove', () => {
  it('tombstones an owned reminder rather than erasing it', async () => {
    // A row that simply vanished could not appear in a sync delta, so an
    // offline device would never learn the reminder is gone.
    const { service, prisma } = makeService();
    await service.remove('u1', 'r1');

    expect(prisma.reminder.delete).not.toHaveBeenCalled();
    expect(prisma.reminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: { deletedAt: expect.any(Date) },
      }),
    );
  });

  it('keeps the status it had, so the deleted list can say which it was', async () => {
    // Deleting used to stamp 'cancelled' over the real status, which threw
    // away the only thing that distinguishes a completed reminder from an
    // abandoned one — and made restoring it a lie.
    const { service, prisma } = makeService({ status: 'done' });
    await service.remove('u1', 'r1');

    expect(prisma.reminder.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('drops the pending pings so a removed reminder cannot ring', async () => {
    const { service, prisma } = makeService();
    await service.remove('u1', 'r1');

    expect(prisma.reminderNotification.deleteMany).toHaveBeenCalledWith({
      where: { reminderId: 'r1', sentAt: null },
    });
  });

  it('refuses to touch a reminder that is already a tombstone', async () => {
    const { service, prisma } = makeService({ deletedAt: new Date('2026-08-01T00:00:00Z') });
    await expect(service.remove('u1', 'r1')).rejects.toThrow('not found');
    expect(prisma.reminder.update).not.toHaveBeenCalled();
  });

  it('hides tombstones from the list every caller reads', async () => {
    const { service, prisma } = makeService();
    await service.list('u1');

    expect(prisma.reminder.findMany.mock.calls[0][0].where).toMatchObject({
      userId: 'u1',
      deletedAt: null,
    });
  });

  it('tells the user\'s phones to re-sync so their local alarms drop it', async () => {
    const { service, push } = makeService();
    await service.remove('u1', 'r1');
    expect(push.send).toHaveBeenCalledWith(['tok'], { data: { type: 'sync' } });
  });

  it('refuses to delete another user\'s reminder', async () => {
    const { service, prisma } = makeService({ userId: 'someone-else' });
    await expect(service.remove('u1', 'r1')).rejects.toThrow('not found');
    expect(prisma.reminder.delete).not.toHaveBeenCalled();
  });
});

describe('RemindersService.restore', () => {
  const deleted = (over: Record<string, unknown> = {}) => ({
    deletedAt: new Date('2026-08-01T00:00:00Z'),
    ...over,
  });

  it('lifts the tombstone without touching the status', async () => {
    const { service, prisma } = makeService(deleted({ status: 'done' }));
    await service.restore('u1', 'r1');

    expect(prisma.reminder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: { deletedAt: null } }),
    );
  });

  it('plans pings again for one that can still ring', async () => {
    // Deleting dropped them, so without this it comes back visible and silent.
    const { service, prisma } = makeService(
      deleted({ status: 'active', remindAt: new Date(Date.now() + 86_400_000) }),
    );
    await service.restore('u1', 'r1');

    expect(prisma.reminderNotification.createMany).toHaveBeenCalled();
  });

  it('plans nothing for one whose moment has passed', async () => {
    const { service, prisma } = makeService(
      deleted({ status: 'active', remindAt: new Date(Date.now() - 86_400_000) }),
    );
    await service.restore('u1', 'r1');

    expect(prisma.reminderNotification.createMany).not.toHaveBeenCalled();
  });

  it('plans nothing for one that was already finished', async () => {
    const { service, prisma } = makeService(
      deleted({ status: 'done', remindAt: new Date(Date.now() + 86_400_000) }),
    );
    await service.restore('u1', 'r1');

    expect(prisma.reminderNotification.createMany).not.toHaveBeenCalled();
  });

  it('is a no-op for one that was never deleted', async () => {
    const { service, prisma } = makeService();
    await service.restore('u1', 'r1');

    expect(prisma.reminder.update).not.toHaveBeenCalled();
  });

  it('refuses to restore another user\'s reminder', async () => {
    const { service } = makeService(deleted({ userId: 'someone-else' }));
    await expect(service.restore('u1', 'r1')).rejects.toThrow('not found');
  });

  it('reactivating makes it active again, whatever it was', async () => {
    // Restore returns a completed reminder as completed. This is the other
    // thing a user wants from the deleted list: do that again.
    const { service, prisma } = makeService(
      deleted({ status: 'done', remindAt: new Date(Date.now() + 86_400_000) }),
    );
    await service.reactivate('u1', 'r1');

    expect(prisma.reminder.update.mock.calls[0][0].data).toMatchObject({
      deletedAt: null,
      status: 'active',
    });
    expect(prisma.reminderNotification.createMany).toHaveBeenCalled();
  });

  it('reactivating with a new time moves it and arms that', async () => {
    const when = new Date(Date.now() + 172_800_000);
    const { service, prisma } = makeService(
      deleted({ status: 'cancelled', remindAt: new Date(Date.now() - 86_400_000) }),
    );
    await service.reactivate('u1', 'r1', when);

    expect(prisma.reminder.update.mock.calls[0][0].data.remindAt).toBe(when);
    expect(prisma.reminderNotification.createMany).toHaveBeenCalled();
  });

  it('reactivating a past one with no new time arms nothing', async () => {
    // A ping planned for the past fires the instant it is written. It comes
    // back active and overdue instead, which is at least honest.
    const { service, prisma } = makeService(
      deleted({ status: 'done', remindAt: new Date(Date.now() - 86_400_000) }),
    );
    await service.reactivate('u1', 'r1');

    expect(prisma.reminderNotification.createMany).not.toHaveBeenCalled();
    expect(prisma.reminder.update.mock.calls[0][0].data.status).toBe('active');
  });

  it('purge erases a deleted reminder for good', async () => {
    const { service, prisma } = makeService(deleted());
    await service.purge('u1', 'r1');

    expect(prisma.reminder.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('purge refuses one that is not deleted, so it cannot skip the undo', async () => {
    const { service, prisma } = makeService();
    await expect(service.purge('u1', 'r1')).rejects.toThrow('not found');
    expect(prisma.reminder.delete).not.toHaveBeenCalled();
  });

  it('purge refuses another user\'s reminder', async () => {
    const { service } = makeService(deleted({ userId: 'someone-else' }));
    await expect(service.purge('u1', 'r1')).rejects.toThrow('not found');
  });

  it('emptying the list touches only this user\'s tombstones', async () => {
    const { service, prisma } = makeService();
    prisma.reminder.deleteMany = vi.fn().mockResolvedValue({ count: 4 });

    await expect(service.purgeAllDeleted('u1')).resolves.toEqual({ purged: 4 });
    expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', deletedAt: { not: null } },
    });
  });

  it('lists the deleted ones newest first, for the undo view', async () => {
    const { service, prisma } = makeService();
    await service.listDeleted('u1');

    const call = prisma.reminder.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 'u1', deletedAt: { not: null } });
    expect(call.orderBy).toEqual({ deletedAt: 'desc' });
  });
});
