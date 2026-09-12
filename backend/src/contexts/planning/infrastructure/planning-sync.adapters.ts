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
import { MemberContextPort } from '../../../shared/member/member-context.port.js';
import { Label } from '../domain/label.aggregate.js';
import { LabelRepository } from '../domain/label.repository.js';
import {
  Task,
  type Priority,
  type TaskSource,
} from '../domain/task.aggregate.js';
import { TaskRepository } from '../domain/task.repository.js';
import type { RecurrenceRule } from '../domain/recurrence.js';

/**
 * Planning's two adapters for the sync facade.
 *
 * They live in `infrastructure/` because that is the layer allowed to know
 * another context exists — the port they implement is the Sync context's. The
 * facade never learns what a task is; it sorts by `applyOrder` and calls
 * `apply`.
 *
 * `applyOrder` puts labels before tasks, and that is not a preference: a task
 * carries a snapshot of its label's name and colour, so applying tasks first
 * would let one name a label the same request is about to create.
 */

/** The conflict rule, applied identically by every row-shaped adapter. */
function refuse(
  entity: string,
  change: SyncChange,
  reason: 'stale' | 'gone' | 'not_deleted',
  server?: unknown,
): ApplyOutcome {
  return {
    applied: false,
    rejection: { entity, id: change.id, reason, server },
  };
}

@Injectable()
export class LabelSyncAdapter implements SyncableEntity {
  readonly entity = 'labels';
  readonly applyOrder = 10;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly labels: LabelRepository,
  ) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.labels.pullSince(userId, since);
    return rows.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      sortOrder: label.sortOrder,
      createdAt: label.createdAt,
      updatedAt: label.updatedAt,
      deletedAt: label.deletedAt,
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const existing = await this.labels.findById(userId, change.id);
    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return refuse(
        this.entity,
        change,
        verdict.reason as 'stale' | 'gone' | 'not_deleted',
        serverRow(existing),
      );
    }

    const fields = change.fields as {
      name?: string;
      color?: string;
      sortOrder?: number;
    };

    if (!existing) {
      const label = Label.create({
        id: change.id,
        userId,
        name: fields.name ?? 'Label',
        color: fields.color ?? '#475569',
        sortOrder: fields.sortOrder ?? 0,
        createdAt: change.updatedAt,
      });
      await this.uow.run(() => this.labels.save(label));
      return { applied: true, id: label.id };
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
        await this.uow.run(() => this.labels.remove(existing));
        return { applied: true, id: existing.id };
      default:
        existing.update(
          {
            name: fields.name,
            color: fields.color,
            sortOrder: fields.sortOrder,
          },
          now,
        );
    }

    await this.uow.run(() => this.labels.save(existing));
    return { applied: true, id: existing.id };
  }
}

