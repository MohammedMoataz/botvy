import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

export interface CompleteTaskResult {
  updatedAt: Date;
  /**
   * Where the series went, or null when the task is simply finished.
   *
   * The client shows a different thing for each: "done" for a one-off, and
   * "done — next Tuesday" for a series that has re-armed. Returning it saves
   * the client from re-deriving the rule to find out which happened.
   */
  recurrenceAdvancedTo: Date | null;
}

/**
 * Ticked off.
 *
 * The interesting case is the repeating one, and the aggregate owns it: a
 * repeating task closes this occurrence and moves its own `dueAt` to the next,
 * on the same document, rather than becoming a completed row plus a new one.
 * One row per series is the blueprint's rule — materialising an occurrence per
 * repeat multiplies what the phone has to sync and makes "skip one" ambiguous.
 *
 * Which moment the next occurrence is measured from is the whole difference
 * between the two recurrence modes; `Recurrence` explains it where it is
 * decided.
 */
@Injectable()
export class CompleteTaskHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<CompleteTaskResult> {
    const task = await this.tasks.findById(userId, id);
    if (!task) throw new TaskNotFound(id);

    const { timezone } = await this.member.clock(userId);
    const recurrenceAdvancedTo = task.complete(timezone, at);

    await this.uow.run(() => this.tasks.save(task));
    return { updatedAt: task.updatedAt, recurrenceAdvancedTo };
  }
}
