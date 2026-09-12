import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { LabelRepository } from '../../domain/label.repository.js';
import { LabelNotFound } from '../update-label/update-label.handler.js';

/**
 * A label removed.
 *
 * The tasks that carried it keep their own status and their own place in the
 * member's week — a label going away is not a task being finished. What they
 * lose is the chip, and that happens through `LabelDeleted` and the snapshot
 * handler rather than here, so a member deleting a label used on 400 tasks
 * waits for one write instead of 400.
 *
 * Tombstoned rather than removed, and the tombstone is what frees the name: the
 * aggregate unsets `nameLower` on delete and the unique index is partial on
 * that field existing, so the member can create "Work" again immediately while
 * the deletion still has time to reach every device.
 */
@Injectable()
export class DeleteLabelHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly labels: LabelRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const label = await this.labels.findById(userId, id);
    if (!label) throw new LabelNotFound(id);
    if (label.isDeleted) return { updatedAt: label.updatedAt };

    label.tombstone(at);
    await this.uow.run(() => this.labels.save(label));
    return { updatedAt: label.updatedAt };
  }
}
