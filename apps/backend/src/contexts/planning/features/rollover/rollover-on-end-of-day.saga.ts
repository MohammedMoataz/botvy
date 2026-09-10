import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { wallClockToUtc } from '../../../../shared/time/time.js';
import { TaskRepository } from '../../domain/task.repository.js';
import { RolloverHandler } from './rollover.handler.js';

/**
 * Tasks the member did not finish today, carried to the plan that was just set.
 *
 * Planning reacting to `rhythm.EndOfDaySummarySent`. It is a *reaction to an
 * event* rather than the rhythm calling a Planning command, and that is
 * constitution IX read carefully: a handler that dispatched another context's
 * command would be the same violation wearing a bus. The rhythm announces that
 * tomorrow's plan is set; the context that owns tasks decides what that means
 * for tasks.
 *
 * ## Only what was actually left behind
 *
 * The event's `taskIds` are the whole plan — which includes things genuinely
 * due tomorrow that nobody has failed to do yet. Deferring one of those would
 * increment its `deferCount` for a day it was never carried, and that count is
 * what the *next* evening's proposal prints as "carried over ×3". So the filter
 * is "open, and due before tomorrow began", and tomorrow's boundary is resolved
 * against the member's own zone — the plan's `date` is their local date, and
 * reading it as the server's midnight would put a Cairo member's boundary two
 * hours into their evening.
 *
 * ## Idempotent, because the relay is at-least-once
 *
 * `defer` moves a task's `dueAt` *to* tomorrow's boundary, so a task already
 * deferred by a first delivery no longer matches "due before tomorrow" and the
 * second delivery skips it. That is the whole de-duplication: not a guard on
 * `eventId`, but a filter whose predicate the operation itself falsifies. Worth
 * stating because it is fragile in one specific way — if `defer` ever moved a
 * task to *noon* tomorrow instead of the day boundary, the predicate would
 * still be false and this would still be idempotent; if it moved it to the end
 * of *today*, it would not be.
 */
@Injectable()
export class RolloverOnEndOfDaySaga {
  private readonly logger = new Logger(RolloverOnEndOfDaySaga.name);

  constructor(
    private readonly tasks: TaskRepository,
    private readonly rollover: RolloverHandler,
    private readonly member: MemberContextPort,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const userId = event.userId;
    const payload = event.payload as { date?: string; taskIds?: string[] };
    if (!userId || !payload.date) return;

    const ids = payload.taskIds ?? [];
    if (ids.length === 0) return;

    const { timezone } = await this.member.clock(userId);
    const tomorrowStart = wallClockToUtc(`${payload.date}T00:00`, timezone);
    if (!tomorrowStart) {
      // An unreadable zone or date. Doing nothing is right: the alternative is
      // guessing a boundary and moving the member's tasks to a day nobody
      // chose.
      this.logger.warn(
        `could not resolve ${payload.date} in ${timezone} for ${userId}; no rollover`,
      );
      return;
    }

    const found = await this.tasks.findMany(userId, ids);
    const leftBehind = found
      .filter(
        (task) =>
          !task.isDeleted &&
          task.status === 'open' &&
          task.dueAt !== null &&
          task.dueAt.getTime() < tomorrowStart.getTime(),
      )
      .map((task) => task.id);

    if (leftBehind.length === 0) return;

    const result = await this.rollover.handle(
      userId,
      leftBehind,
      tomorrowStart,
      event.occurredAt,
    );

    this.logger.log(
      `carried ${result.moved.length} task(s) into ${payload.date} for ${userId}` +
        (result.skipped.length > 0 ? `; ${result.skipped.length} skipped` : ''),
    );
  }
}
