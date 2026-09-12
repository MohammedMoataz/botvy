import { beforeEach, describe, expect, it } from 'vitest';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { AthleteProfile } from './domain/athlete-profile.aggregate.js';
import type { TrainingSlot } from './domain/athlete-profile.aggregate.js';
import type { ProgramWeek } from './domain/program.aggregate.js';
import { Session } from './domain/session.aggregate.js';
import type { Exercise } from './domain/set-entry.js';
import { addDays, isoWeekday, slotSessionId } from './domain/slot-calendar.js';
import { ApplyProgramHandler } from './features/apply-program/apply-program.handler.js';
import { ApplyWorkoutToSessionHandler } from './features/apply-workout-to-session/apply-workout-to-session.handler.js';
import { ArchiveProgramHandler } from './features/archive-program/archive-program.handler.js';
import { ActivateProgramHandler } from './features/activate-program/activate-program.handler.js';
import { CreateProgramHandler } from './features/create-program/create-program.handler.js';
import { CreateWorkoutHandler } from './features/create-workout/create-workout.handler.js';
import { ProgramsQueryHandler } from './features/programs/programs.query.js';
import { UpdateProgramHandler } from './features/update-program/update-program.handler.js';
import {
  InMemoryAthleteProfileRepository,
  InMemoryProgramRepository,
  InMemorySessionRepository,
  InMemoryWorkoutRepository,
} from './infrastructure/in-memory-training.repositories.js';

/**
 * Programs and the workout library: what applying costs, and what archiving
 * leaves alone.
 *
 * ## Every calendar here is built from `Date.now()`
 *
 * The plan asks for it in three places and this codebase has been bitten by the
 * alternative: a fixture carrying a written date passes until the day the clock
 * reaches it, and an apply whose `startDate` has slipped into the past stops
 * warning about anything, because the materialiser never touches the past. So
 * the start date is "the next occurrence of a weekday computed from today", and
 * nothing below contains a literal date. `Africa/Cairo` is the fixed test zone
 * the plan names.
 *
 * ## The two rules these cases exist to protect
 *
 * FR-008 has a warning and a promise in it. The warning is that applying a
 * program over planned content says so first; the promise is that a session
 * carrying anything the member *did* is never overwritten, and that archiving
 * rewrites nothing at all. Story 4 scenario 4 is the second of those, and it is
 * asserted on the field (`appliedStartDate`) and on the sessions, because
 * asserting only that the command succeeded would pass with either behaviour.
 */

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';
/** Client-minted UUIDv7-shaped ids: the phone creates all three offline. */
const PROGRAM_ID = '0192f100-0000-7000-8000-0000000000a1';
const WORKOUT_ID = '0192f100-0000-7000-8000-0000000000b1';
const SESSION_ID = '0192f100-0000-7000-8000-0000000000c1';

const SLOT_MONDAY = 'slot-gym-monday';

function today(): string {
  return localDate(new Date(), CAIRO);
}

