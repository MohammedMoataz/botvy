import { Injectable } from '@nestjs/common';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { Program } from '../../domain/program.aggregate.js';
import {
  programWeekIndex,
  slotOccurrencesWithin,
} from '../../domain/slot-calendar.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
} from '../../domain/training.repositories.js';
import { ProgramNotFound } from '../update-program/update-program.handler.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidStartDate extends Error {
  constructor(value: string) {
    super(
      `"${value}" is not a local date. A program starts on a day in the member's own calendar, like "2026-09-14".`,
    );
    this.name = 'InvalidStartDate';
  }
}

export interface ApplyProgramCommand {
  /**
   * `YYYY-MM-DD` in the **member's** zone, and a date rather than an instant.
   *
   * Week one begins on a day the member picked out of their own calendar, and
   * "the fourteenth" is not an instant: sent as one it would arrive shifted by
   * whatever the sending device's clock happened to be, and every subsequent
   * week index — computed days or weeks later by the materialiser — would be
   * off by that shift for the life of the program.
   */
  startDate: string;
  /** Agreed to replace the planned content the answer listed. */
  force?: boolean;
}

/** One session the apply would overwrite, as the warning dialog reads it. */
export interface WouldReplaceEntry {
  sessionId: string;
  plannedAt: Date;
  title: string;
}

/**
 * What the command did, and what it would have done instead.
 *
 * `wouldReplace` is populated on **both** answers, which is the point: on a
 * refusal it is the list the member is being asked about, and on a success it
 * is the receipt of what they agreed to. A shape that carried the list only on
 * the refusal would leave the client with nothing to show afterwards.
 */
export interface ApplyProgramResult {
  applied: boolean;
  wouldReplace: WouldReplaceEntry[];
}

/**
 * Applying a program: record where week one starts, and say what that costs
 * (FR-008, story 4 scenario 2).
 *
 * ## This command does not fill a single session, deliberately
 *
 * It writes `appliedStartDate` and raises `training.ProgramApplied`; the
 * materialiser does the filling, on the way past. `Program`'s own class comment
 * has the full argument and it is worth restating the half that decides the
 * shape of this file: filling here would fill the fortnight the horizon can
 * see and silently drop week four of a four-week program. Filling as the
 * horizon advances means week four arrives on the day the horizon reaches it —
 * which is FR-008's second sentence, and the only reason `appliedStartDate` is
 * stored rather than resolved into week indices once.
 *
 * So the arithmetic below is **not** a copy of the fill. It exists to answer
 * one question: which sessions that already exist would the materialiser
 * overwrite if this apply went through? That is the member's question, and it
 * has to be answered before anything is written.
 *
 * ## Two kinds of content, and only one of them is replaceable
 *
 * `Session.isUntouched` is the predicate, and it reads the `actual*` fields,
 * `done`, the notes and the status — never the targets. A session full of
 * targets is a *plan*, and replacing a plan is what applying a program is for;
 * a session with one actual rep or one note in it is a *record*, and FR-008
 * says those are never overwritten. So a logged session is neither listed nor
 * replaced: it does not appear in `wouldReplace` at all, because a warning
 * naming something that is in fact safe teaches the member to dismiss warnings.
 */
