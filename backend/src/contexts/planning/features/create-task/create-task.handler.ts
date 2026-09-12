import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LabelRepository } from '../../domain/label.repository.js';
import type { RecurrenceRule } from '../../domain/recurrence.js';
import {
  Task,
  type Priority,
  type TaskSource,
} from '../../domain/task.aggregate.js';
import { TaskRepository } from '../../domain/task.repository.js';

export class InvalidTaskId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

export interface CreateTaskCommand {
  /** Minted by the client. See the class comment for why the server does not. */
  id: string;
  title: string;
  notes?: string | null;
  dueAt?: Date | null;
  allDay?: boolean;
  priority?: Priority;
  labelId?: string | null;
  recurrence?: RecurrenceRule | null;
  estimatedMinutes?: number | null;
  source?: TaskSource;
}

export interface CreateTaskResult {
  id: string;
  updatedAt: Date;
  /** True when this call created nothing because the task was already there. */
  replayed: boolean;
}

/**
 * A new task.
 *
 * **The client supplies the id, and a repeat of it is not an error.** The phone
 * creates tasks with no network and needs a stable reference before the server
 * has ever heard of the row, so the id is minted there. That makes a retry
 * after a dropped connection indistinguishable from a genuine second create —
 * unless the id decides it, which is exactly what it does here: an id that
 * already exists is answered as the create that already happened.
 *
 * That is what makes "sync without duplicates" a property of the protocol
 * rather than a matter of luck. A retried push costs nothing, so the client is
 * free to retry as often as it likes, which is the only way an offline queue
 * can be simple enough to be correct.
 *
 * The check is a read followed by a write and therefore racy in principle: two
 * simultaneous creates of one id could both see nothing. They cannot both
 * *win*, because `_id` is the primary key — the second write fails on it — and
 * the loser is a retry of a create that succeeded, which is the case this
 * handler already answers.
 */
@Injectable()
export class CreateTaskHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
    private readonly labels: LabelRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    command: CreateTaskCommand,
  ): Promise<CreateTaskResult> {
    if (!isUuid(command.id)) throw new InvalidTaskId(command.id);

    const existing = await this.tasks.findById(userId, command.id);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };
    }

    const { timezone } = await this.member.clock(userId);

    // The label's name and colour are snapshotted onto the task so a list
    // renders in one read. Resolved here rather than trusted from the client:
    // the phone may hold a label that was renamed while it was offline, and
    // writing its stale copy would show the old name until something else
    // happened to touch the row.
    const label = command.labelId
      ? await this.labels.findById(userId, command.labelId)
      : null;

    const now = new Date();
    const task = Task.schedule({
      id: command.id,
      userId,
      title: command.title,
      notes: command.notes ?? null,
      dueAt: command.dueAt ?? null,
      allDay: command.allDay ?? true,
      priority: command.priority ?? 4,
      // A label id naming a label that is gone becomes no label at all rather
      // than a dangling reference: the member deleted it, and a task pointing
      // at nothing renders as a blank chip.
      labelId: label && !label.isDeleted ? label.id : null,
      label: label && !label.isDeleted ? label.snapshot : null,
      recurrence: command.recurrence ?? null,
      estimatedMinutes: command.estimatedMinutes ?? null,
      source: command.source ?? 'app',
      createdAt: now,
      timezone,
    });

    await this.uow.run(() => this.tasks.save(task));
    return { id: task.id, updatedAt: task.updatedAt, replayed: false };
  }
}
