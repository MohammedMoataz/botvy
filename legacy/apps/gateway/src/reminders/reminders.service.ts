import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { DEFAULT_LEAD_TIMES, planNotifications } from './lead-times.js';

export interface CreateReminderInput {
  title: string;
  remindAt: Date;
  leadTimes?: string[];
  /** Client-generated id for a reminder composed offline; makes retries safe. */
  clientId?: string;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Tells the user's phones to re-sync, so the local alarms they schedule
   * themselves match a reminder that changed elsewhere (from chat, or another
   * device). Silent and best-effort: the phone also pulls a full snapshot
   * whenever it opens, which is what actually guarantees convergence.
   */
  private async nudgeDevices(userId: string): Promise<void> {
    try {
      const devices = await this.prisma.device.findMany({
        where: { userId, fcmToken: { not: null } },
        select: { fcmToken: true },
      });
      const tokens = devices.map((d) => d.fcmToken as string);
      if (tokens.length === 0) return;
      await this.push.send(tokens, { data: { type: 'sync' } });
    } catch (err) {
      this.logger.warn(`sync nudge failed for ${userId}: ${String(err)}`);
    }
  }

  async create(userId: string, input: CreateReminderInput) {
    // A phone that loses the response to its create still holds the row in
    // its outbox and retries; without this the retry makes a second reminder.
    if (input.clientId) {
      const existing = await this.prisma.reminder.findUnique({
        where: { userId_clientId: { userId, clientId: input.clientId } },
        include: { notifications: true },
      });
      if (existing) return existing;
    }

    const leadTimes = input.leadTimes ?? DEFAULT_LEAD_TIMES;
    const planned = planNotifications(input.remindAt, leadTimes);

    const created = await this.prisma.reminder.create({
      data: {
        userId,
        title: input.title,
        remindAt: input.remindAt,
        leadTimes,
        clientId: input.clientId,
        notifications: {
          create: planned.map((p) => ({ notifyAt: p.notifyAt, label: p.label })),
        },
      },
      include: { notifications: true },
    });
    await this.nudgeDevices(userId);
    return created;
  }

