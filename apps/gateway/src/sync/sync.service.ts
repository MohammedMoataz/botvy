import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { CoachingService } from '../coaching/coaching.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { PushedReminderDto, SyncRequestDto } from './dto.js';

/**
 * The cursor handed back is deliberately behind real time.
 *
 * A transaction that began before the pull queries ran and commits just after
 * them carries an `updatedAt` earlier than the cursor, so the next
 * `updatedAt > since` would skip it forever. Lagging the cursor makes a few
 * rows arrive twice instead; every apply on the device is an upsert by id, so
 * a duplicate costs nothing and a missed row costs everything. Do not "tidy"
 * this away — there is a test asserting the lag exists.
 */
const OVERLAP_MS = 5_000;

/** A full snapshot never ships an entire chat history in one response. */
const MESSAGE_PAGE = 200;

export interface RejectedPush {
  entity: 'reminder';
  id: string;
  clientId?: string;
  reason: 'stale' | 'gone';
  /** The authoritative row. The device overwrites its copy with this. */
  server: unknown;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    private readonly coaching: CoachingService,
    private readonly settings: SettingsService,
  ) {}

  async sync(userId: string, request: SyncRequestDto) {
    // Two different clocks, and mixing them up rejects honest edits: `realNow`
    // is the ceiling a lying client is clamped to, `cursor` is the lagged
    // watermark handed back for the next pull. Clamping to the lagged value
    // would reject every edit made in the last OVERLAP_MS.
    const realNow = new Date();
    const cursor = new Date(realNow.getTime() - OVERLAP_MS);
    const since = await this.usableCursor(request.since, cursor);
    const full = since === null;

    const rejected: RejectedPush[] = [];
    for (const push of request.push?.reminders ?? []) {
      const outcome = await this.applyReminder(userId, push, realNow);
      if (outcome) rejected.push(outcome);
    }

    if (request.push?.profile) {
      // No conflict check: the columns a client may write and the columns the
      // nightly tick writes are disjoint sets, so they cannot collide. A
      // timestamp comparison here would instead read the tick's twice-daily
      // bump as a conflict and reject legitimate offline edits.
      await this.coaching.upsertProfile(userId, { ...request.push.profile });
    }

    const pull = await this.pull(userId, since, request.lastMessageId ?? 0);
    await this.touchDevice(request.installId, userId, cursor);

    return {
      now: cursor.toISOString(),
      lastMessageId: pull.messages.at(-1)?.id ?? request.lastMessageId ?? 0,
      full,
      pull,
      rejected,
    };
  }

  /**
   * A cursor older than the tombstone horizon cannot be honoured: deletions
   * from before it have been purged, so a delta would silently resurrect them
   * on the device. Fall back to a full snapshot instead.
   */
  private async usableCursor(since: Date | undefined, now: Date): Promise<Date | null> {
    if (!since) return null;
    const days = await this.settings.get('reminders.tombstoneDays');
    const horizon = new Date(now.getTime() - days * 86_400_000);
    if (since < horizon) {
      this.logger.log(`cursor ${since.toISOString()} is past the horizon — sending a full snapshot`);
      return null;
    }
    return since;
  }

  private async pull(userId: string, since: Date | null, lastMessageId: number) {
    const changed = since ? { gt: since } : undefined;

    const [reminders, profile, checkins, workouts, messages] = await Promise.all([
      this.prisma.reminder.findMany({
        // Tombstones are included on purpose — a deletion reaches the device
        // as a row carrying deletedAt, which is the only way a delta can
        // express one.
        where: { userId, ...(changed ? { updatedAt: changed } : {}) },
        include: { notifications: true },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.coachingProfile.findFirst({
        where: { userId, ...(changed ? { updatedAt: changed } : {}) },
      }),
      this.prisma.checkIn.findMany({
        where: { userId, ...(changed ? { updatedAt: changed } : {}) },
        orderBy: { checkinDate: 'desc' },
      }),
      this.prisma.workoutRecord.findMany({
        where: { userId, ...(changed ? { updatedAt: changed } : {}) },
        orderBy: { workoutDate: 'desc' },
      }),
      this.prisma.message.findMany({
        // Messages are append-only with immutable content, so the
        // autoincrement id is a cheaper cursor than another timestamp column.
        where: { userId, id: { gt: lastMessageId } },
        orderBy: { id: 'asc' },
        take: MESSAGE_PAGE,
      }),
    ]);

    return { reminders, profile, checkins, workouts, messages };
  }

  /**
   * Applies one pushed reminder. Returns a rejection when the server's copy
   * wins, so the device can replace its own rather than retry forever.
   */
  private async applyReminder(
    userId: string,
    push: PushedReminderDto,
    now: Date,
  ): Promise<RejectedPush | null> {
    if (!push.id) {
      // Created offline. The clientId lookup inside create() is what makes a
      // retry return the same row instead of a second reminder.
      await this.reminders.create(userId, {
        title: push.title ?? 'Reminder',
        remindAt: push.remindAt ?? now,
        leadTimes: push.leadTimes,
        clientId: push.clientId,
      });
      return null;
    }

    const row = await this.prisma.reminder.findFirst({ where: { id: push.id, userId } });
    if (!row) {
      return { entity: 'reminder', id: push.id, clientId: push.clientId, reason: 'gone', server: null };
    }

    if (!this.clientWins(push, row.updatedAt, now)) {
      return { entity: 'reminder', id: push.id, clientId: push.clientId, reason: 'stale', server: row };
    }

    if (push.deleted) {
      await this.reminders.remove(userId, push.id);
      return null;
    }

    await this.reminders.update(userId, push.id, {
      title: push.title,
      remindAt: push.remindAt,
      leadTimes: push.leadTimes,
      status: push.status,
    });
    return null;
  }

  /**
   * Newest edit wins — but the device clock is only consulted when it has to be.
   *
   * When the row has not moved since this device last saw it, the edit is
   * uncontested and is accepted outright; that is the ordinary case and it
   * trusts no clock at all. Only a genuine concurrent edit falls through to a
   * comparison, and the claimed time is clamped so a handset set to 2099
   * cannot win every conflict for the rest of its life.
   *
   * [realNow] is real server time, never the lagged cursor: clamping to the
   * cursor would push every honest edit made in the last OVERLAP_MS below a
   * row the server had just touched, and reject it.
   */
  private clientWins(push: PushedReminderDto, serverUpdatedAt: Date, realNow: Date): boolean {
    if (push.baseUpdatedAt && push.baseUpdatedAt.getTime() === serverUpdatedAt.getTime()) {
      return true;
    }
    const claimed = Math.min(push.updatedAt.getTime(), realNow.getTime());
    return claimed >= serverUpdatedAt.getTime();
  }

  /**
   * Marks how much of the world this device now holds. The sweep compares this
   * against a ping's creation time to decide whether the phone already has a
   * local alarm for it, so it is set to the same instant as the cursor: the two
   * mean the same thing.
   */
  private async touchDevice(installId: string | undefined, userId: string, now: Date) {
    if (!installId) return;
    await this.prisma.device.updateMany({
      where: { installId, userId },
      data: { lastSeenAt: now },
    });
  }
}
