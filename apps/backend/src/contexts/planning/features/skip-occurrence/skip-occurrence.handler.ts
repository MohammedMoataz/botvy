import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { TaskNotFound } from '../update-task/update-task.handler.js';

/**
 * "Not this one."
 *
 * The occurrence joins the rule's exception list and the series moves to the
 * one after it. An *exception*, not an edit — which is what keeps the series
 * intact: a member who skips next Tuesday still has a task every Tuesday, and
 * the rule still says so.
 *
 * The alternative, moving `dtstart` forward, would silently redefine what the
 * member asked for: skip one Tuesday in a weekly series and you would have
 * moved every future Tuesday, which is not what "skip" means anywhere else in
 * software.
 */
@Injectable()
export class SkipOccurrenceHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    id: string,
    occurrence: Date,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date; dueAt: Date | null }> {
    const task = await this.tasks.findById(userId, id);
    if (!task) throw new TaskNotFound(id);

    const { timezone } = await this.member.clock(userId);
    const dueAt = task.skipOccurrence(occurrence, timezone, at);

    await this.uow.run(() => this.tasks.save(task));
    return { updatedAt: task.updatedAt, dueAt };
  }
}
