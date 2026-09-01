import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { SettingsService } from '../settings/settings.service.js';

export interface SweepResult {
  due: number;
  pushed: number;
  markedSent: number;
  devicesRemoved: number;
  skippedNoDevice: number;
  /** Claimed without a push because every device already holds a local alarm. */
  deliveredLocally: number;
  expired: number;
  /** Deleted reminders whose tombstone is past the retention window. */
  purgedTombstones: number;
  purgedConversations: number;
}

// Retry window and batch size are settings (reminders.expiryHours,
// reminders.sweepBatch): both are things an operator retunes after watching
// real traffic, not things worth a redeploy.

@Injectable()
export class SweepService {
  private readonly logger = new Logger(SweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly settings: SettingsService,
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
   *
   * A user with no registered device token is NOT claimed: the row stays
   * unsent so it goes out on the sweep after the phone registers, instead of
   * being marked delivered to nobody.
   */
  async run(now: Date = new Date()): Promise<SweepResult> {
    const [expiryHours, batch, copy, tombstoneDays] = await Promise.all([
      this.settings.get('reminders.expiryHours'),
      this.settings.get('reminders.sweepBatch'),
      this.settings.get('push.copy'),
      this.settings.get('reminders.tombstoneDays'),
    ]);

    const expiredRows = await this.prisma.reminderNotification.deleteMany({
      where: {
        sentAt: null,
        notifyAt: { lt: new Date(now.getTime() - expiryHours * 3_600_000) },
      },
    });

    // Tombstones exist so an offline device can learn about a deletion. Once
    // they are older than any offline stretch the sync will still honour, they
    // are just dead rows. A device that has been away longer than this is
    // given a full snapshot instead, so nothing is lost by purging.
    const horizon = new Date(now.getTime() - tombstoneDays * 86_400_000);
    const purgedTombstones = await this.prisma.reminder.deleteMany({
      where: { deletedAt: { lt: horizon } },
    });

    // Deleted chats age out on the same horizon, and their messages go with
    // them through the foreign key. One horizon for both on purpose: the sync's
    // full-snapshot fallback reads this same setting, so a shorter one here
    // would purge a tombstone a device's cursor was still being trusted for.
    const purgedConversations = await this.prisma.conversation.deleteMany({
      where: { deletedAt: { lt: horizon } },
    });

    const due = await this.prisma.reminderNotification.findMany({
      where: {
        sentAt: null,
        notifyAt: { lte: now },
        reminder: { status: 'active', deletedAt: null },
      },
      include: { reminder: { include: { user: { include: { devices: true } } } } },
      orderBy: { notifyAt: 'asc' },
      take: batch,
    });

    let pushed = 0;
    let markedSent = 0;
    let devicesRemoved = 0;
    let skippedNoDevice = 0;
    let deliveredLocally = 0;

    for (const notification of due) {
      const devices = notification.reminder.user.devices.filter((d) => !!d.fcmToken);
      if (devices.length === 0) {
        skippedNoDevice += 1;
        continue; // leave unsent — a later sweep delivers it once a device registers
      }

      // A device that synced after this ping was planned already scheduled it
      // locally and fires it with or without a network, so pushing to it would
      // show the reminder twice. Only devices that have not seen the plan need
      // the server's copy.
      const tokens = devices
        .filter((d) => !d.lastSeenAt || d.lastSeenAt < notification.createdAt)
        .map((d) => d.fcmToken as string);

      const claimed = await this.prisma.reminderNotification.updateMany({
        where: { id: notification.id, sentAt: null },
        data: { sentAt: now },
      });
      if (claimed.count === 0) continue; // another sweep already took it
      markedSent += 1;

      if (tokens.length === 0) {
        // Every device holds the local alarm; delivery is the phone's job.
        deliveredLocally += 1;
        continue;
      }

      const label = notification.label === 'now' ? '' : ` (${notification.label})`;
      const result = await this.push.send(tokens, {
        title: copy.reminder?.en ?? 'Reminder',
        body: `${notification.reminder.title}${label}`,
        data: {
          reminderId: notification.reminderId,
          type: 'reminder',
          label: notification.label,
        },
      });
      pushed += result.delivered;

      if (result.invalidTokens.length > 0) {
        const removed = await this.prisma.device.deleteMany({
          where: { fcmToken: { in: result.invalidTokens } },
        });
        devicesRemoved += removed.count;
      }
    }

    if (due.length > 0 || expiredRows.count > 0) {
      this.logger.log(
        `sweep: ${due.length} due, ${markedSent} claimed, ${pushed} delivered, ` +
          `${deliveredLocally} left to local alarms, ${skippedNoDevice} held (no device), ` +
          `${devicesRemoved} stale devices removed, ${expiredRows.count} expired, ` +
          `${purgedTombstones.count} tombstones purged, ` +
          `${purgedConversations.count} chats purged`,
      );
    }

    // Written every run so a sweep that stops arriving is visible in /health
    // and the admin dashboard, instead of failing silently the way a missing
    // service token did for days.
    const at = now.toISOString();
    await this.prisma.setting.upsert({
      where: { key: 'ops.lastSweepAt' },
      create: { key: 'ops.lastSweepAt', value: { at, due: due.length, pushed } },
      update: { value: { at, due: due.length, pushed } },
    });

    return {
      due: due.length,
      pushed,
      markedSent,
      devicesRemoved,
      skippedNoDevice,
      deliveredLocally,
      expired: expiredRows.count,
      purgedTombstones: purgedTombstones.count,
      purgedConversations: purgedConversations.count,
    };
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
