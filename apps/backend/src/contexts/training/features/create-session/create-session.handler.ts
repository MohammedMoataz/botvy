import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Exercise } from '../../domain/set-entry.js';
import { Session } from '../../domain/session.aggregate.js';
import { SessionRepository } from '../../domain/training.repositories.js';

export class InvalidSessionId extends Error {
  constructor(id: string) {
    super(
      `"${id}" is not a UUID. The client mints the id, and it has to be a UUIDv7.`,
    );
  }
}

/**
 * A session the member adds by hand.
 *
 * **There is no `slotId` here and that omission is load-bearing**, which is why
 * the field is absent from the command rather than optional in it. A session
 * carrying a `slotId` belongs to the weekly timetable, and the materialiser's
 * reconcile is entitled to move it, refill it from a program, or remove it when
 * the slot goes (`SessionRepository.orphanedPlanned`). A session the member
 * typed is theirs: nothing in this context may rewrite it behind their back, and
 * the way that guarantee is enforced is by the row having no slot for the
 * reconcile's `keepSlotIds` filter to miss. An optional field would make the
 * guarantee a thing every caller had to remember to want.
 *
 * Same reasoning keeps `programId` and `weekIndex` out: those say "the
 * materialiser filled this from week 3 of that program", and only the
 * materialiser is in a position to say it.
 */
export interface CreateSessionCommand {
  /** Minted by the client, so an offline create has a reference at once. */
  id: string;
  plannedAt: Date;
  durationMin: number;
  sport: string;
  title: string;
  focus?: string | null;
  exercises?: Exercise[];
  notes?: string | null;
}

export interface CreateSessionResult {
  id: string;
  updatedAt: Date;
  /** True when this call created nothing because the session was already there. */
  replayed: boolean;
}

/**
 * One session, planned by the member (FR-004).
 *
 * **The client supplies the id, and a repeat of it is not an error.** The phone
 * plans sessions with no network and needs a stable reference before the server
 * has heard of the row, so the id is minted there — which makes a retry after a
 * dropped connection indistinguishable from a genuine second create unless the
 * id decides it. An id that already exists is answered as the create that
 * already happened, with no second `SessionScheduled` for the alert saga to
 * plan a duplicate reminder from.
 *
 * The read-then-write is racy in principle and cannot go wrong in practice:
 * `_id` is the primary key, so two simultaneous creates of one id cannot both
 * win, and the loser is a retry of a create that succeeded — which is the case
 * this handler already answers.
 *
 * `Session.plan` raises `SessionScheduled` itself, so the save goes inside
 * `uow.run` and the event reaches the outbox in the same transaction as the row.
 * Publishing after the save loses it on a crash, and its subscribers are the
 * alert pipeline and the rhythm's draft: a lost event is a session nobody is
 * reminded about, which is the exact shape of the defect P2 shipped.
 */
@Injectable()
export class CreateSessionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
  ) {}

  async handle(
    userId: string,
    command: CreateSessionCommand,
    at: Date = new Date(),
  ): Promise<CreateSessionResult> {
    if (!isUuid(command.id)) throw new InvalidSessionId(command.id);

    const existing = await this.sessions.findById(userId, command.id);
    if (existing) {
      return { id: existing.id, updatedAt: existing.updatedAt, replayed: true };
    }

    const session = Session.plan({
      id: command.id,
      userId,
      plannedAt: command.plannedAt,
      durationMin: command.durationMin,
      sport: command.sport,
      title: command.title,
      focus: command.focus ?? null,
      // See the command's note: a hand-made session belongs to no slot, no
      // program and no week, which is what keeps the materialiser away from it.
      programId: null,
      weekIndex: null,
      slotId: null,
      suggestionId: null,
      exercises: command.exercises ?? [],
      notes: command.notes ?? null,
      createdAt: at,
    });

    await this.uow.run(() => this.sessions.save(session));
    return { id: session.id, updatedAt: session.updatedAt, replayed: false };
  }
}