  /**
   * Brings a deleted reminder back *and* makes it active again, whatever it
   * was before. Restore returns a completed reminder as completed; this is for
   * "I want to do that again".
   *
   * A moment that has already passed cannot be re-armed — a ping planned for
   * the past fires the instant it is written — so the caller supplies a new
   * time for those. Without one the reminder comes back active and overdue,
   * which is at least honest about needing attention.
   */
  async reactivate(userId: string, id: string, remindAt?: Date) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder || reminder.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }

    const when = remindAt ?? reminder.remindAt;
    await this.prisma.reminderNotification.deleteMany({
      where: { reminderId: id, sentAt: null },
    });
    if (when > new Date()) {
      const planned = planNotifications(when, reminder.leadTimes);
      await this.prisma.reminderNotification.createMany({
        data: planned.map((p) => ({ reminderId: id, notifyAt: p.notifyAt, label: p.label })),
        skipDuplicates: true,
      });
    }

    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { deletedAt: null, status: 'active', remindAt: when },
      include: { notifications: true },
    });
    await this.nudgeDevices(userId);
    return updated;
  }

  /**
   * Erases a deleted reminder for good, ahead of the sweep's horizon.
   *
   * Only one that is already a tombstone: this is the second step of a
   * deletion the user has already made, not a way to skip the undo.
   */
  async purge(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder || reminder.userId !== userId || !reminder.deletedAt) {
      throw new NotFoundException('Deleted reminder not found');
    }
    await this.prisma.reminder.delete({ where: { id } });
    await this.nudgeDevices(userId);
    return { id, purged: true };
  }

  /** Empties the undo list. Same rule: tombstones only. */
  async purgeAllDeleted(userId: string) {
    const removed = await this.prisma.reminder.deleteMany({
      where: { userId, deletedAt: { not: null } },
    });
    await this.nudgeDevices(userId);
    return { purged: removed.count };
  }

  /** Recently deleted, newest first — the undo list. */
  listDeleted(userId: string) {
    return this.prisma.reminder.findMany({
      where: { userId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: { notifications: true },
    });
  }

  list(userId: string, status?: 'active' | 'done' | 'cancelled') {
    return this.prisma.reminder.findMany({
      // Tombstones are excluded here rather than at each call site: this is the
      // only way chat reaches reminders (listing, cancelling, the prompt's
      // upcoming lines), so one condition covers every caller.
      where: { userId, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { remindAt: 'asc' },
      include: { notifications: true },
    });
  }

  /**
   * Loads a reminder and asserts ownership. A reminder belonging to
   * someone else is reported as not-found rather than forbidden, so the
   * endpoint does not leak which ids exist.
   */
  private async ownedOrThrow(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    // A tombstone is not-found too, so a late PATCH from a device that had not
    // yet heard about the delete cannot resurrect it.
    if (!reminder || reminder.userId !== userId || reminder.deletedAt) {
      throw new NotFoundException('Reminder not found');
    }
    return reminder;
  }

  async update(
    userId: string,
    id: string,
    patch: {
      title?: string;
      remindAt?: Date;
      leadTimes?: string[];
      status?: 'active' | 'done' | 'cancelled';
    },
  ) {
    const reminder = await this.ownedOrThrow(userId, id);
    const closing = patch.status === 'done' || patch.status === 'cancelled';
    // Finishing a reminder deleted its pending pings, so bringing one back to
    // life has to plan them again or it would sit in the list saying nothing.
    const reopening = patch.status === 'active' && reminder.status !== 'active';

    // A reminder that is finished must stop notifying, whichever status
    // finished it — the sweep filtering on status is one safeguard, deleting
    // the rows is the one that cannot be forgotten.
    if (closing) {
      await this.prisma.reminderNotification.deleteMany({
        where: { reminderId: id, sentAt: null },
      });
    } else if (patch.remindAt || patch.leadTimes || reopening) {
      // Rescheduling replaces the notification plan: the old unsent rows
      // point at times derived from the previous remindAt. The lead times
      // come from the reminder itself unless the caller changed them —
      // passing none here used to silently reset a custom set to the default.
      await this.prisma.reminderNotification.deleteMany({
        where: { reminderId: id, sentAt: null },
      });
      const planned = planNotifications(
        patch.remindAt ?? reminder.remindAt,
        patch.leadTimes ?? reminder.leadTimes,
      );
      await this.prisma.reminderNotification.createMany({
        data: planned.map((p) => ({ reminderId: id, notifyAt: p.notifyAt, label: p.label })),
        skipDuplicates: true,
      });
    }

    const updated = await this.prisma.reminder.update({
      where: { id },
      data: patch,
      include: { notifications: true },
    });
    await this.nudgeDevices(userId);
    return updated;
  }

  async cancel(userId: string, id: string) {
    return this.update(userId, id, { status: 'cancelled' });
  }

  /**
   * Removes a reminder from the user's world.
   *
   * A tombstone, not a delete: an offline device learns about a deletion by
   * seeing the row come back marked, and a row that vanished would simply
   * never appear in its delta. The sweep purges tombstones once they are older
   * than any plausible offline stretch.
   */
  async remove(userId: string, id: string) {
    await this.ownedOrThrow(userId, id);
    await this.prisma.reminderNotification.deleteMany({
      where: { reminderId: id, sentAt: null },
    });
    // The status is left exactly as it was. Overwriting it with 'cancelled'
    // threw away the one thing the deleted list has to show — whether the
    // reminder had been completed, cancelled, or was still waiting when it
    // went — and made restoring it a lie.
    await this.prisma.reminder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.nudgeDevices(userId);
    return { id, deleted: true };
  }

  /**
   * Brings a deleted reminder back, with the status it had when it went.
   *
   * Its pending pings were deleted on the way out, so one that is still active
   * and still in the future has to be planned again or it would come back
   * silent — visible in the list and incapable of ringing.
   */
  async restore(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder || reminder.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }
    if (!reminder.deletedAt) return reminder; // already here; nothing to undo

    if (reminder.status === 'active' && reminder.remindAt > new Date()) {
      const planned = planNotifications(reminder.remindAt, reminder.leadTimes);
      await this.prisma.reminderNotification.createMany({
        data: planned.map((p) => ({ reminderId: id, notifyAt: p.notifyAt, label: p.label })),
        skipDuplicates: true,
      });
    }

    const restored = await this.prisma.reminder.update({
      where: { id },
      data: { deletedAt: null },
      include: { notifications: true },
    });
    await this.nudgeDevices(userId);
    return restored;
  }
}
