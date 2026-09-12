import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import type { SyncChange } from '../../shared/persistence/ports/sync-change.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import {
  AthleteProfile,
  type TrainingSlot,
} from './domain/athlete-profile.aggregate.js';
import { Program } from './domain/program.aggregate.js';
import { Session } from './domain/session.aggregate.js';
import { Workout } from './domain/workout.aggregate.js';
import { addDays, isoWeekday, slotSessionId } from './domain/slot-calendar.js';
import {
  InMemoryAthleteProfileRepository,
  InMemoryProgramRepository,
  InMemorySessionRepository,
  InMemoryWorkoutRepository,
} from './infrastructure/in-memory-training.repositories.js';
import {
  AthleteProfilePatchAdapter,
  ProgramSyncAdapter,
  SessionSyncAdapter,
  WorkoutSyncAdapter,
} from './infrastructure/training-sync.adapters.js';

/**
 * Training's four sync adapters against the conflict rule and the traps
 * `CLAUDE.md` names for this transport.
 *
 * Each case below is a bug that has actually shipped somewhere in this
 * codebase, or is one line away from doing so: a delete that rewrote a status
 * (twice), a rejection reported as `stale` against a rule that would never
 * accept the row (a retry loop for ever), a foreign id matched by an unscoped
 * write filter, and a delta pull that dropped its tombstones so the phone's
 * delete sweep never learned about a deletion.
 *
 * ## Every date is computed from the clock, never written down
 *
 * `Date.now()` is the anchor for all of it. A fixture pinned to a real date is
 * a time bomb: it passes until the day the clock reaches it, and a session
 * whose `plannedAt` has fallen behind `now` starts failing cases that have
 * nothing to do with sync. `Africa/Cairo` is the fixed test zone the plan names.
 */

const USER = 'user-1';
const OTHER = 'user-2';
const CAIRO = 'Africa/Cairo';

/** Client-minted UUIDv7-shaped ids: the phone creates all three offline. */
const SESSION_ID = '0192f200-0000-7000-8000-0000000000a1';
const PROGRAM_ID = '0192f200-0000-7000-8000-0000000000b1';
const WORKOUT_ID = '0192f200-0000-7000-8000-0000000000c1';

const SLOT_ID = 'slot-gym';
const GONE_SLOT_ID = 'slot-that-was-removed';

const inMinutes = (n: number) => new Date(Date.now() + n * 60_000);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

function today(): string {
  return localDate(new Date(), CAIRO);
}

