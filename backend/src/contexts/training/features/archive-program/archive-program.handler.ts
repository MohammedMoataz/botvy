import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { ProgramRepository } from '../../domain/training.repositories.js';
import { ProgramNotFound } from '../update-program/update-program.handler.js';

/**
 * "Stop putting this into my weeks" — and nothing else (story 4 scenarios 3
 * and 4, FR-008).
 *
 * The materialiser consults a program only while it `isFilling`, which an
 * archived one is not, so the slots that follow stay and come up empty until
 * another program is applied. What archiving does **not** do is touch the
 * sessions it has already filled: the member can see those, may already have
 * edited them, and deleting content somebody is looking at is worse than
 * leaving it. There is a path that replaces content on purpose — applying
 * another program — and it warns first.
 *
 * `appliedStartDate` survives too, and that is not an oversight: clearing it
 * would make re-activating the program fill from week one instead of from the
 * week the member is actually in, and nobody said to forget when they started.
 * `Program`'s field comment carries the argument; this handler is the place a
 * reader arrives from, so it is restated rather than referenced.
 */
@Injectable()
export class ArchiveProgramHandler {
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

    // Already archived: answer with what is there. A retrying client must not
    // raise a second `ProgramArchived` for a state that has not changed.
    if (program.status === 'archived') return { updatedAt: program.updatedAt };

    program.archive(at);
    await this.uow.run(() => this.programs.save(program));
    return { updatedAt: program.updatedAt };
  }
}
