import { Injectable } from '@nestjs/common';
import {
  resolveConflict,
  type SyncChange,
} from '../../../shared/persistence/ports/sync-change.js';
import { UnitOfWork } from '../../../shared/persistence/ports/unit-of-work.js';
import type {
  ApplyOutcome,
  SyncableEntity,
} from '../../sync/domain/syncable-entity.port.js';
import {
  Reminder,
  type ReminderSource,
  type ReminderStatus,
} from '../domain/reminder.aggregate.js';
import { ReminderRepository } from '../domain/reminder.repository.js';

/**
 * Reminders' adapter for the sync facade.
 *
 * `applyOrder` 30 — after labels and tasks, though nothing depends on it:
 * reminders have no parent. Ordered anyway so the sequence is deterministic
 * and a later entity that *does* depend on something has a number to sit
 * between.
 */
@Injectable()
export class ReminderSyncAdapter implements SyncableEntity {
  readonly entity = 'reminders';
  readonly applyOrder = 30;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly reminders: ReminderRepository,
  ) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.reminders.pullSince(userId, since);
    return rows.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      remindAt: reminder.remindAt,
      leadTimes: reminder.leadTimes,
      status: reminder.status,
      snoozedUntil: reminder.snoozedUntil,
      source: reminder.source,
      createdAt: reminder.createdAt,
      updatedAt: reminder.updatedAt,
      deletedAt: reminder.deletedAt,
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const existing = await this.reminders.findById(userId, change.id);
    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return {
        applied: false,
        rejection: {
          entity: this.entity,
          id: change.id,
          reason: verdict.reason,
          server: existing ?? null,
        },
      };
    }

    const fields = change.fields as {
      title?: string;
      remindAt?: string | Date;
      leadTimes?: string[];
      status?: ReminderStatus;
      snoozedUntil?: string | Date | null;
      source?: ReminderSource;
    };

    if (!existing) {
      /*
       * A create pushed from offline is the one place the past-moment rule is
       * relaxed, and the relaxation is deliberate.
       *
       * The interactive path refuses a `remindAt` already behind the member's
       * clock, because moving a moment they chose is the silent shift
       * principle XI forbids. But a reminder created on a plane for 18:00 and
       * pushed at 21:00 is not the member asking for something impossible — it
       * is the member's own past intention arriving late, and refusing it
       * throws away work they did.
       *
       * So `now` is taken as the moment itself when it has passed, which
       * satisfies the aggregate's guard without moving anything the member will
       * ever see: the sweep expires an alert this old on its next pass, so the
       * row lands in the member's Overdue list, which is exactly where a
       * reminder they missed belongs.
       */
      const remindAt = asDate(fields.remindAt) ?? change.updatedAt;
      const reminder = Reminder.schedule(
        {
          id: change.id,
          userId,
          title: fields.title ?? 'Reminder',
          remindAt,
          leadTimes: fields.leadTimes ?? [],
          source: fields.source ?? 'app',
          createdAt: change.updatedAt,
        },
        // A `now` just before the moment, so a legitimately-past offline create
        // is accepted rather than refused.
        new Date(Math.min(now.getTime(), remindAt.getTime() - 1)),
      );
      applyPushedStatus(reminder, fields, now);
      await this.uow.run(() => this.reminders.save(reminder));
      return { applied: true, id: reminder.id };
    }

    switch (change.op) {
      case 'delete':
        if (!existing.isDeleted) existing.tombstone(now);
        break;
      case 'restore':
        if (existing.isDeleted) existing.restore(now);
        break;
      case 'purge':
        existing.assertPurgeable();
        await this.uow.run(() => this.reminders.remove(existing));
        return { applied: true, id: existing.id };
      default: {
        const remindAt = asDate(fields.remindAt);
        existing.edit(
          {
            title: fields.title,
            remindAt: remindAt ?? undefined,
            leadTimes: fields.leadTimes,
          },
          // Same relaxation as above, for the same reason: an edit made offline
          // is the member's past intention, not a request for the impossible.
          remindAt
            ? new Date(Math.min(now.getTime(), remindAt.getTime() - 1))
            : now,
          now,
        );
        applyPushedStatus(existing, fields, now);
      }
    }

    await this.uow.run(() => this.reminders.save(existing));
    return { applied: true, id: existing.id };
  }
}

/**
 * A pushed status and snooze written rather than transitioned.
 *
 * The same reasoning as the task adapter's: the client is not asking for a
 * transition, it is reporting one it already made. Calling `complete()` or
 * `snooze()` here would re-run their side effects — and `snooze()` in
 * particular would refuse a `snoozedUntil` that has since passed, rejecting a
 * push the member made an hour ago on a train.
 */
function applyPushedStatus(
  reminder: Reminder,
  fields: { status?: ReminderStatus; snoozedUntil?: string | Date | null },
  now: Date,
): void {
  if (fields.snoozedUntil !== undefined) {
    reminder.snoozedUntil = asDate(fields.snoozedUntil);
    reminder.updatedAt = now;
  }

  if (
    fields.status === 'active' ||
    fields.status === 'done' ||
    fields.status === 'cancelled'
  ) {
    if (reminder.status !== fields.status) {
      reminder.status = fields.status;
      reminder.updatedAt = now;
    }
  }
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
