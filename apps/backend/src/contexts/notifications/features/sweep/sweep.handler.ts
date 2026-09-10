import { Injectable, Logger } from '@nestjs/common';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { PushService } from '../../../../shared/push/push.service.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import type { Alert } from '../../domain/alert.aggregate.js';
import { AlertRepository } from '../../domain/alert.repository.js';
import {
  DeviceLookupPort,
  DeviceRemovalPort,
  TombstonePurgePort,
  type NotifiableDevice,
} from '../../domain/notification.ports.js';

/** The heartbeat key `/health` and the admin overview report staleness on. */
export const SWEEP_JOB = 'notifications.sweep';

/**
 * The shape `contracts/internal.md` fixes. Every number is about something the
 * sweep actually did, and `purged` is the only one that counts rows another
 * context deleted on request.
 */
export interface SweepResult {
  claimed: number;
  sent: number;
  /** Alerts left unsent because every one of the member's devices already had them. */
  skippedLocal: number;
  expired: number;
  purged: number;
  failed: number;
}

/**
 * The fallback delivery path, on a five-minute timer.
 *
 * ## It is the fallback, not the mechanism
 *
 * The phone schedules its own alarms from its own database, so a reminder fires
 * with the network off, in a tunnel, on a plane. This sweep exists for the
 * device that has *not* synced since the alert was planned — a phone that has
 * been off for two days, or one that was registered after the plan was made.
 *
 * Which makes the device filter the most important line in the file: any device
 * whose `lastSeenAt` is at or after `alert.plannedAt` already holds this alarm
 * locally and must be skipped. Get that wrong in one direction and the member
 * is notified twice for one thing; get it wrong in the other — comparing
 * against `notifyAt`, say — and a device that synced last week counts as up to
 * date about an alert planned this morning, so nobody is notified at all.
 *
 * ## Claim, then send
 *
 * Every row is claimed atomically before anything is sent, and the claim is a
 * single `findOneAndUpdate` filtered on `claimedAt: null` — so of two sweeps
 * running at once, exactly one gets each row. That is not hypothetical: the
 * cron fires every five minutes and a slow batch overlaps the next tick.
 *
 * The order matters as much as the atomicity. Claiming *after* sending would
 * make a crash between the two a duplicate notification; claiming first makes
 * it a missed one, and a missed notification is recoverable where an
 * unexplained duplicate erodes the member's trust in every future one.
 *
 * ## Two of its old duties are now requests
 *
 * v1's sweep reaped invalid push tokens out of the devices table and deleted
 * tombstones out of two other contexts' collections. Both are still done, and
 * neither is done *here*: they go through ports bound to the owning contexts.
 * The sweep counts what the owners report. That is the difference between this
 * Constitution Check saying PASS honestly and saying it with a footnote.
 */
@Injectable()
export class SweepHandler {
  private readonly logger = new Logger(SweepHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly alerts: AlertRepository,
    private readonly devices: DeviceLookupPort,
    private readonly deviceRemoval: DeviceRemovalPort,
    private readonly purges: TombstonePurgePort[],
    private readonly push: PushService,
    private readonly settings: SettingsService,
    private readonly heartbeats: HeartbeatService,
  ) {}

  async handle(now: Date = new Date()): Promise<SweepResult> {
    const startedAt = Date.now();
    try {
      const result = await this.run(now);
      await this.heartbeats.stamp(
        SWEEP_JOB,
        true,
        undefined,
        Date.now() - startedAt,
      );
      return result;
    } catch (error) {
      // Stamped on the way out either way. A scheduled job that stops arriving
      // has to be visible: a silent 401 between n8n and the gateway once went
      // unnoticed for days, which is why every job writes a heartbeat and
      // `/health` reports it stale after fifteen minutes.
      await this.heartbeats.stamp(
        SWEEP_JOB,
        false,
        error instanceof Error ? error.message : String(error),
        Date.now() - startedAt,
      );
      throw error;
    }
  }