function at(date: string, hhmm: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, CAIRO);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm}`);
  return instant;
}

function slot(overrides: Partial<TrainingSlot> = {}): TrainingSlot {
  return {
    id: SLOT_ID,
    weekday: isoWeekday(addDays(today(), 2)),
    start: '18:00',
    durationMin: 60,
    sport: 'gym',
    location: null,
    ...overrides,
  };
}

interface Harness {
  uow: InMemoryUnitOfWork;
  sessions: InMemorySessionRepository;
  programs: InMemoryProgramRepository;
  workouts: InMemoryWorkoutRepository;
  profiles: InMemoryAthleteProfileRepository;
  sessionSync: SessionSyncAdapter;
  programSync: ProgramSyncAdapter;
  workoutSync: WorkoutSyncAdapter;
  profileSync: AthleteProfilePatchAdapter;
}

function harness(): Harness {
  const uow = new InMemoryUnitOfWork();
  const sessions = new InMemorySessionRepository(uow);
  const programs = new InMemoryProgramRepository(uow);
  const workouts = new InMemoryWorkoutRepository(uow);
  const profiles = new InMemoryAthleteProfileRepository(uow);
  return {
    uow,
    sessions,
    programs,
    workouts,
    profiles,
    sessionSync: new SessionSyncAdapter(uow, sessions, profiles),
    programSync: new ProgramSyncAdapter(uow, programs),
    workoutSync: new WorkoutSyncAdapter(uow, workouts),
    profileSync: new AthleteProfilePatchAdapter(uow, profiles),
  };
}

/** A pushed row, with the protocol's defaults filled in. */
function change(partial: Partial<SyncChange> & { id: string }): SyncChange {
  return {
    op: 'update',
    updatedAt: new Date(),
    baseUpdatedAt: null,
    fields: {},
    ...partial,
  };
}

async function seedSession(
  h: Harness,
  overrides: Partial<Parameters<typeof Session.plan>[0]> = {},
): Promise<Session> {
  const session = Session.plan({
    id: SESSION_ID,
    userId: USER,
    plannedAt: inMinutes(180),
    durationMin: 60,
    sport: 'gym',
    title: 'Push day',
    focus: null,
    programId: null,
    weekIndex: null,
    slotId: null,
    suggestionId: null,
    exercises: [],
    notes: null,
    createdAt: minutesAgo(10),
    ...overrides,
  });
  // Inside a unit of work, because `plan` raises `SessionScheduled` and the
  // in-memory uow refuses to collect an event outside a transaction — the row
  // and its outbox entry commit together or not at all.
  await h.uow.run(() => h.sessions.save(session));
  return session;
}

async function seedProgram(h: Harness, userId = USER): Promise<Program> {
  const program = Program.create({
    id: PROGRAM_ID,
    userId,
    title: 'Four week block',
    sport: 'gym',
    source: 'user',
    sourceLinkIds: [],
    weeks: [
      {
        index: 0,
        sessions: [
          {
            templateId: 'template-1',
            weekday: null,
            title: 'Week 1 push',
            focus: null,
            exercises: [],
          },
        ],
      },
    ],
    createdAt: minutesAgo(10),
  });
  await h.uow.run(() => h.programs.save(program));
  return program;
}

async function seedWorkout(h: Harness): Promise<Workout> {
  const workout = Workout.create({
    id: WORKOUT_ID,
    userId: USER,
    name: 'Leg day',
    sport: 'gym',
    exercises: [],
    tags: ['legs'],
    createdAt: minutesAgo(10),
  });
  // `Workout` raises nothing by design, so this needs no transaction — it is
  // wrapped anyway so the fixture reads like every other seed here.
  await h.uow.run(() => h.workouts.save(workout));
  return workout;
}

async function seedProfile(
  h: Harness,
  slots: TrainingSlot[] = [slot()],
): Promise<AthleteProfile> {
  const profile = AthleteProfile.empty(USER, minutesAgo(10));
  await h.uow.run(async () => {
    profile.setSlots(slots, minutesAgo(10));
    await h.profiles.save(profile);
  });
  return profile;
}

/** The fields a valid session push carries, for the cases that need a create. */
function validSessionFields(): Record<string, unknown> {
  return {
    title: 'Pull day',
    sport: 'gym',
    plannedAt: inMinutes(240).toISOString(),
    durationMin: 45,
  };
}

// ---------------------------------------------------------- the apply order

describe('the apply order', () => {
  it('reads the way contracts/sync.md writes it, after the calendar and before the rhythm', () => {
    const h = harness();
    /*
     * The contract's `entities` list runs labels (10), tasks (20), reminders
     * (30), meetings (32), calendar events (34), then this phase's three,
     * before the rhythm's at 40/41/42. Its *processing* order says "programs
     * before sessions", which is why programs is the lower number — and the
     * adapters' own comment says the honest thing about it: nothing in a
     * session apply reads a program today, so the order buys a sequence that
     * reads like the contract rather than a correctness guarantee.
     */
    expect(h.programSync.applyOrder).toBeGreaterThan(34);
    expect(h.sessionSync.applyOrder).toBeGreaterThan(
      h.programSync.applyOrder,
    );
    expect(h.workoutSync.applyOrder).toBeGreaterThan(h.sessionSync.applyOrder);
    expect(h.workoutSync.applyOrder).toBeLessThan(40);
    // The patch list is its own sequence: profile (1), preferences (2), then
    // this. Rows and patches never compete for a number.
    expect(h.profileSync.applyOrder).toBe(3);
  });

  it('names each entity exactly as the contract spells it', () => {
    const h = harness();
    // One string in one place: the key in the request's `push`, the key in the
    // response's `pull`, and the `entity` of every rejection.
    expect(h.sessionSync.entity).toBe('sessions');
    expect(h.programSync.entity).toBe('programs');
    expect(h.workoutSync.entity).toBe('workouts');
    expect(h.profileSync.entity).toBe('athlete_profile');
  });
});

// ------------------------------------------------------- the conflict rule

describe('a push against the conflict rule', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('refuses a stale session push with the entity and the server row', async () => {
    const server = await seedSession(h);

    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'update',
        // The base no longer matches, so the clock is consulted — and this
        // device's edit is older than the server's row.
        baseUpdatedAt: minutesAgo(30),
        updatedAt: minutesAgo(20),
        fields: { title: 'Renamed on a plane' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    // The client branches on `entity` before touching any table: writing a
    // refused session through the task path corrupts rather than crashes.
    expect(outcome.rejection.entity).toBe('sessions');
    expect(outcome.rejection.id).toBe(SESSION_ID);
    expect(outcome.rejection.reason).toBe('stale');
    // And the row itself, because the client's obligation on `stale` is to
    // overwrite its copy from it. A rejection without the row makes the phone
    // ask again, get the same refusal, and loop.
    expect(outcome.rejection.server).not.toBeNull();
    expect((outcome.rejection.server as Session).id).toBe(SESSION_ID);
    expect((outcome.rejection.server as Session).title).toBe('Push day');
    expect((outcome.rejection.server as Session).updatedAt.getTime()).toBe(
      server.updatedAt.getTime(),
    );
    expect(h.sessions.rows.get(SESSION_ID)?.title).toBe('Push day');
  });

  it('accepts an edit onto a tombstoned session without resurrecting it', async () => {
    const server = await seedSession(h);
    server.tombstone(minutesAgo(2));
    await h.uow.run(() => h.sessions.save(server));

    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'update',
        // A base that matches, so `resolveConflict` accepts outright: the row
        // being a tombstone is not one of its clauses, and these adapters do
        // not add one — `/sync` is a single protocol, and three of eight
        // entities answering this differently from the other five is a defect a
        // client author walks into by assuming uniformity.
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        fields: { notes: 'written on a device that had not caught up' },
      }),
      new Date(),
    );

    expect(outcome).toEqual({ applied: true, id: SESSION_ID });
    /*
     * The verdict is the same as Planning's and Meetings'; what this case pins
     * is the **outcome**, which nothing else in the codebase asserts: the row
     * stays deleted. An accepted edit must not resurrect a session the member
     * removed — the notes land, `deletedAt` does not move, and the status is
     * untouched, so the Deleted view reads exactly as it did.
     *
     * The edit itself is then lost to the next pull, which overwrites the
     * phone's copy from the tombstone. That is a real gap and it is written up
     * as `enhancements/E-016` rather than patched here: if refusing is right it
     * is right for every entity, which makes it a change to `resolveConflict`
     * and to the contract, not to one context's three adapters.
     */
    const row = h.sessions.rows.get(SESSION_ID);
    expect(row?.notes).toBe('written on a device that had not caught up');
    expect(row?.deletedAt?.getTime()).toBe(server.deletedAt?.getTime());
    expect(row?.status).toBe('planned');
  });

  it('brings a tombstoned session back on a restore, and announces it', async () => {
    const server = await seedSession(h);
    server.tombstone(minutesAgo(2));
    await h.uow.run(() => h.sessions.save(server));

    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'restore',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
      }),
      new Date(),
    );

    // The counterpart to the case above, and what makes a tombstone a tombstone
    // rather than a delete: `restore` is the way back. `Session.restore`
    // re-announces `SessionScheduled`, which is what puts the alerts the delete
    // cleared back on the member's phone.
    expect(outcome.applied).toBe(true);
    expect(h.sessions.rows.get(SESSION_ID)?.deletedAt).toBeNull();
    expect(h.uow.events.map((event) => event.name)).toContain(
      'training.SessionScheduled',
    );
  });

  it('refuses a purge of a live row as not_deleted, for each of the three', async () => {
    const session = await seedSession(h);
    const program = await seedProgram(h);
    const workout = await seedWorkout(h);

    const outcomes = await Promise.all([
      h.sessionSync.apply(
        USER,
        change({
          id: SESSION_ID,
          op: 'purge',
          baseUpdatedAt: session.updatedAt,
        }),
        new Date(),
      ),
      h.programSync.apply(
        USER,
        change({
          id: PROGRAM_ID,
          op: 'purge',
          baseUpdatedAt: program.updatedAt,
        }),
        new Date(),
      ),
      h.workoutSync.apply(
        USER,
        change({
          id: WORKOUT_ID,
          op: 'purge',
          baseUpdatedAt: workout.updatedAt,
        }),
        new Date(),
      ),
    ]);

    for (const outcome of outcomes) {
      expect(outcome.applied).toBe(false);
      if (outcome.applied) continue;
      expect(outcome.rejection.reason).toBe('not_deleted');
    }
    expect(outcomes.map((outcome) =>
      outcome.applied ? null : outcome.rejection.entity,
    )).toEqual(['sessions', 'programs', 'workouts']);

    // Erasing a live row is data loss dressed as housekeeping: all three stay.
    expect(h.sessions.rows.has(SESSION_ID)).toBe(true);
    expect(h.programs.rows.has(PROGRAM_ID)).toBe(true);
    expect(h.workouts.rows.has(WORKOUT_ID)).toBe(true);
  });

  it('refuses an id belonging to another member, and never as stale', async () => {
    const theirs = await seedProgram(h, OTHER);

    const outcome = await h.programSync.apply(
      USER,
      change({
        id: PROGRAM_ID,
        op: 'update',
        // The pushing device claims a base that *does* match the stored row,
        // which is exactly the shape that would sail through an unscoped write
        // filter — the refusal has to come from the scope of the read, not from
        // the clock.
        baseUpdatedAt: theirs.updatedAt,
        updatedAt: new Date(),
        fields: { title: 'Not mine' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('programs');
    /*
     * `gone`, indistinguishable from an id that never existed — and the point
     * of the assertion is the second half: `stale` would tell the phone to take
     * the server's copy and retry, against a row it may never see, for ever.
     */
    expect(outcome.rejection.reason).toBe('gone');
    expect(outcome.rejection.reason).not.toBe('stale');
    // And the other member's row is untouched, `userId` included.
    const row = h.programs.rows.get(PROGRAM_ID);
    expect(row?.userId).toBe(OTHER);
    expect(row?.title).toBe('Four week block');
    expect(row?.updatedAt.getTime()).toBe(theirs.updatedAt.getTime());
  });

  it('refuses a row no domain rule will ever accept as invalid', async () => {
    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'create',
        updatedAt: new Date(),
        // No title. `title_required`, and no retry of the same bytes will ever
        // get past it.
        fields: { ...validSessionFields(), title: '' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('sessions');
    // `invalid`, so the client surfaces it to the member — the only person who
    // can fix it. `stale` would have the phone refresh and re-send the same
    // bytes against the same rule for ever.
    expect(outcome.rejection.reason).toBe('invalid');
    expect(outcome.rejection.reason).not.toBe('stale');
    expect(h.sessions.rows.has(SESSION_ID)).toBe(false);
  });

  it('refuses a pushed session naming a slot the profile no longer holds', async () => {
    // The member's timetable has one slot, and it is not the one the pushed
    // session claims.
    await seedProfile(h, [slot()]);

    const date = addDays(today(), 2);
    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: slotSessionId(USER, GONE_SLOT_ID, date),
        op: 'create',
        updatedAt: new Date(),
        fields: {
          ...validSessionFields(),
          plannedAt: at(date, '18:00').toISOString(),
          slotId: GONE_SLOT_ID,
        },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('sessions');
    /*
     * A slot's session has a *derived* id, so a device holding a stale
     * timetable can push back a session for a slot the member has removed —
     * the reconcile deleted it, and accepting the push would put it back on
     * their week until the next pass noticed.
     *
     * `invalid` and not `stale`: the slot is gone, no refresh will bring it
     * back, and the phone has to stop asking.
     */
    expect(outcome.rejection.reason).toBe('invalid');
    expect(outcome.rejection.reason).not.toBe('stale');
    expect(h.sessions.rows.size).toBe(0);
  });

  it('accepts a pushed session for a slot the profile still holds', async () => {
    await seedProfile(h, [slot()]);

    const date = addDays(today(), 2);
    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: slotSessionId(USER, SLOT_ID, date),
        op: 'create',
        updatedAt: new Date(),
        fields: {
          ...validSessionFields(),
          plannedAt: at(date, '18:00').toISOString(),
          slotId: SLOT_ID,
        },
      }),
      new Date(),
    );

    // The counterpart, so the guard above is a guard rather than a wall.
    expect(outcome.applied).toBe(true);
    expect(h.sessions.rows.size).toBe(1);
  });
});

// ---------------------------------------------------------- accepted pushes

describe('a push that is accepted', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('inserts a create for an id the server has never seen', async () => {
    // The offline case: the phone minted the id and created the row with no
    // network, so the server's first sight of it is this push.
    const clientEdit = minutesAgo(5);
    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'create',
        updatedAt: clientEdit,
        fields: validSessionFields(),
      }),
      new Date(),
    );

    expect(outcome).toEqual({ applied: true, id: SESSION_ID });
    const row = h.sessions.rows.get(SESSION_ID);
    expect(row?.userId).toBe(USER);
    expect(row?.title).toBe('Pull day');
    expect(row?.status).toBe('planned');
    // A session the member made by hand: no slot, so the reconcile can never
    // claim it.
    expect(row?.slotId).toBeNull();
    // `createdAt` is the client's own edit time, not the server's `now`: the row
    // was created when the member made it, on a plane.
    expect(row?.createdAt.getTime()).toBe(clientEdit.getTime());
    // The one announcement the alert pipeline, the rhythm's tomorrow draft and
    // P7's suggestion saga all hang off. A session that appears without one is
    // a session nobody is reminded about.
    expect(h.uow.events.map((event) => event.name)).toContain(
      'training.SessionScheduled',
    );
  });

  it('treats a pushed status as a report rather than a transition', async () => {
    const server = await seedSession(h);
    h.uow.events.length = 0;

    const completedAt = minutesAgo(1);
    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'update',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        fields: {
          status: 'completed',
          completedAt: completedAt.toISOString(),
        },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    const row = h.sessions.rows.get(SESSION_ID);
    expect(row?.status).toBe('completed');
    expect(row?.completedAt?.getTime()).toBe(completedAt.getTime());
    /*
     * And **no second `SessionCompleted`**. The phone completed the session
     * locally, applied every consequence it could, and is pushing the result;
     * calling `complete()` here would re-run the alert clearing, the streak and
     * the coach's summary for an outcome that has already happened.
     */
    expect(h.uow.events.map((event) => event.name)).not.toContain(
      'training.SessionCompleted',
    );
  });

  it('leaves the status alone when a delete arrives', async () => {
    const server = await seedSession(h);
    server.skip(minutesAgo(2));
    await h.uow.run(() => h.sessions.save(server));
    expect(h.sessions.rows.get(SESSION_ID)?.status).toBe('skipped');

    const outcome = await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'delete',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        // A client that sends a whole row on a delete must not be able to move
        // the status through the back door either.
        fields: { status: 'planned', title: 'Push day' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    const row = h.sessions.rows.get(SESSION_ID);
    expect(row?.deletedAt).not.toBeNull();
    /*
     * The status is the only record of whether the session happened, was called
     * off or was skipped, and the Deleted view exists to show exactly that. A
     * delete that rewrote it has shipped twice in this codebase, which is why
     * this assertion lives here rather than being trusted to the aggregate.
     */
    expect(row?.status).toBe('skipped');
  });

  it('archives a program offline without announcing it a second time', async () => {
    const server = await seedProgram(h);
    h.uow.events.length = 0;

    const outcome = await h.programSync.apply(
      USER,
      change({
        id: PROGRAM_ID,
        op: 'update',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        fields: { status: 'archived' },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    expect(h.programs.rows.get(PROGRAM_ID)?.status).toBe('archived');
    // Writing the status is the whole of what archiving accomplishes — the
    // materialiser reads `isFilling` off the document on every pass — so the
    // event would only have told somebody who already knows.
    expect(h.uow.events.map((event) => event.name)).not.toContain(
      'training.ProgramArchived',
    );
  });

  it('never lets a pushed program row set its own appliedStartDate', async () => {
    const server = await seedProgram(h);

    const outcome = await h.programSync.apply(
      USER,
      change({
        id: PROGRAM_ID,
        op: 'update',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
        fields: { title: 'Renamed', appliedStartDate: addDays(today(), 2) },
      }),
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    expect(h.programs.rows.get(PROGRAM_ID)?.title).toBe('Renamed');
    /*
     * Applying is `POST /programs/:id/apply` because the apply carries the
     * replace warning: it gathers the sessions it would overwrite and refuses
     * without `force`. A client that could set this through `/sync` would apply
     * a program with no warning at all — FR-008's requirement bypassed by a
     * field on a row.
     */
    expect(h.programs.rows.get(PROGRAM_ID)?.appliedStartDate).toBeNull();
  });
});

// ------------------------------------------------------------------ the pull

describe('the pull', () => {
  it('carries tombstones, on a delta as well as a snapshot', async () => {
    const h = harness();
    const server = await seedSession(h);
    // A cursor the phone already holds: after the create (ten minutes ago) and
    // before the delete, so the delta below contains the deletion and nothing
    // else. Not `new Date()`, which lands in the same millisecond as the delete
    // and would make the case pass or fail on scheduler luck.
    const cursor = minutesAgo(1);

    await h.sessionSync.apply(
      USER,
      change({
        id: SESSION_ID,
        op: 'delete',
        baseUpdatedAt: server.updatedAt,
        updatedAt: new Date(),
      }),
      new Date(),
    );

    const snapshot = (await h.sessionSync.pull(USER, null)) as Array<{
      id: string;
      deletedAt: Date | null;
      status: string;
    }>;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.id).toBe(SESSION_ID);
    expect(snapshot[0]?.deletedAt).not.toBeNull();
    expect(snapshot[0]?.status).toBe('planned');

    /*
     * And on a delta, which is the case that matters: the client's delete sweep
     * runs only against a full snapshot, so on a delta the tombstone is the
     * *only* way the deletion travels. A pull that filtered them out would
     * leave the row on the phone until something else happened to force a
     * snapshot.
     */
    const delta = (await h.sessionSync.pull(USER, cursor)) as Array<{
      id: string;
      deletedAt: Date | null;
    }>;
    expect(delta.map((row) => row.id)).toEqual([SESSION_ID]);
    expect(delta[0]?.deletedAt).not.toBeNull();
  });

  it('carries a tombstoned program and workout too', async () => {
    const h = harness();
    const program = await seedProgram(h);
    const workout = await seedWorkout(h);
    program.tombstone(new Date());
    workout.tombstone(new Date());
    await h.uow.run(async () => {
      await h.programs.save(program);
      await h.workouts.save(workout);
    });

    const programs = (await h.programSync.pull(USER, null)) as Array<{
      deletedAt: Date | null;
      status: string;
    }>;
    const workouts = (await h.workoutSync.pull(USER, null)) as Array<{
      deletedAt: Date | null;
    }>;

    expect(programs[0]?.deletedAt).not.toBeNull();
    // A deleted program keeps its status, the same rule as everywhere else.
    expect(programs[0]?.status).toBe('active');
    expect(workouts[0]?.deletedAt).not.toBeNull();
  });

  it('answers the athlete profile as one document, or null before bootstrap', async () => {
    const h = harness();
    // The window after registration, before the relay has delivered
    // `identity.UserRegistered`. Null rather than an empty array of one: this
    // entity is a patch, not a row.
    expect(await h.profileSync.pull(USER)).toBeNull();

    await seedProfile(h);
    const pulled = (await h.profileSync.pull(USER)) as {
      userId: string;
      sports: string[];
      slots: TrainingSlot[];
    };
    expect(pulled.userId).toBe(USER);
    expect(pulled.slots.map((entry) => entry.id)).toEqual([SLOT_ID]);
  });
});

// ------------------------------------------------------- the profile patch

describe('the athlete profile patch', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('accepts only sports and slots, and drops everything else', async () => {
    await seedProfile(h, []);

    const outcome = await h.profileSync.applyPatch(
      USER,
      {
        sports: ['gym', 'swimming'],
        slots: [slot()],
        // Not on the allowlist. Dropped rather than refused: a newer app may
        // know a field this server does not, and refusing the whole patch would
        // block the fields it *does* know — including a timetable, which the
        // materialiser needs to hear about.
        userId: OTHER,
        updatedAt: new Date(0),
        somethingFromNextYear: true,
      },
      new Date(),
    );

    expect(outcome).toEqual({ applied: true, id: USER });
    const row = h.profiles.rows.get(USER);
    expect(row?.sports).toEqual(['gym', 'swimming']);
    expect(row?.slots.map((entry) => entry.id)).toEqual([SLOT_ID]);
    // The two fields off the allowlist changed nothing: the row is still the
    // pushing member's, and its `updatedAt` is not 1970.
    expect(row?.userId).toBe(USER);
    expect(row?.updatedAt.getTime()).toBeGreaterThan(0);
    /*
     * And it went through the aggregate, which is the point of not writing the
     * fields straight onto the row: the materialiser listens to both events, so
     * a member who moved their session finds their week moved with it instead
     * of waiting for the nightly pass to notice.
     */
    const names = h.uow.events.map((event) => event.name);
    expect(names).toContain('training.SportsChanged');
    expect(names).toContain('training.SlotsChanged');
  });

  it('creates the profile when the patch arrives before the bootstrap', async () => {
    // The relay is at-least-once and eventual, so there is a window in which
    // the document does not exist. A member who set their sports on the plane
    // must not lose them to that race — and the document is keyed by their own
    // id, so this and the bootstrap converge on one row either way.
    const outcome = await h.profileSync.applyPatch(
      USER,
      { sports: ['running'] },
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    expect(h.profiles.rows.get(USER)?.sports).toEqual(['running']);
  });

  it('refuses a timetable the aggregate will not accept as invalid, never as stale', async () => {
    await seedProfile(h);

    const outcome = await h.profileSync.applyPatch(
      USER,
      // 08:00 in the morning is a wall-clock time; "8am" is not, and no amount
      // of refreshing will make it one.
      { slots: [slot({ start: '8am' })] },
      new Date(),
    );

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.rejection.entity).toBe('athlete_profile');
    expect(outcome.rejection.reason).toBe('invalid');
    /*
     * This entity has **no conflict check at all** — the fields a client may
     * patch and the fields the server's jobs write are disjoint sets — so a
     * stale patch is accepted. Which makes the reporting rule as important as
     * the acceptance rule: `stale` tells the phone to overwrite its copy and
     * retry, and against a rule that was never going to refuse it the phone
     * would retry for ever.
     */
    expect(outcome.rejection.reason).not.toBe('stale');
    // The stored timetable is the one it was.
    expect(h.profiles.rows.get(USER)?.slots.map((entry) => entry.start)).toEqual(
      ['18:00'],
    );
  });

  it('accepts a stale patch outright, because there is no version to lose', async () => {
    const profile = await seedProfile(h);

    // A device that pulled minutes ago, edited offline, and is only now
    // pushing. There is no `baseUpdatedAt` in a patch and nothing compares one.
    const outcome = await h.profileSync.applyPatch(
      USER,
      { sports: ['cycling'] },
      new Date(),
    );

    expect(outcome).toEqual({ applied: true, id: USER });
    expect(h.profiles.rows.get(USER)?.sports).toEqual(['cycling']);
    // The timetable the patch did not mention is left alone — `undefined` and
    // `[]` are opposite statements, and collapsing them would erase a week.
    expect(h.profiles.rows.get(USER)?.slots).toHaveLength(1);
    expect(profile.updatedAt).toBeInstanceOf(Date);
  });

  it('writes nothing for a patch that changes nothing', async () => {
    await seedProfile(h);
    h.uow.events.length = 0;
    const before = h.profiles.rows.get(USER)?.updatedAt;

    const outcome = await h.profileSync.applyPatch(
      USER,
      { slots: [slot()] },
      new Date(),
    );

    expect(outcome.applied).toBe(true);
    // A no-op save would wake the materialiser, which walks the member's whole
    // fortnight — and a no-op save is the commonest thing a form does.
    expect(h.uow.events).toEqual([]);
    expect(h.profiles.rows.get(USER)?.updatedAt.getTime()).toBe(
      before?.getTime(),
    );
  });
});
