import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  Program,
  type ProgramSource,
  type ProgramWeek,
} from '../../domain/program.aggregate.js';
import { ProgramRepository } from '../../domain/training.repositories.js';

export class InvalidProgramId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
    this.name = 'InvalidProgramId';
  }
}

export interface CreateProgramCommand {
  /** Minted by the client. See the class comment for why the server does not. */
  id: string;
  title: string;
  sport: string;
  weeks: ProgramWeek[];
  /**
   * Where it came from. `user` unless something else made it.
   *
   * `suggestion` and `link` arrive with P7, and the field is accepted now so
   * that phase adds a producer rather than a migration — but nothing in this
   * phase sends anything but `user`.
   */
  source?: ProgramSource;
  sourceLinkIds?: string[];
}

export interface CreateProgramResult {
  id: string;
  updatedAt: Date;
  /** True when this call created nothing because the program was already there. */
  replayed: boolean;
}

/**
 * A new program: weeks of session templates (FR-008, story 4).
 *
 * **The client supplies the id, and a repeat of it is not an error.** The phone
 * can build a program with no network, so the id is minted there and a retry
 * after a dropped connection is indistinguishable from a second create — unless
 * the id decides it, which is what happens here.
 *
 * The read-then-write is racy in principle and safe in practice for the reason
 * every other client-minted create in this codebase is: `_id` is the primary
 * key, so two simultaneous creates of one id cannot both win, and the loser is
 * a retry of a create that succeeded — the case this handler already answers.
 *
 * **Creating is not applying.** A program sits in the member's list doing
 * nothing until `apply-program` gives it a start date; that separation is what
 * lets the apply carry its replace warning (FR-008) instead of a create
 * silently rewriting the coming fortnight.
 */
@Injectable()
export class CreateProgramHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly programs: ProgramRepository,
  ) {}

  async handle(
    userId: string,
    command: CreateProgramCommand,
  ): Promise<CreateProgramResult> {
    if (!isUuid(command.id)) throw new InvalidProgramId(command.id);

    const existing = await this.programs.findById(userId, command.id);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };
    }

    const program = Program.create({
      id: command.id,
      userId,
      title: command.title,
      sport: command.sport,
      source: command.source ?? 'user',
      sourceLinkIds: command.sourceLinkIds ?? [],
      weeks: command.weeks,
      createdAt: new Date(),
    });

    await this.uow.run(() => this.programs.save(program));
    return { id: program.id, updatedAt: program.updatedAt, replayed: false };
  }
}
