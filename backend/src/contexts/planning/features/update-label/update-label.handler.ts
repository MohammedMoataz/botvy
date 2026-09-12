import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LabelRepository } from '../../domain/label.repository.js';
import { DuplicateLabelName } from '../create-label/create-label.handler.js';

export class LabelNotFound extends Error {
  constructor(id: string) {
    super(`no label ${id}`);
  }
}

export interface UpdateLabelCommand {
  name?: string;
  color?: string;
  sortOrder?: number;
}

/**
 * Rename, recolour, reorder.
 *
 * The event it raises is what refreshes the snapshot embedded on every task
 * carrying this label — see `label-snapshot`. That indirection is deliberate:
 * the rename writes one row, and the several hundred tasks that show the label
 * are caught up by a handler reacting to the event, in one bulk write, rather
 * than by this handler doing a fan-out inline while the member waits.
 */
@Injectable()
export class UpdateLabelHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly labels: LabelRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    command: UpdateLabelCommand,
  ): Promise<{ changed: string[]; updatedAt: Date }> {
    const label = await this.labels.findById(userId, id);
    if (!label) throw new LabelNotFound(id);

    if (command.name !== undefined) {
      const clash = await this.labels.findByName(userId, command.name);
      // Renaming a label to what it is already called is not a clash with
      // itself. Without the id comparison, saving the editor without touching
      // the name would refuse.
      if (clash && clash.id !== label.id)
        throw new DuplicateLabelName(command.name);
    }

    const changed = label.update(command);
    if (changed.length > 0) await this.uow.run(() => this.labels.save(label));
    return { changed, updatedAt: label.updatedAt };
  }
}