@Injectable()
export class TaskSyncAdapter implements SyncableEntity {
  readonly entity = 'tasks';
  readonly applyOrder = 20;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
    private readonly labels: LabelRepository,
    private readonly member: MemberContextPort,
  ) {}

  async pull(userId: string, since: Date | null): Promise<unknown[]> {
    const rows = await this.tasks.pullSince(userId, since);
    return rows.map((task) => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      dueAt: task.dueAt,
      allDay: task.allDay,
      priority: task.priority,
      labelId: task.labelId,
      label: task.label,
      status: task.status,
      completedAt: task.completedAt,
      recurrence: task.recurrence,
      estimatedMinutes: task.estimatedMinutes,
      deferCount: task.deferCount,
      deferredFrom: task.deferredFrom,
      source: task.source,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
    }));
  }

  async apply(
    userId: string,
    change: SyncChange,
    now: Date,
  ): Promise<ApplyOutcome> {
    const existing = await this.tasks.findById(userId, change.id);
    const verdict = resolveConflict(change, existing, now);
    if (!verdict.accept) {
      return refuse(
        this.entity,
        change,
        verdict.reason as 'stale' | 'gone' | 'not_deleted',
        serverRow(existing),
      );
    }

    const { timezone } = await this.member.clock(userId);
    const fields = change.fields as {
      title?: string;
      notes?: string | null;
      dueAt?: string | Date | null;
      allDay?: boolean;
      priority?: Priority;
      labelId?: string | null;
      recurrence?: RecurrenceRule | null;
      estimatedMinutes?: number | null;
      source?: TaskSource;
    };

    // Re-resolved from the store rather than trusted from the client: a phone
    // that was offline may hold a label renamed since, and writing its stale
    // snapshot would show the old name until something else touched the row.
    const label =
      fields.labelId === undefined
        ? undefined
        : fields.labelId === null
          ? null
          : await this.labels.findById(userId, fields.labelId);
    const liveLabel = label && !label.isDeleted ? label : null;

    if (!existing) {
      const task = Task.schedule({
        id: change.id,
        userId,
        title: fields.title ?? 'Task',
        notes: fields.notes ?? null,
        dueAt: asDate(fields.dueAt),
        allDay: fields.allDay ?? true,
        priority: fields.priority ?? 4,
        labelId: liveLabel?.id ?? null,
        label: liveLabel?.snapshot ?? null,
        // `?? null` because a *create* has no previous value to leave alone:
        // `normaliseRecurrence` answers `undefined` for "the patch did not
        // mention it", which is meaningful on an edit and meaningless here.
        recurrence: normaliseRecurrence(fields.recurrence) ?? null,
        estimatedMinutes: fields.estimatedMinutes ?? null,
        source: fields.source ?? 'app',
        createdAt: change.updatedAt,
        timezone,
      });
      await this.uow.run(() => this.tasks.save(task));
      return { applied: true, id: task.id };
    }

    switch (change.op) {
      case 'delete':
        // The status is untouched, here as everywhere. It is the only record of
        // whether the task was completed, cancelled or never dealt with.
        if (!existing.isDeleted) existing.tombstone(now);
        break;
      case 'restore':
        if (existing.isDeleted) existing.restore(now);
        break;
      case 'purge':
        existing.assertPurgeable();
        await this.uow.run(() => this.tasks.remove(existing));
        return { applied: true, id: existing.id };
      default:
        existing.edit(
          {
            title: fields.title,
            notes: fields.notes,
            dueAt:
              fields.dueAt === undefined ? undefined : asDate(fields.dueAt),
            allDay: fields.allDay,
            priority: fields.priority,
            labelId:
              fields.labelId === undefined
                ? undefined
                : (liveLabel?.id ?? null),
            label:
              fields.labelId === undefined
                ? undefined
                : (liveLabel?.snapshot ?? null),
            recurrence:
              fields.recurrence === undefined
                ? undefined
                : normaliseRecurrence(fields.recurrence),
            estimatedMinutes: fields.estimatedMinutes,
          },
          timezone,
          now,
        );
        /*
         * A status change arriving through sync is applied as an *edit* and
         * nothing else, deliberately.
         *
         * A client that completed a task offline sends the row with
         * `status: 'completed'`. Calling `complete()` here would advance a
         * repeating task's recurrence a second time — the phone already
         * advanced it locally and is pushing the result — so the series would
         * jump two occurrences for one completion. The pushed row *is* the
         * outcome, so it is stored as such, and the phone's own local advance
         * is the authority on where the series went.
         */
        applyPushedStatus(
          existing,
          change.fields as {
            status?: string;
            completedAt?: string | Date | null;
          },
          now,
        );
    }

    await this.uow.run(() => this.tasks.save(existing));
    return { applied: true, id: existing.id };
  }
}

/**
 * Copies a pushed status onto the aggregate without re-running the transition.
 *
 * The aggregate's own `complete()` has side effects the phone has already
 * applied — advancing a recurrence, clearing a snooze — so replaying it here
 * would double them. This is the one place a status is written rather than
 * transitioned, and it is why: the client is not requesting a transition, it is
 * reporting one that has happened.
 */
function applyPushedStatus(
  task: Task,
  fields: { status?: string; completedAt?: string | Date | null },
  now: Date,
): void {
  if (
    fields.status !== 'open' &&
    fields.status !== 'completed' &&
    fields.status !== 'cancelled'
  ) {
    return;
  }
  if (task.status === fields.status) return;

  task.status = fields.status;
  task.completedAt =
    fields.status === 'completed' ? (asDate(fields.completedAt) ?? now) : null;
  task.updatedAt = now;
}

function normaliseRecurrence(
  recurrence: RecurrenceRule | null | undefined,
): RecurrenceRule | null | undefined {
  if (recurrence === undefined) return undefined;
  if (recurrence === null) return null;
  return {
    dtstart: new Date(recurrence.dtstart),
    rrule: recurrence.rrule,
    mode: recurrence.mode,
    exdates: (recurrence.exdates ?? []).map((value) => new Date(value)),
  };
}

function asDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * What a rejection carries back.
 *
 * The whole server row, because the client's obligation on a `stale` is to
 * overwrite its own copy with this and show the member the winner — and it can
 * only do that if the winner is in the response. A rejection that named the
 * conflict without carrying the row would have the phone ask again, get the
 * same refusal, and loop.
 */
function serverRow(
  existing: { updatedAt: Date; deletedAt: Date | null } | null,
): unknown {
  if (!existing) return null;
  return existing;
}