  private async run(now: Date): Promise<SweepResult> {
    const [batchSize, expiryHours] = await Promise.all([
      this.settings.get('notifications.sweepBatch'),
      this.settings.get('notifications.expiryHours'),
    ]);

    const result: SweepResult = {
      claimed: 0,
      sent: 0,
      skippedLocal: 0,
      expired: 0,
      purged: 0,
      failed: 0,
    };

    // ------------------------------------------------------------- 1. expire
    //
    // Before sending, so a batch full of stale rows does not crowd out the ones
    // that are still worth delivering.
    const expiryHorizon = new Date(now.getTime() - expiryHours * 3_600_000);
    const stale = await this.alerts.expiredUnsent(expiryHorizon, batchSize);
    if (stale.length > 0) {
      await this.uow.run(async () => {
        for (const alert of stale) {
          alert.expire(now);
          await this.alerts.save(alert);
        }
      });
      result.expired = stale.length;
    }

    // -------------------------------------------------------------- 2. deliver
    const due = await this.alerts.dueUnsent(now, batchSize);
    const byUser = new Map<string, Alert[]>();
    for (const alert of due) {
      const forUser = byUser.get(alert.userId) ?? [];
      forUser.push(alert);
      byUser.set(alert.userId, forUser);
    }

    const devices = await this.devices.forUsers([...byUser.keys()]);
    const devicesByUser = new Map<string, NotifiableDevice[]>();
    for (const device of devices) {
      const forUser = devicesByUser.get(device.userId) ?? [];
      forUser.push(device);
      devicesByUser.set(device.userId, forUser);
    }

    const invalidTokens: string[] = [];

    for (const [userId, alerts] of byUser) {
      const pushable = (devicesByUser.get(userId) ?? []).filter(
        (device) => device.pushToken !== null,
      );

      // No device can receive a push. The alert is left *unsent* rather than
      // expired: the member may register a phone tomorrow, and the alert is
      // still the truth about what they asked for. It expires on its own
      // timetable if nothing ever arrives.
      if (pushable.length === 0) {
        result.skippedLocal += alerts.length;
        continue;
      }

      for (const alert of alerts) {
        // The filter. See the class comment — this is the line the whole
        // device-first design rests on.
        const needTelling = pushable.filter(
          (device) =>
            device.lastSeenAt === null ||
            device.lastSeenAt.getTime() < alert.plannedAt.getTime(),
        );

        if (needTelling.length === 0) {
          result.skippedLocal += 1;
          continue;
        }

        const claimed = await this.alerts.claim(alert.id, now);
        // Somebody else took it. Ordinary rather than exceptional: that is what
        // the claim is for.
        if (!claimed) continue;
        result.claimed += 1;

        const tokens = needTelling
          .map((device) => device.pushToken)
          .filter((token): token is string => token !== null);

        try {
          const outcome = await this.push.send(tokens, {
            title: claimed.title,
            body: claimed.body,
            data: {
              alertId: claimed.id,
              sourceKind: claimed.source.kind,
              sourceId: claimed.source.id,
              deepLink: claimed.deepLink,
            },
          });
          invalidTokens.push(...outcome.invalidTokens);

          if (outcome.sent > 0) {
            claimed.markSent(
              needTelling.map((device) => device.deviceId),
              now,
            );
            result.sent += 1;
          } else {
            claimed.markFailed(
              `no device accepted the push (${outcome.failed} rejected)`,
              now,
            );
            result.failed += 1;
          }
        } catch (error) {
          claimed.markFailed(
            error instanceof Error ? error.message : String(error),
            now,
          );
          result.failed += 1;
        }

        await this.uow.run(() => this.alerts.save(claimed));
      }
    }

    // -------------------------------------------------- 3. reap invalid tokens
    //
    // Asked for, not done. The device row is Identity's, in PostgreSQL.
    if (invalidTokens.length > 0) {
      const reaped = await this.deviceRemoval.removeByPushToken([
        ...new Set(invalidTokens),
      ]);
      this.logger.log(
        `reaped ${reaped} device(s) whose push token is no longer valid`,
      );
    }

    // ------------------------------------------------------ 4. purge tombstones
    //
    // Also asked for. `reminders.tombstoneDays` is read by the sync facade's
    // full-snapshot rule too, and it is deliberately the same key: a phone
    // offline for longer than the horizon must re-sync from a full snapshot,
    // because the tombstones that would have told it about the deletions are
    // gone. Two keys would let those two truths drift apart.
    const tombstoneDays = await this.settings.get('reminders.tombstoneDays');
    const horizon = new Date(now.getTime() - tombstoneDays * 86_400_000);
    for (const purge of this.purges) {
      result.purged += await purge.purgeBefore(horizon);
    }

    this.logger.log(
      `sweep: claimed=${result.claimed} sent=${result.sent} skippedLocal=${result.skippedLocal} ` +
        `expired=${result.expired} purged=${result.purged} failed=${result.failed}`,
    );
    return result;
  }
}