@Injectable()
export class ApplyProgramHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly programs: ProgramRepository,
    private readonly profiles: AthleteProfileRepository,
    private readonly sessions: SessionRepository,
    private readonly member: MemberContextPort,
  ) {}

  async handle(
    userId: string,
    programId: string,
    command: ApplyProgramCommand,
    now: Date = new Date(),
  ): Promise<ApplyProgramResult> {
    if (!LOCAL_DATE.test(command.startDate)) {
      throw new InvalidStartDate(command.startDate);
    }

    const program = await this.programs.findById(userId, programId);
    // A tombstone reads as absent to this command, and only to this one:
    // `restore-program` and `purge-program` exist precisely to operate on one.
    // Applying a plan out of the Deleted view would start filling the member's
    // weeks from a program they cannot see — and `applyFrom` would not refuse
    // it, because deletion is not a status.
    if (!program || program.isDeleted) throw new ProgramNotFound(programId);

    /*
     * The archived refusal is the aggregate's, and it is taken first: a member
     * re-applying something out of their archive needs to be told to make it
     * active, not handed a list of sessions that a program which cannot fill
     * anything would supposedly replace. `applyFrom` throws before it touches a
     * field.
     *
     * It is called here, ahead of the `force` decision, and the aggregate is
     * simply dropped when the answer turns out to be a refusal. That is safe
     * rather than clever: events reach the outbox when the repository saves
     * them, so an aggregate that is never saved has written nothing and
     * announced nothing.
     */
    program.applyFrom(command.startDate, now);

    const wouldReplace = await this.gather(
      userId,
      program,
      command.startDate,
      now,
    );

    if (wouldReplace.length > 0 && command.force !== true) {
      return { applied: false, wouldReplace };
    }

    await this.uow.run(() => this.programs.save(program));
    return { applied: true, wouldReplace };
  }

  /**
   * The sessions this apply would overwrite.
   *
   * ## Why the ids are derived rather than searched for
   *
   * A slot's session has the id `uuidv5(userId:slotId:localDate)`, which
   * `slotOccurrencesWithin` already computes — so the set of rows the
   * materialiser will upsert over is *nameable* without a calendar query, and
   * one `findMany` says which of them exist. The alternative, reading every
   * session in the window and guessing which ones belong to a slot, would also
   * pick up the sessions the member made by hand: those carry no `slotId`, the
   * materialiser never fills them, and warning about them would be a warning
   * about content that is not at risk.
   *
   * ## Three filters, each removing a false warning
   *
   * - **A week the program does not have** cannot be filled, so it cannot be
   *   replaced — this is how a program shorter than the weeks remaining simply
   *   ends (the spec's edge case) rather than blanking the slots that follow.
   * - **A moment already past** cannot be filled either: the materialiser never
   *   touches the past, so a `startDate` behind today warns only about the days
   *   still to come.
   * - **A session that is not untouched** is a record, and records are never
   *   overwritten. Which includes a completed, cancelled or skipped one: the
   *   status alone is the member's statement about that day.
   */
  private async gather(
    userId: string,
    program: Program,
    startDate: string,
    now: Date,
  ): Promise<WouldReplaceEntry[]> {
    const profile = await this.profiles.find(userId);
    // No timetable, nothing to fill and nothing to replace. Story 1 scenario 3
    // is the same absence read on a screen; here it is simply an empty answer.
    if (!profile || profile.slots.length === 0) return [];

    const { timezone } = await this.member.clock(userId);

    const occurrences = slotOccurrencesWithin(
      userId,
      profile.slots,
      startDate,
      // The program's own span, so the window is as long as the plan and no
      // longer. Beyond the materialisation horizon no session exists yet, so
      // those occurrences cost one entry in an id list and answer nothing —
      // which is the correct answer: there is nothing there to replace.
      program.weeks.length * 7,
      timezone,
    );

    const atRisk = occurrences.filter((occurrence) => {
      if (occurrence.plannedAt.getTime() <= now.getTime()) return false;
      const weekIndex = programWeekIndex(startDate, occurrence.date);
      if (weekIndex === null) return false;
      return program.weeks.some((week) => week.index === weekIndex);
    });

    if (atRisk.length === 0) return [];

    const existing = await this.sessions.findMany(
      userId,
      atRisk.map((occurrence) => occurrence.id),
    );

    return existing
      .filter((session) => !session.isDeleted && session.isUntouched)
      .sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime())
      .map((session) => ({
        sessionId: session.id,
        plannedAt: session.plannedAt,
        title: session.title,
      }));
  }
}
