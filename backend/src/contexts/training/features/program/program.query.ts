import { Injectable } from '@nestjs/common';
import { ProgramRepository } from '../../domain/training.repositories.js';
import { programView, type ProgramView } from '../programs/programs.query.js';

/**
 * One program by id, for the detail screen (story 4).
 *
 * It answers null rather than throwing: a member opening a deep link to a
 * program they have since deleted on another device is not an error, and a
 * query that threw would make the client's empty state an error handler. The
 * write side is where "no program <id>" is a refusal, because there a member is
 * trying to change something that is not there.
 *
 * A tombstone reads as absent for the same reason it does everywhere else in
 * this context: it is off the member's list. The Deleted view is served by the
 * sync channel, which carries tombstones deliberately.
 */
@Injectable()
export class ProgramQueryHandler {
  constructor(private readonly programs: ProgramRepository) {}

  async byId(userId: string, id: string): Promise<ProgramView | null> {
    const program = await this.programs.findById(userId, id);
    if (!program || program.isDeleted) return null;
    return programView(program);
  }
}
