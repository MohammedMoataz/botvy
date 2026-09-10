import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { TaskRepository } from '../../domain/task.repository.js';

interface LabelEventPayload {
  labelId?: string;
  name?: string;
  color?: string;
}

/**
 * Keeps the label chip on every task showing the label's current name and
 * colour.
 *
 * The snapshot is an Extended Reference: a task carries its label's name and
 * colour so a list of 200 tasks renders in one read instead of a read plus a
 * join. The cost of that choice is exactly this handler — a denormalised copy
 * has to be caught up when the original moves, and if nothing catches it up the
 * member renames a label and watches the old name stay on every task that has
 * it.
 *
 * **It is Planning reacting to Planning.** Both halves are in this context, so
 * the refresh is a direct repository call rather than a command dispatched to
 * somebody: there is no boundary here to respect. The event hop exists for a
 * different reason — the rename writes one row and returns, and the several
 * hundred tasks are brought up to date afterwards in one bulk write, so a
 * member who renames a heavily used label does not wait on a fan-out.
 *
 * **The write is silent.** `refreshLabelSnapshots` moves `label` and
 * `updatedAt` and raises nothing. `updatedAt` must move or the rename never
 * reaches the phone, which pulls by cursor; raising an event per task must not
 * happen, or recolouring one label would wake the alert planning saga several
 * hundred times to plan an identical set.
 */
@Injectable()
export class LabelSnapshotHandler {
  private readonly logger = new Logger(LabelSnapshotHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly tasks: TaskRepository,
  ) {}

  /** `planning.LabelUpdated` — the label was renamed, recoloured or reordered. */
  async onUpdated(event: DomainEvent): Promise<void> {
    const payload = (event.payload ?? {}) as LabelEventPayload;
    const { userId } = event;
    if (!userId || !payload.labelId || !payload.name || !payload.color) return;

    const touched = await this.uow.run(() =>
      this.tasks.refreshLabelSnapshots(
        userId,
        payload.labelId!,
        { name: payload.name!, color: payload.color! },
        event.occurredAt,
      ),
    );

    // Logged even at zero, because zero is the interesting number: a reorder
    // legitimately touches nothing, and so does a refresh that has silently
    // stopped matching any task. Without the line the second looks like the
    // first.
    this.logger.log(
      `label ${payload.labelId}: refreshed ${touched} task snapshot(s)`,
    );
  }

  /**
   * `planning.LabelDeleted` — clear the chip.
   *
   * `labelId` goes too, not just the snapshot. A task pointing at a label that
   * no longer exists is a dangling reference that renders as a blank chip and
   * makes the by-label view offer a group nothing can open; the tasks
   * themselves are untouched otherwise, because a label going away is not a
   * task being finished.
   */
  async onDeleted(event: DomainEvent): Promise<void> {
    const payload = (event.payload ?? {}) as LabelEventPayload;
    const { userId } = event;
    if (!userId || !payload.labelId) return;

    const touched = await this.uow.run(() =>
      this.tasks.refreshLabelSnapshots(
        userId,
        payload.labelId!,
        null,
        event.occurredAt,
      ),
    );
    this.logger.log(
      `label ${payload.labelId} deleted: cleared from ${touched} task(s)`,
    );
  }
}
