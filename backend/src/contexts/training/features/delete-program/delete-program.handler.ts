import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { ProgramRepository } from '../../domain/training.repositories.js';
import { ProgramNotFound } from '../update-program/update-program.handler.js';

/**
 * Off the member's list, as a tombstone.
 *
 * A tombstone rather than a removal for the two reasons every other deletable
 * row in this platform carries: a delta pull lists what changed, so a row that
 * simply vanished would reach no other device, and deletion is undoable within
 * `reminders.tombstoneDays`.
 *
 * **The status is untouched**, here as everywhere. `archived` against `active`
 * is the only record of whether the member had retired this program before they
 * deleted it, and the Deleted view exists to show exactly that. And the
 * sessions it already filled are left alone, the same as archiving leaves them:
 * they hold copies of the templates, so nothing in them points at a row that is
 * now a tombstone.
 */
@Injectable()
export class DeleteProgramHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly programs: ProgramRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date }> {
    const program = await this.programs.findById(userId, id);
    if (!program) throw new ProgramNotFound(id);

    // Already a tombstone: answer with what is there rather than moving the
    // deletion time, which would push the purge horizon further out on every
    // retry.
    if (program.isDeleted) return { updatedAt: program.updatedAt };

    program.tombstone(at);
    await this.uow.run(() => this.programs.save(program));
    return { updatedAt: program.updatedAt };
  }
}
