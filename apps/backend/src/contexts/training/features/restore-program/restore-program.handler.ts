import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { ProgramRepository } from '../../domain/training.repositories.js';
import { ProgramNotFound } from '../update-program/update-program.handler.js';

/**
 * Back from the Deleted view, with its status exactly as it was.
 *
 * An archived program restores archived. That reads oddly until you consider
 * the alternative: a restore that also reactivated would make the Deleted view
 * a trap, because recovering a plan the member had retired would silently start
 * filling their weeks from it again.
 */
@Injectable()
export class RestoreProgramHandler {
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
    if (!program.isDeleted) return { updatedAt: program.updatedAt };

    program.restore(at);
    await this.uow.run(() => this.programs.save(program));
    return { updatedAt: program.updatedAt };
  }
}
