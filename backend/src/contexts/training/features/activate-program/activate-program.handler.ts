import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { ProgramRepository } from '../../domain/training.repositories.js';
import { ProgramNotFound } from '../update-program/update-program.handler.js';

/**
 * Out of the archive and filling again, from the date it was first applied.
 *
 * The undo of `archive-program`, and it needs its own command because
 * `apply-program` is not one: applying asks for a start date and warns about
 * what it would replace, where a member taking a program back out of their
 * archive has chosen neither a new date nor a rewrite of their week. Making
 * them re-apply would silently restart the plan at week one — which is exactly
 * the reason archiving leaves `appliedStartDate` alone.
 *
 * `Program.activate` raises nothing, and that is the right shape rather than an
 * omission: the materialiser reads `isFilling` on every pass, so the next one
 * picks the program up by itself. An event here would have to be
 * `ProgramApplied` — which restates a start date the member did not choose —
 * or a new one whose only consumer would do what the nightly pass already
 * does. The cost is that filling resumes on the next pass rather than within
 * the second, which for a plan measured in weeks is not a cost.
 */
@Injectable()
export class ActivateProgramHandler {
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

    if (program.status === 'active') return { updatedAt: program.updatedAt };

    program.activate(at);
    await this.uow.run(() => this.programs.save(program));
    return { updatedAt: program.updatedAt };
  }
}
