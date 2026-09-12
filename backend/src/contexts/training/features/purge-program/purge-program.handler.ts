import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { ProgramRepository } from '../../domain/training.repositories.js';
import { ProgramNotFound } from '../update-program/update-program.handler.js';

/**
 * Erased — the member emptying their own Deleted view, one row at a time.
 *
 * Guarded: `assertPurgeable` refuses anything that is not already a tombstone,
 * because erasing a live row is data loss dressed as housekeeping and a client
 * asking for it has a bug. The refusal is `ProgramRuleError('not_deleted')`,
 * which the controller turns into a 409 and the sync facade into a
 * `not_deleted` rejection — one rule and one word for it, whichever door the
 * request came through.
 *
 * The horizon sweep's half of purging lives with the collection's own
 * `purgeTombstonesBefore`; this slice is only the member's deliberate erase.
 */
@Injectable()
export class PurgeProgramHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly programs: ProgramRepository,
  ) {}

  async handle(userId: string, id: string): Promise<void> {
    const program = await this.programs.findById(userId, id);
    if (!program) throw new ProgramNotFound(id);

    program.assertPurgeable();
    await this.uow.run(() => this.programs.remove(program));
  }
}
