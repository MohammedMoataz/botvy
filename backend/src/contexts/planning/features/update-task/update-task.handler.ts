import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LabelRepository } from '../../domain/label.repository.js';
import type { RecurrenceRule } from '../../domain/recurrence.js';
import type { Priority } from '../../domain/task.aggregate.js';
import { TaskRepository } from '../../domain/task.repository.js';

export class TaskNotFound extends Error {
  constructor(id: string) {
    super(`no task ${id}`);
  }
}

export interface UpdateTaskCommand {
  title?: string;
  notes?: string | null;
  dueAt?: Date | null;
  allDay?: boolean;
  priority?: Priority;
  labelId?: string | null;
  recurrence?: RecurrenceRule | null;
  estimatedMinutes?: number | null;
}

/**
 * An edit.
 *
 * One handler for every field a member can change, because a client sends the
 * editor as one form and the aggregate diffs it as one patch — and because the
 * event that comes out of it is one event. Splitting this into a handler per
 * field would have a member who moved a task and renamed it wake the alert
 * saga twice to plan the same set.
 *
 * The label is re-resolved here for the same reason `create-task` resolves it:
 * a phone that was offline may hold a label renamed since, and writing its copy
 * would show the old name.
 */
@Injectable()
export class UpdateTaskHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
    private readonly labels: LabelRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    id: string,
    command: UpdateTaskCommand,
  ): Promise<{ changed: string[]; updatedAt: Date }> {
    const task = await this.tasks.findById(userId, id);
    if (!task) throw new TaskNotFound(id);

    const { timezone } = await this.member.clock(userId);

    const patch: Parameters<typeof task.edit>[0] = { ...command };
    if (command.labelId !== undefined) {
      const label = command.labelId
        ? await this.labels.findById(userId, command.labelId)
        : null;
      const live = label && !label.isDeleted ? label : null;
      patch.labelId = live?.id ?? null;
      patch.label = live?.snapshot ?? null;
    }

    const changed = task.edit(patch, timezone);

    // Nothing moved, nothing saved, nothing announced. A client that re-sends
    // the form on every keystroke should not cost a write per keystroke.
    if (changed.length > 0) await this.uow.run(() => this.tasks.save(task));
    return { changed, updatedAt: task.updatedAt };
  }
}
