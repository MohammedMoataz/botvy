import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { planNotifications } from './lead-times.js';

export interface CreateReminderInput {
  title: string;
  remindAt: Date;
  leadTimes?: string[];
}

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateReminderInput) {
    const planned = planNotifications(input.remindAt, input.leadTimes ?? ['1h', '0m']);

    return this.prisma.reminder.create({
      data: {
        userId,
        title: input.title,
        remindAt: input.remindAt,
        notifications: {
          create: planned.map((p) => ({ notifyAt: p.notifyAt, label: p.label })),
        },
      },
      include: { notifications: true },
    });
  }

  list(userId: string, status?: 'active' | 'done' | 'cancelled') {
    return this.prisma.reminder.findMany({
      where: { userId, ...(status ? { status } : {}) },
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
    if (!reminder || reminder.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }
    return reminder;
  }

  async update(
    userId: string,
    id: string,
    patch: { title?: string; remindAt?: Date; status?: 'active' | 'done' | 'cancelled' },
  ) {
    await this.ownedOrThrow(userId, id);

    // Rescheduling replaces the notification plan: the old unsent rows
    // point at times derived from the previous remindAt.
    if (patch.remindAt) {
      await this.prisma.reminderNotification.deleteMany({
        where: { reminderId: id, sentAt: null },
      });
      const planned = planNotifications(patch.remindAt);
      await this.prisma.reminderNotification.createMany({
        data: planned.map((p) => ({ reminderId: id, notifyAt: p.notifyAt, label: p.label })),
        skipDuplicates: true,
      });
    }

    return this.prisma.reminder.update({
      where: { id },
      data: patch,
      include: { notifications: true },
    });
  }

  async cancel(userId: string, id: string) {
    await this.ownedOrThrow(userId, id);
    // Cancelling deletes unsent notifications outright rather than relying
    // on the sweep to filter by status — one fewer way to fire a push for
    // a cancelled reminder.
    await this.prisma.reminderNotification.deleteMany({
      where: { reminderId: id, sentAt: null },
    });
    return this.prisma.reminder.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }
}
