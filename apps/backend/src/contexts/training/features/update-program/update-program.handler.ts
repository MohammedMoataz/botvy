import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { ProgramWeek } from '../../domain/program.aggregate.js';
import { ProgramRepository } from '../../domain/training.repositories.js';

export class ProgramNotFound extends Error {
  constructor(id: string) {
    super(`no program ${id}`);
    this.name = 'ProgramNotFound';
  }
}

export interface UpdateProgramCommand {
  title?: string;
  sport?: string;
  /**
   * The whole plan, replaced.
   *
   * Not a per-week or per-template patch, and for the same reason the athlete
   * profile replaces its whole timetable: the editor arranges the program and
   * saves it, so a partial protocol would need its own vocabulary for "this
   * week, changed" against "this week, gone" — and the aggregate would have to
   * carry both. What keeps the sessions already filled from noticing is that
   * they hold *copies* of the templates, not references to them.
   */
  weeks?: ProgramWeek[];
}

/**
 * Editing the plan itself (FR-008).
 *
 * It changes nothing about the weeks the member can already see. A session the
 * materialiser filled from this program holds copies of its exercises, so
 * rewriting week two here reaches only the sessions that week two has yet to
 * fill — which is the same rule archiving states more loudly, and the reason
 * neither operation has to hunt through the calendar.
 *
 * No event. `ProgramApplied` is what the materialiser reacts to, and an edit is
 * not an apply: the start date has not moved, so the next pass reads the new
 * weeks off the stored document by itself. Raising something here would either
 * be a consumer-less event or a second apply the member never asked for.
 */
@Injectable()
export class UpdateProgramHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly programs: ProgramRepository,
  ) {}

  async handle(
    userId: string,
    id: string,
    command: UpdateProgramCommand,
    at: Date = new Date(),
  ): Promise<{ updatedAt: Date; changed: string[] }> {
    const program = await this.programs.findById(userId, id);
    if (!program) throw new ProgramNotFound(id);

    const changed = program.edit(command, at);
    // Nothing moved: no write, so a retrying client cannot walk `updatedAt`
    // forward and make every other device pull a row that says the same thing.
    if (changed.length === 0) {
      return { updatedAt: program.updatedAt, changed };
    }

    await this.uow.run(() => this.programs.save(program));
    return { updatedAt: program.updatedAt, changed };
  }
}
