import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';

export interface SweepResult {
  due: number;
  pushed: number;
  markedSent: number;
  devicesRemoved: number;
}

@Injectable()
export class SweepService {
  private readonly logger = new Logger(SweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Delivers every due, unsent reminder notification.
   *
   * Idempotency: rows are claimed with a conditional updateMany
   * (`sentAt: null` in the WHERE) before any push is attempted, so two
   * overlapping sweeps cannot both claim the same row — the second one's
   * update matches zero rows. A push that then fails leaves the row
   * claimed, which trades a possible missed notification for never
   * double-notifying; the alternative (marking after sending) risks
   * duplicate pushes on a crash, which is the worse failure for a user.
   */
  async run(now: Date = new Date()): Promise<SweepResult> {
    const due = await this.prisma.reminderNotification.findMany({
      where: { sentAt: null, notifyAt: { lte: now }, reminder: { status: 'active' } },
      include: { reminder: { include: { user: { include: { devices: true } } } } },
      orderBy: { notifyAt: 'asc' },
      take: 200,
    });

    let pushed = 0;
    let markedSent = 0;
    let devicesRemoved = 0;

    for (const notification of due) {
      const claimed = await this.prisma.reminderNotification.updateMany({
        where: { id: notification.id, sentAt: null },
        data: { sentAt: now },
      });
      if (claimed.count === 0) continue; // another sweep already took it
      markedSent += 1;

      const devices = notification.reminder.user.devices;
      const tokens = devices.map((d) => d.fcmToken).filter((t): t is string => !!t);
      if (tokens.length === 0) continue;

      const label = notification.label === 'now' ? '' : ` (${notification.label})`;
      const result = await this.push.send(tokens, {
        title: 'Reminder',
        body: `${notification.reminder.title}${label}`,
        data: { reminderId: notification.reminderId, type: 'reminder' },
      });
      pushed += result.delivered;

      if (result.invalidTokens.length > 0) {
        const removed = await this.prisma.device.deleteMany({
          where: { fcmToken: { in: result.invalidTokens } },
        });
        devicesRemoved += removed.count;
      }
    }

    if (due.length > 0) {
      this.logger.log(
        `sweep: ${due.length} due, ${markedSent} claimed, ${pushed} delivered, ${devicesRemoved} stale devices removed`,
      );
    }
    return { due: due.length, pushed, markedSent, devicesRemoved };
  }

  /** Pushes an alert to every admin user's devices (called by n8n's error workflow). */
  async alertAdmins(message: { workflow?: string; error?: string }) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin' },
      include: { devices: true },
    });
    const tokens = admins
      .flatMap((a) => a.devices)
      .map((d) => d.fcmToken)
      .filter((t): t is string => !!t);

    const result = await this.push.send(tokens, {
      title: 'Workflow failure',
      body: `${message.workflow ?? 'unknown workflow'}: ${message.error ?? 'no detail'}`,
      data: { type: 'alert' },
    });
    return { admins: admins.length, delivered: result.delivered };
  }
}