function at(date: string, hhmm: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, CAIRO);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm}`);
  return instant;
}

/**
 * A date two days out, and the weekday that falls on.
 *
 * Two days rather than "the next Monday", so the assertions read the same
 * whatever day the suite runs on — and far enough ahead that every session it
 * produces is still in the future when the apply looks at it. One day would put
 * an 18:00 slot in the past for any run after 18:00.
 */
function startDate(): string {
  return addDays(today(), 2);
}

function slot(overrides: Partial<TrainingSlot> = {}): TrainingSlot {
  return {
    id: SLOT_MONDAY,
    weekday: isoWeekday(startDate()),
    start: '18:00',
    durationMin: 60,
    sport: 'gym',
    location: null,
    ...overrides,
  };
}

/** A one-week program whose single template has no weekday: the portable case. */
function weeks(count = 1): ProgramWeek[] {
  return Array.from({ length: count }, (_unused, index) => ({
    index,
    sessions: [
      {
        templateId: `template-week-${index}`,
        weekday: null,
        title: `Week ${index + 1} push`,
        focus: 'chest',
        exercises: [
          {
            name: 'Bench press',
            notes: null,
            mediaRefs: [],
            sets: [{ targetReps: 8, targetWeightKg: 60 }],
          },
        ],
      },
    ],
  }));
}

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'exercise-1',
    name: 'Squat',
    notes: null,
    mediaRefs: [],
    sets: [
      {
        targetReps: 5,
        targetWeightKg: 100,
        targetDurationSec: null,
        targetDistanceM: null,
        actualReps: null,
        actualWeightKg: null,
        actualDurationSec: null,
        actualDistanceM: null,
        done: false,
      },
    ],
    ...overrides,
  };
}

class StubMember extends MemberContextPort {
  async clock(): Promise<MemberClock> {
    return { timezone: CAIRO };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: ['0m'], quietHours: { from: '22:00', to: '07:00' } };
  }
}

interface Harness {
  uow: InMemoryUnitOfWork;
  programs: InMemoryProgramRepository;
  sessions: InMemorySessionRepository;
  workouts: InMemoryWorkoutRepository;
  profiles: InMemoryAthleteProfileRepository;
  create: CreateProgramHandler;
  update: UpdateProgramHandler;
  apply: ApplyProgramHandler;
  archive: ArchiveProgramHandler;
  activate: ActivateProgramHandler;
  createWorkout: CreateWorkoutHandler;
  applyWorkout: ApplyWorkoutToSessionHandler;
  list: ProgramsQueryHandler;
}

function harness(): Harness {
  const uow = new InMemoryUnitOfWork();
  const programs = new InMemoryProgramRepository(uow);
  const sessions = new InMemorySessionRepository(uow);
  const workouts = new InMemoryWorkoutRepository(uow);
  const profiles = new InMemoryAthleteProfileRepository(uow);
  const member = new StubMember();

  return {
    uow,
    programs,
    sessions,
    workouts,
    profiles,
    create: new CreateProgramHandler(uow, programs),
    update: new UpdateProgramHandler(uow, programs),
    apply: new ApplyProgramHandler(uow, programs, profiles, sessions, member),
    archive: new ArchiveProgramHandler(uow, programs),
    activate: new ActivateProgramHandler(uow, programs),
    createWorkout: new CreateWorkoutHandler(uow, workouts),
    applyWorkout: new ApplyWorkoutToSessionHandler(uow, sessions, workouts),
    list: new ProgramsQueryHandler(programs),
  };
}

async function seedProgram(h: Harness, weekCount = 1): Promise<void> {
  await h.create.handle(MEMBER, {
    id: PROGRAM_ID,
    title: 'Four week block',
    sport: 'gym',
    weeks: weeks(weekCount),
  });
}

/** The member's timetable: one slot, on the day the program starts. */
async function seedTimetable(h: Harness): Promise<void> {
  const profile = AthleteProfile.empty(MEMBER, new Date());
  await h.uow.run(async () => {
    profile.setSlots([slot()]);
    await h.profiles.save(profile);
  });
}

/**
 * A session sitting in the slot the program is about to fill.
 *
 * Its id is the *derived* one — `uuidv5(userId:slotId:localDate)` — because
 * that is what makes it the session the materialiser would upsert over, and
 * therefore the session the apply has to warn about. A session with any other
 * id is one the member made by hand, which the apply must never mention.
 */
async function seedSlotSession(
  h: Harness,
  date: string,
  overrides: Partial<Parameters<typeof Session.plan>[0]> = {},
): Promise<Session> {
  const session = Session.plan({
    id: slotSessionId(MEMBER, SLOT_MONDAY, date),
    userId: MEMBER,
    plannedAt: at(date, '18:00'),
    durationMin: 60,
    sport: 'gym',
    title: 'Whatever was there before',
    focus: null,
    programId: null,
    weekIndex: null,
    slotId: SLOT_MONDAY,
    suggestionId: null,
    exercises: [],
    notes: null,
    createdAt: new Date(),
    ...overrides,
  });
  await h.uow.run(() => h.sessions.save(session));
  return session;
}

// -------------------------------------------------------- create, edit, state

describe('a program through its states', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('creates one, announces it, and answers a replayed id without a second', async () => {
    const first = await h.create.handle(MEMBER, {
      id: PROGRAM_ID,
      title: '  Four week block  ',
      sport: 'gym',
      weeks: weeks(4),
    });

    expect(first.replayed).toBe(false);
    // Trimmed by the aggregate, and the whitespace is in the fixture on purpose:
    // a title that survives untrimmed sorts and renders wrong everywhere.
    expect(h.programs.rows.get(PROGRAM_ID)?.title).toBe('Four week block');
    expect(h.programs.rows.get(PROGRAM_ID)?.status).toBe('active');
    // Never applied, so nothing for the materialiser to read yet.
    expect(h.programs.rows.get(PROGRAM_ID)?.appliedStartDate).toBeNull();
    expect(h.uow.events.map((event) => event.name)).toContain(
      'training.ProgramCreated',
    );

    const second = await h.create.handle(MEMBER, {
      id: PROGRAM_ID,
      title: 'A different title entirely',
      sport: 'swimming',
      weeks: weeks(1),
    });

    // The offline retry: one row, and the first create's content stands.
    expect(second.replayed).toBe(true);
    expect(h.programs.rows.get(PROGRAM_ID)?.title).toBe('Four week block');
    expect(h.programs.rows.size).toBe(1);
  });

  it('edits the plan and writes nothing when nothing moved', async () => {
    await seedProgram(h);
    const before = h.programs.rows.get(PROGRAM_ID)?.updatedAt;

    const changed = await h.update.handle(MEMBER, PROGRAM_ID, {
      title: 'Five week block',
      weeks: weeks(5),
    });
    expect(changed.changed).toEqual(['title', 'weeks']);
    expect(h.programs.rows.get(PROGRAM_ID)?.weeks).toHaveLength(5);

    const noop = await h.update.handle(MEMBER, PROGRAM_ID, {
      title: 'Five week block',
    });
    expect(noop.changed).toEqual([]);
    // The same row, not merely the same content: a no-op that moved
    // `updatedAt` would have every other device pull a row that says nothing new.
    expect(noop.updatedAt.getTime()).toBe(
      h.programs.rows.get(PROGRAM_ID)?.updatedAt.getTime(),
    );
    expect(before).toBeDefined();
  });

  it('archives, hides from the default list, and comes back on request', async () => {
    await seedProgram(h);

    await h.archive.handle(MEMBER, PROGRAM_ID);
    expect(h.uow.events.map((event) => event.name)).toContain(
      'training.ProgramArchived',
    );

    expect(await h.list.list(MEMBER)).toEqual([]);
    const withArchived = await h.list.list(MEMBER, true);
    expect(withArchived).toHaveLength(1);
    expect(withArchived[0]?.status).toBe('archived');
    // The read publishes the ids, not `Link` objects: that type is Knowledge's
    // and does not exist until P7.
    expect(withArchived[0]?.sourceLinkIds).toEqual([]);

    await h.activate.handle(MEMBER, PROGRAM_ID);
    expect(h.programs.rows.get(PROGRAM_ID)?.status).toBe('active');
    expect(await h.list.list(MEMBER)).toHaveLength(1);
  });
});

// ------------------------------------------------------------- archiving (US4)

describe('archiving a program (story 4 scenarios 3 and 4)', () => {
  it('stops the materialiser consulting it and rewrites nothing it already filled', async () => {
    const h = harness();
    await seedTimetable(h);
    await seedProgram(h);

    const start = startDate();
    await h.apply.handle(MEMBER, PROGRAM_ID, { startDate: start });

    // A session this program filled, exactly as the materialiser would leave it.
    const filled = await seedSlotSession(h, start, {
      title: 'Week 1 push',
      focus: 'chest',
      programId: PROGRAM_ID,
      weekIndex: 0,
      exercises: [exercise({ name: 'Bench press' })],
    });

    await h.archive.handle(MEMBER, PROGRAM_ID);

    const row = h.programs.rows.get(PROGRAM_ID);
    /*
     * The three assertions, and each one is a different way this could go wrong.
     *
     * `isFilling` is what the materialiser reads: false, so the slots that
     * follow come up empty until another program is applied (scenario 3).
     */
    const stored = await h.programs.findById(MEMBER, PROGRAM_ID);
    expect(stored?.isFilling).toBe(false);
    /*
     * `appliedStartDate` survives. Clearing it would make re-activating the
     * program fill from week one instead of from the week the member is in, and
     * nobody said to forget when they started — `Program`'s field comment is
     * the long version, and this is the assertion that keeps it true.
     */
    expect(row?.appliedStartDate).toBe(start);
    /*
     * And the session it already filled is untouched, field for field
     * (scenario 4). Archiving means "stop putting this into my weeks", not
     * "take it out of the weeks I can already see" — the member can see this
     * session and may have edited it, and there is a path that replaces content
     * on purpose, which warns first.
     */
    const session = h.sessions.rows.get(filled.id);
    expect(session?.title).toBe('Week 1 push');
    expect(session?.focus).toBe('chest');
    expect(session?.programId).toBe(PROGRAM_ID);
    expect(session?.weekIndex).toBe(0);
    expect(session?.exercises).toHaveLength(1);
    expect(session?.updatedAt.getTime()).toBe(filled.updatedAt.getTime());
  });

  it('refuses to apply an archived program', async () => {
    const h = harness();
    await seedTimetable(h);
    await seedProgram(h);
    await h.archive.handle(MEMBER, PROGRAM_ID);

    // `not_active`, and the controller answers 409: the request is allowed and
    // the program is in the wrong state, so it will succeed once activated.
    await expect(
      h.apply.handle(MEMBER, PROGRAM_ID, { startDate: startDate() }),
    ).rejects.toThrow(/archived/i);
    expect(h.programs.rows.get(PROGRAM_ID)?.appliedStartDate).toBeNull();
  });

  it('refuses to apply a deleted program', async () => {
    const h = harness();
    await seedTimetable(h);
    await seedProgram(h);
    const program = await h.programs.findById(MEMBER, PROGRAM_ID);
    program?.tombstone(new Date());
    if (program) await h.uow.run(() => h.programs.save(program));

    // Deletion is not a status, so `applyFrom` would happily accept this — the
    // refusal has to be the handler's, and it is the same "a tombstone reads as
    // absent" rule the query side follows.
    await expect(
      h.apply.handle(MEMBER, PROGRAM_ID, { startDate: startDate() }),
    ).rejects.toThrow(/no program/i);
    expect(h.programs.rows.get(PROGRAM_ID)?.appliedStartDate).toBeNull();
  });
});

// ------------------------------------------------------------- apply (FR-008)

describe('applying a program', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('records the start date and raises ProgramApplied when nothing is at risk', async () => {
    await seedTimetable(h);
    await seedProgram(h);
    const start = startDate();

    const result = await h.apply.handle(MEMBER, PROGRAM_ID, {
      startDate: start,
    });

    expect(result).toEqual({ applied: true, wouldReplace: [] });
    expect(h.programs.rows.get(PROGRAM_ID)?.appliedStartDate).toBe(start);
    /*
     * The event is the whole of what this command hands to the materialiser,
     * and the materialiser is what fills the sessions — filling here would fill
     * the fortnight the horizon can see and silently drop week four of a
     * four-week program.
     */
    const applied = h.uow.events.find(
      (event) => event.name === 'training.ProgramApplied',
    );
    expect(applied?.payload).toMatchObject({
      programId: PROGRAM_ID,
      startDate: start,
      weeks: 1,
    });
    // And it wrote no session: that is not this command's job.
    expect(h.sessions.rows.size).toBe(0);
  });

  it('refuses without force and lists what it would replace', async () => {
    await seedTimetable(h);
    await seedProgram(h);
    const start = startDate();
    const standing = await seedSlotSession(h, start, {
      title: 'Last block, push day',
      exercises: [exercise()],
    });

    const result = await h.apply.handle(MEMBER, PROGRAM_ID, {
      startDate: start,
    });

    expect(result.applied).toBe(false);
    expect(result.wouldReplace).toEqual([
      {
        sessionId: standing.id,
        plannedAt: standing.plannedAt,
        title: 'Last block, push day',
      },
    ]);
    /*
     * Nothing was written. The aggregate was mutated in memory and dropped, and
     * the point of this pair of assertions is that dropping it is enough:
     * events reach the outbox when the repository saves, so an unsaved
     * aggregate has announced nothing.
     */
    expect(h.programs.rows.get(PROGRAM_ID)?.appliedStartDate).toBeNull();
    expect(h.uow.events.map((event) => event.name)).not.toContain(
      'training.ProgramApplied',
    );
  });

  it('applies with force, and still reports the list as a receipt', async () => {
    await seedTimetable(h);
    await seedProgram(h);
    const start = startDate();
    const standing = await seedSlotSession(h, start, {
      title: 'Last block, push day',
      exercises: [exercise()],
    });

    const result = await h.apply.handle(MEMBER, PROGRAM_ID, {
      startDate: start,
      force: true,
    });

    expect(result.applied).toBe(true);
    // The list is on the success too, so a client has something to show
    // afterwards rather than only something to ask about beforehand.
    expect(result.wouldReplace.map((entry) => entry.sessionId)).toEqual([
      standing.id,
    ]);
    expect(h.programs.rows.get(PROGRAM_ID)?.appliedStartDate).toBe(start);
    expect(h.uow.events.map((event) => event.name)).toContain(
      'training.ProgramApplied',
    );
  });

  it('never names a logged session, and never replaces one', async () => {
    await seedTimetable(h);
    await seedProgram(h);
    const start = startDate();

    // A session with one actual rep in it. `isLogged` reads `actual*` and
    // `done` and never the targets, which is the distinction between a plan and
    // a record — and FR-008 says records are never overwritten.
    const logged = await seedSlotSession(h, start, {
      title: 'The day I actually trained',
      exercises: [
        exercise({
          sets: [
            {
              targetReps: 5,
              targetWeightKg: 100,
              targetDurationSec: null,
              targetDistanceM: null,
              actualReps: 5,
              actualWeightKg: 102.5,
              actualDurationSec: null,
              actualDistanceM: null,
              done: true,
            },
          ],
        }),
      ],
    });

    const result = await h.apply.handle(MEMBER, PROGRAM_ID, {
      startDate: start,
    });

    /*
     * Applied outright, with no warning — because there is nothing to warn
     * about. A warning naming a session that is in fact safe is worse than no
     * warning: it teaches the member to dismiss them.
     */
    expect(result).toEqual({ applied: true, wouldReplace: [] });
    const row = h.sessions.rows.get(logged.id);
    expect(row?.exercises[0]?.sets[0]?.actualWeightKg).toBe(102.5);
    expect(row?.title).toBe('The day I actually trained');
    expect(row?.updatedAt.getTime()).toBe(logged.updatedAt.getTime());
  });

  it('leaves a session the member made by hand out of the list', async () => {
    await seedTimetable(h);
    await seedProgram(h);
    const start = startDate();

    // A hand-made session: a client-minted id and no `slotId`, which is what
    // keeps the materialiser — and therefore the apply — away from it.
    const own = Session.plan({
      id: SESSION_ID,
      userId: MEMBER,
      plannedAt: at(start, '18:00'),
      durationMin: 60,
      sport: 'gym',
      title: 'A session I added myself',
      focus: null,
      programId: null,
      weekIndex: null,
      slotId: null,
      suggestionId: null,
      exercises: [],
      notes: null,
      createdAt: new Date(),
    });
    await h.uow.run(() => h.sessions.save(own));

    const result = await h.apply.handle(MEMBER, PROGRAM_ID, {
      startDate: start,
    });

    expect(result.applied).toBe(true);
    expect(result.wouldReplace).toEqual([]);
  });

  it('warns about nothing beyond the weeks the program actually has', async () => {
    await seedTimetable(h);
    // One week, and a session in the slot a *week later* — which week two would
    // fill if this program had one. It does not, so the slots simply continue
    // empty (the spec's "a program shorter than the weeks remaining" case) and
    // nothing there is at risk.
    await seedProgram(h, 1);
    const start = startDate();
    await seedSlotSession(h, addDays(start, 7), {
      title: 'Next week, untouched',
      exercises: [exercise()],
    });

    const result = await h.apply.handle(MEMBER, PROGRAM_ID, {
      startDate: start,
    });

    expect(result).toEqual({ applied: true, wouldReplace: [] });
  });

  it('refuses a start date that is not a local date', async () => {
    await seedProgram(h);
    await expect(
      h.apply.handle(MEMBER, PROGRAM_ID, {
        // An instant, which is the mistake the field exists to prevent: "the
        // fourteenth" sent as a moment arrives shifted by the sender's clock.
        startDate: new Date().toISOString(),
      }),
    ).rejects.toThrow(/local date/i);
  });
});

// -------------------------------------------------------- the library (US5)

describe('applying a workout to a session (story 5)', () => {
  it('gives the session copies with fresh ids that edit without touching the entry', async () => {
    const h = harness();
    await h.createWorkout.handle(MEMBER, {
      id: WORKOUT_ID,
      name: 'Leg day',
      sport: 'gym',
      exercises: [exercise({ id: 'library-exercise-1' })],
    });

    const start = startDate();
    const session = await seedSlotSession(h, start, { exercises: [] });

    const result = await h.applyWorkout.handle(MEMBER, session.id, WORKOUT_ID);
    expect(result.exercises).toBe(1);

    const applied = h.sessions.rows.get(session.id);
    const copied = applied?.exercises[0];
    expect(copied?.name).toBe('Squat');
    expect(copied?.sets[0]?.targetWeightKg).toBe(100);
    /*
     * A **fresh id**, and that is the copy. The logger writes by exercise id, so
     * sharing the library entry's id would have a member logging a set in one
     * session write into every other session built from the same workout.
     */
    expect(copied?.id).not.toBe('library-exercise-1');

    // Editing the session's copy afterwards, which story 5's scenario asks for.
    const reloaded = await h.sessions.findById(MEMBER, session.id);
    reloaded?.log(
      copied?.id ?? '',
      [
        {
          targetReps: 5,
          targetWeightKg: 100,
          targetDurationSec: null,
          targetDistanceM: null,
          actualReps: 5,
          actualWeightKg: 105,
          actualDurationSec: null,
          actualDistanceM: null,
          done: true,
        },
      ],
      new Date(),
    );
    if (reloaded) await h.uow.run(() => h.sessions.save(reloaded));

    expect(
      h.sessions.rows.get(session.id)?.exercises[0]?.sets[0]?.actualWeightKg,
    ).toBe(105);
    // And the library entry is exactly as it was — no actual, and its own id.
    const entry = h.workouts.rows.get(WORKOUT_ID);
    expect(entry?.exercises[0]?.id).toBe('library-exercise-1');
    expect(entry?.exercises[0]?.sets[0]?.actualWeightKg).toBeNull();
  });
});
