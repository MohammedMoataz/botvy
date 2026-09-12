import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import {
  contextOf,
  EVENT_SCHEMA_VERSION,
  type DomainEvent,
} from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SETTINGS_REGISTRY } from '../../shared/settings/settings.registry.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import {
  AthleteProfile,
  type TrainingSlot,
} from './domain/athlete-profile.aggregate.js';
import {
  Program,
  type ProgramWeek,
  type SessionTemplate,
} from './domain/program.aggregate.js';
import { Session } from './domain/session.aggregate.js';
import { addDays, isoWeekday, slotSessionId } from './domain/slot-calendar.js';
import { BootstrapAthleteProfileHandler } from './features/bootstrap-athlete-profile/bootstrap-athlete-profile.handler.js';
import { ChooseSportsHandler } from './features/choose-sports/choose-sports.handler.js';
import {
  SessionMaterialiserSaga,
  slotOrdinal,
  TRAINING_MATERIALISE_JOB,
} from './features/materialise/materialise.saga.js';
import { SetSlotsHandler } from './features/set-slots/set-slots.handler.js';
import {
  InMemoryAthleteProfileRepository,
  InMemoryProgramRepository,
  InMemorySessionRepository,
} from './infrastructure/in-memory-training.repositories.js';

/**
 * The materialiser saga, the athlete profile's two commands, and the bootstrap.
 *
 * `training-clock.spec.ts` grades the arithmetic — the slot calendar, the
 * cut-off, "missed" — against a clock and nothing else. This file grades the
 * *saga*: what it writes, what it deliberately does not write, and what a
 * second pass does. The split is the one the plan asks for, and it is why the
 * calendar helpers below are duplicated rather than imported from that file: a
 * spec that borrows another spec's fixtures fails for reasons that belong to
 * the other file.
 *
 * ## Every calendar here is built from `Date.now()`
 *
 * No literal date appears anywhere below. A fixture pinned to a real date
 * passes until the day the clock reaches it, and this codebase has been bitten
 * by exactly that. `Africa/Cairo` is the fixed test zone the plan names — ahead
 * of UTC, which is the half that used to be got wrong — and the zone-change
 * cases move to `Europe/Berlin`, one hour behind it.
 *
 * ## Every read goes back through the adapter
 *
 * The in-memory repositories store *state* and rehydrate a fresh aggregate on
 * every read, exactly as the Mongo ones do. So nothing below holds on to an
 * instance and asserts about it afterwards: a spec that did would be asserting
 * against its own object rather than against what the store kept, and would
 * pass against a handler that never saved.
 */

const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';
const MEMBER = 'member-1';
const OTHER = 'member-2';

// ------------------------------------------------------------- clock helpers

/** Today, on the member's calendar. */
function today(): string {
  return localDate(new Date(), CAIRO);
}

/** The instant a wall clock names on a local date, in a zone. */
function at(date: string, hhmm: string, zone = CAIRO): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

/**
 * The clock every pass below runs against: six in the morning, today.
 *
 * A morning instant rather than `Date.now()` so that an 18:00 slot on today's
 * own date is unambiguously in the *future* — which is what makes "never the
 * past" and "future planned only" assertable without the suite's behaviour
 * depending on the hour it happens to run at.
 */
function now(): Date {
  return at(today(), '06:00');
}

function todayWeekday(): number {
  return isoWeekday(today());
}

function tomorrowWeekday(): number {
  return isoWeekday(addDays(today(), 1));
}

function slot(overrides: Partial<TrainingSlot> = {}): TrainingSlot {
  return {
    id: 'slot-gym',
    weekday: todayWeekday(),
    start: '18:00',
    durationMin: 60,
    sport: 'gym',
    location: null,
    ...overrides,
  };
}

function template(overrides: Partial<SessionTemplate> = {}): SessionTemplate {
  return {
    templateId: 'tpl-1',
    weekday: null,
    title: 'Push day',
    focus: 'chest',
    exercises: [
      {
        name: 'Bench press',
        notes: null,
        mediaRefs: [],
        sets: [{ targetReps: 8, targetWeightKg: 60 }],
      },
    ],
    ...overrides,
  };
}

function weeks(count: number): ProgramWeek[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    sessions: [
      template({ templateId: `tpl-w${index}`, title: `Week ${index + 1}` }),
    ],
  }));
}

/** A session the member made by hand: client-minted id, no `slotId`. */
function handMade(id = 'hand-made-1', offsetDays = 2): Session {
  return Session.plan({
    id,
    userId: MEMBER,
    plannedAt: at(addDays(today(), offsetDays), '20:00'),
    durationMin: 45,
    sport: 'football',
    title: 'Five-a-side',
    focus: null,
    programId: null,
    weekIndex: null,
    slotId: null,
    suggestionId: null,
    exercises: [],
    notes: null,
    createdAt: now(),
  });
}

/** A slot's session on a given day offset, at the derived id. */
function slotSession(offsetDays: number, slotId = 'slot-gym'): Session {
  const date = addDays(today(), offsetDays);
  return Session.plan({
    id: slotSessionId(MEMBER, slotId, date),
    userId: MEMBER,
    plannedAt: at(date, '18:00'),
    durationMin: 60,
    sport: 'gym',
    title: 'gym',
    focus: null,
    programId: null,
    weekIndex: null,
    slotId,
    suggestionId: null,
    exercises: [],
    notes: null,
    createdAt: now(),
  });
}

function event(
  name: string,
  payload: unknown,
  userId: string | null = MEMBER,
): DomainEvent {
  return {
    eventId: newId(),
    name,
    context: contextOf(name),
    aggregate: { type: 'test', id: 'test' },
    userId,
    occurredAt: now(),
    payload,
    schemaVersion: EVENT_SCHEMA_VERSION,
  };
}

/** The member's zone, changeable mid-test, and throwable for one member. */
class StubMemberContext extends MemberContextPort {
  private readonly zones = new Map<string, string>();
  readonly broken = new Set<string>();

  zone(userId: string, timezone: string): void {
    this.zones.set(userId, timezone);
  }

  async clock(userId: string): Promise<MemberClock> {
    if (this.broken.has(userId)) {
      throw new Error(`no readable zone for ${userId}`);
    }
    return { timezone: this.zones.get(userId) ?? CAIRO };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return {
      leadTimes: ['1h', '0m'],
      quietHours: { from: '22:00', to: '07:00' },
    };
  }
}

// --------------------------------------------------------------------- bench

interface Bench {
  uow: InMemoryUnitOfWork;
  profiles: InMemoryAthleteProfileRepository;
  sessions: InMemorySessionRepository;
  programs: InMemoryProgramRepository;
  member: StubMemberContext;
  stamp: ReturnType<typeof vi.fn>;
  saga: SessionMaterialiserSaga;
  sports: ChooseSportsHandler;
  slots: SetSlotsHandler;
  bootstrap: BootstrapAthleteProfileHandler;
  /** Every event the unit of work has collected, by name. */
  names: () => string[];
  /** How many session writes have happened. */
  writes: () => number;
  /** Forget the events and the write count, keeping the rows. */
  quiesce: () => void;
  /** The member's sessions, tombstones included, soonest first. */
  mine: (userId?: string) => Promise<Session[]>;
}

/**
 * `days` is written into the settings store rather than passed to the saga,
 * because the point of T612 is that the horizon comes from the registry key and
 * this context holds no literal. A bench built without it exercises the
 * registry's own default.
 */
function bench(options: { days?: number } = {}): Bench {
  const uow = new InMemoryUnitOfWork();
  const profiles = new InMemoryAthleteProfileRepository(uow);
  const sessions = new InMemorySessionRepository(uow);
  const programs = new InMemoryProgramRepository(uow);
  const member = new StubMemberContext();

  const store = new InMemorySettingsStore();
  if (options.days !== undefined) {
    store.rows.set('training.materialiseDays', {
      key: 'training.materialiseDays',
      value: options.days,
      updatedAt: new Date(),
      updatedBy: null,
    });
  }
  const settings = new SettingsService(store, new InMemoryAuditAdapter());

  const stamp = vi.fn(async () => undefined);
  const heartbeats = { stamp } as unknown as HeartbeatService;

  // Counted rather than recorded, which is how "a second pass writes nothing"
  // is asserted as an absence of writes rather than as a repeated row count —
  // a count of rows is equally consistent with deleting and re-creating the
  // whole week.
  const saveSpy = vi.spyOn(sessions, 'save');

  let exercise = 0;
  const saga = new SessionMaterialiserSaga(
    uow,
    profiles,
    sessions,
    programs,
    member,
    settings,
    heartbeats,
    () => `exercise-${(exercise += 1)}`,
  );

  return {
    uow,
    profiles,
    sessions,
    programs,
    member,
    stamp,
    saga,
    sports: new ChooseSportsHandler(uow, profiles),
    slots: new SetSlotsHandler(uow, profiles),
    bootstrap: new BootstrapAthleteProfileHandler(uow, profiles),
    names: () => uow.events.map((entry) => entry.name),
    writes: () => saveSpy.mock.calls.length,
    quiesce: () => {
      uow.reset();
      sessions.events.length = 0;
      saveSpy.mockClear();
    },
    mine: async (userId = MEMBER) =>
      (await sessions.pullSince(userId, null)).sort(
        (a, b) => a.plannedAt.getTime() - b.plannedAt.getTime(),
      ),
  };
}

/** Writes a member's timetable straight to the store, without the command. */
async function withSlots(
  b: Bench,
  slots: TrainingSlot[],
  userId = MEMBER,
): Promise<void> {
  const profile =
    (await b.profiles.find(userId)) ?? AthleteProfile.empty(userId, now());
  profile.setSlots(slots, now());
  await b.uow.run(() => b.profiles.save(profile));
  b.quiesce();
}

/** Puts a session in as a fixture, through the adapter and its transaction. */
async function given(b: Bench, ...sessions: Session[]): Promise<void> {
  await b.uow.run(async () => {
    for (const session of sessions) await b.sessions.save(session);
  });
  b.quiesce();
}

/** An applied, active program. */
async function applied(
  b: Bench,
  programWeeks: ProgramWeek[],
  startDate = today(),
  id = 'program-1',
): Promise<Program> {
  const program = Program.create({
    id,
    userId: MEMBER,
    title: 'Four weeks',
    sport: 'gym',
    source: 'user',
    sourceLinkIds: [],
    weeks: programWeeks,
    createdAt: now(),
  });
  program.applyFrom(startDate, now());
  await b.uow.run(() => b.programs.save(program));
  b.quiesce();
  return program;
}

/** What a session's content is, for a "left exactly as it was" comparison. */
function content(session: Session | undefined) {
  return {
    title: session?.title,
    focus: session?.focus,
    programId: session?.programId,
    weekIndex: session?.weekIndex,
    exercises: session?.exercises.map((exercise) => exercise.name),
    plannedAt: session?.plannedAt.getTime(),
    updatedAt: session?.updatedAt.getTime(),
  };
}

// =========================================================== the athlete profile

describe('choose-sports and set-slots', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('writes the profile and its event in one transaction', async () => {
    const result = await b.sports.handle(MEMBER, ['gym', 'swimming'], now());

    expect(result.changed).toBe(true);
    expect((await b.profiles.find(MEMBER))?.sports).toEqual(['gym', 'swimming']);
    expect(b.names()).toEqual(['training.SportsChanged']);
  });

  it('creates the profile when the bootstrap has not landed yet', async () => {
    // The relay is eventual, so a member can reach this screen before the
    // registration event has been forwarded. A 404 here would be a race the
    // member has to lose.
    expect(await b.profiles.find(MEMBER)).toBeNull();

    await b.slots.handle(MEMBER, [slot()], now());

    expect((await b.profiles.find(MEMBER))?.slots).toHaveLength(1);
    expect(b.names()).toEqual(['training.SlotsChanged']);
  });

  it('raises nothing when the editor is saved unchanged', async () => {
    await b.slots.handle(MEMBER, [slot()], now());
    b.quiesce();

    const again = await b.slots.handle(MEMBER, [slot()], now());

    // An event here wakes the materialiser, which walks the member's next
    // fortnight. A no-op save is the commonest thing a form does.
    expect(again.changed).toBe(false);
    expect(b.names()).toEqual([]);
  });

  it('replaces the timetable wholesale rather than merging it', async () => {
    await b.slots.handle(
      MEMBER,
      [slot(), slot({ id: 'slot-swim', sport: 'swimming' })],
      now(),
    );
    await b.slots.handle(
      MEMBER,
      [slot({ id: 'slot-swim', sport: 'swimming' })],
      now(),
    );

    expect((await b.profiles.find(MEMBER))?.slots.map((s) => s.id)).toEqual([
      'slot-swim',
    ]);
  });

  it('refuses a malformed slot with its rule code', async () => {
    await expect(
      b.slots.handle(MEMBER, [slot({ start: '9pm' })], now()),
    ).rejects.toThrow(/wall-clock/);
  });
});

describe('bootstrap-athlete-profile', () => {
  it('writes an empty profile, and a second delivery creates nothing', async () => {
    const b = bench();
    const registered = event('identity.UserRegistered', { email: 'a@b.c' });

    expect(await b.bootstrap.handle(registered)).toBe('created');
    const first = await b.profiles.find(MEMBER);
    expect(first?.sports).toEqual([]);
    expect(first?.slots).toEqual([]);

    // Same event again — the relay delivers at least once. It must not throw
    // and must not reset a member who has since chosen their sports.
    await b.sports.handle(MEMBER, ['gym'], now());
    expect(await b.bootstrap.handle(registered)).toBe('already-there');
    expect((await b.profiles.find(MEMBER))?.sports).toEqual(['gym']);
  });

  it('does nothing for an event carrying no member', async () => {
    const b = bench();
    expect(
      await b.bootstrap.handle(event('identity.UserRegistered', {}, null)),
    ).toBe('already-there');
    expect(b.profiles.rows.size).toBe(0);
  });
});

// =============================================================== the saga

describe('the materialiser: creating the horizon', () => {
  it('creates one session per occurrence, at the derived id', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);

    const result = await b.saga.forMember(MEMBER, {}, now());

    // Today and today + 7, inside a fourteen-day horizon.
    expect(result.created).toBe(2);
    const sessions = await b.mine();
    expect(sessions.map((session) => session.id)).toEqual([
      slotSessionId(MEMBER, 'slot-gym', today()),
      slotSessionId(MEMBER, 'slot-gym', addDays(today(), 7)),
    ]);
    expect(sessions[0]?.plannedAt).toEqual(at(today(), '18:00'));
    expect(sessions[0]?.slotId).toBe('slot-gym');
    expect(sessions[0]?.status).toBe('planned');
    expect(sessions[0]?.durationMin).toBe(60);
    // The slot's sport is the title of an unfilled session — the member's own
    // word, not a configurable default.
    expect(sessions[0]?.title).toBe('gym');
  });

  it('announces every new session through the outbox', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);

    await b.saga.forMember(MEMBER, {}, now());

    // The only announcement there is: the alert pipeline, the rhythm's
    // tomorrow draft and P7's suggestion saga all hang off it. And it reaches
    // the outbox in the same transaction as the row — the unit of work refuses
    // an event raised outside one, so this assertion also proves that.
    expect(b.names()).toEqual([
      'training.SessionScheduled',
      'training.SessionScheduled',
    ]);
  });

  it('writes nothing at all on a second pass', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());
    const before = (await b.mine()).map(content);
    b.quiesce();

    const again = await b.saga.forMember(MEMBER, {}, now());

    expect(again).toEqual({ created: 0, filled: 0, removed: 0 });
    expect(b.writes()).toBe(0);
    expect(b.names()).toEqual([]);
    expect((await b.mine()).map(content)).toEqual(before);
  });

  it('keeps two sports in one week apart', async () => {
    const b = bench({ days: 7 });
    await withSlots(b, [
      slot(),
      slot({
        id: 'slot-swim',
        weekday: tomorrowWeekday(),
        start: '07:00',
        sport: 'swimming',
      }),
    ]);

    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result.created).toBe(2);
    expect((await b.mine()).map((session) => session.sport).sort()).toEqual([
      'gym',
      'swimming',
    ]);
  });

  it('stores nothing on a rest day', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);

    await b.saga.forMember(MEMBER, {}, now());

    // A rest day is an absence, not a row with a flag on it.
    const dates = (await b.mine()).map((session) => session.localDateIn(CAIRO));
    expect(dates).not.toContain(addDays(today(), 1));
    expect(new Set(dates.map((date) => isoWeekday(date)))).toEqual(
      new Set([todayWeekday()]),
    );
  });

  it('materialises nothing for a member whose profile has not arrived', async () => {
    const b = bench({ days: 14 });

    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result).toEqual({ created: 0, filled: 0, removed: 0 });
    expect(b.writes()).toBe(0);
  });
});

describe('the materialiser: the horizon is a registry key', () => {
  it('honours a changed setting on its next run', async () => {
    const b = bench({ days: 1 });
    await withSlots(b, [slot()]);

    await b.saga.forMember(MEMBER, {}, now());

    // One day of horizon: today's occurrence and not next week's.
    expect(await b.mine()).toHaveLength(1);
  });

  it('reads the registry default when nothing is stored', async () => {
    const b = bench();
    await withSlots(b, [slot()]);

    await b.saga.forMember(MEMBER, {}, now());

    // Fourteen days is the registry's number, not this context's: the saga
    // holds no literal, so the assertion is against the registry itself.
    expect(SETTINGS_REGISTRY['training.materialiseDays'].default).toBe(14);
    expect(await b.mine()).toHaveLength(2);
  });
});

describe('the materialiser: filling from the active program', () => {
  it('copies the template onto a new session', async () => {
    const b = bench({ days: 7 });
    await withSlots(b, [slot()]);
    await applied(b, weeks(1));

    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result).toEqual({ created: 1, filled: 1, removed: 0 });
    const session = (await b.mine())[0];
    expect(session?.title).toBe('Week 1');
    expect(session?.focus).toBe('chest');
    expect(session?.programId).toBe('program-1');
    expect(session?.weekIndex).toBe(0);
    expect(session?.exercises).toHaveLength(1);
    expect(session?.exercises[0]?.sets[0]).toMatchObject({
      targetReps: 8,
      targetWeightKg: 60,
      actualReps: null,
      done: false,
    });
  });

  it('lands week four when the horizon reaches it, not at apply time', async () => {
    // FR-008's second half, and the reason `appliedStartDate` exists at all.
    const short = bench({ days: 14 });
    await withSlots(short, [slot()]);
    await applied(short, weeks(4));
    await short.saga.forMember(MEMBER, {}, now());

    expect((await short.mine()).map((session) => session.weekIndex)).toEqual([
      0, 1,
    ]);

    const long = bench({ days: 28 });
    await withSlots(long, [slot()]);
    await applied(long, weeks(4));
    await long.saga.forMember(MEMBER, {}, now());

    const filled = await long.mine();
    expect(filled.map((session) => session.weekIndex)).toEqual([0, 1, 2, 3]);
    expect(filled[3]?.title).toBe('Week 4');
  });

  it('leaves already-filled sessions exactly as they are once the program is archived', async () => {
    const b = bench({ days: 21 });
    await withSlots(b, [slot()]);
    const program = await applied(b, weeks(4));
    await b.saga.forMember(MEMBER, {}, now());
    const before = (await b.mine()).map(content);
    expect(before).toHaveLength(3);

    program.archive(now());
    await b.uow.run(() => b.programs.save(program));
    b.quiesce();

    // A second slot, so the pass has work to do — and would fill it if it
    // consulted an archived program.
    await withSlots(b, [
      slot(),
      slot({
        id: 'slot-swim',
        weekday: tomorrowWeekday(),
        start: '07:00',
        sport: 'swimming',
      }),
    ]);

    const result = await b.saga.forMember(MEMBER, {}, now());

    // Archiving means "stop putting this into my weeks"; it does not mean
    // "take it out of the weeks I can already see". Deleting content a member
    // has looked at — and may have edited — is worse than leaving it, and
    // applying another program is the path that replaces content, with its
    // warning.
    expect(result.filled).toBe(0);
    expect(result.created).toBe(3);
    const after = await b.mine();
    expect(
      after.filter((session) => session.slotId === 'slot-gym').map(content),
    ).toEqual(before);
    const swim = after.find((session) => session.slotId === 'slot-swim');
    expect(swim?.title).toBe('swimming');
    expect(swim?.programId).toBeNull();
    expect(swim?.exercises).toEqual([]);
  });

  it('fills nothing for a date before the program starts', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    // Applied from tomorrow: the horizon starts today, so a program may
    // legitimately begin after its first occurrence.
    await applied(b, weeks(4), addDays(today(), 1));

    await b.saga.forMember(MEMBER, {}, now());

    // Today's session predates the apply; next week's does not.
    expect((await b.mine()).map((session) => session.programId)).toEqual([
      null,
      'program-1',
    ]);
  });

  /*
   * ---- the defect this phase found -------------------------------------
   *
   * The saga filled a session **only at the moment it created it**. So the
   * ordinary case — a member with a populated fortnight who then applies a
   * program — warned them that five planned sessions would be replaced, took
   * their `force`, and rewrote none of them. FR-008's first sentence is that
   * applying a program fills upcoming slot sessions; the four tests below are
   * that sentence and the three refusals that bound it.
   */
  it('fills the sessions that already existed when the program is applied', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    // The fortnight first, with no program: exactly what a member has before
    // they open the programs screen.
    await b.saga.forMember(MEMBER, {}, now());
    const bare = await b.mine();
    expect(bare.map((session) => session.title)).toEqual(['gym', 'gym']);

    await applied(b, weeks(4));
    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result).toEqual({ created: 0, filled: 2, removed: 0 });
    const after = await b.mine();
    expect(after.map((session) => session.title)).toEqual(['Week 1', 'Week 2']);
    expect(after.map((session) => session.weekIndex)).toEqual([0, 1]);
    expect(after.map((session) => session.programId)).toEqual([
      'program-1',
      'program-1',
    ]);
    expect(after[0]?.exercises.map((exercise) => exercise.name)).toEqual([
      'Bench press',
    ]);
    // The ids are the derived ones: filling is a rewrite of the row the member
    // is already looking at, not a delete and a re-create, so a device that
    // has it pulls one update rather than a tombstone and a new row.
    expect(after.map((session) => session.id)).toEqual(
      bare.map((session) => session.id),
    );
  });

  it('announces the fill, because the title is what the reminder says', async () => {
    const b = bench({ days: 7 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());
    b.quiesce();

    await applied(b, weeks(1));
    b.quiesce();
    await b.saga.forMember(MEMBER, {}, now());

    // Without this the member reads "Week 1" on screen and gets a
    // notification that says "gym" — P2's "every task notification said
    // 'Task due'" in a different context.
    expect(b.names()).toContain('training.SessionRescheduled');
    expect(
      b.uow.events.find(
        (entry) => entry.name === 'training.SessionRescheduled',
      )?.payload,
    ).toMatchObject({ title: 'Week 1' });
  });

  it('leaves a session the member has written in alone', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());
    const [first] = await b.mine();

    /*
     * A note, not a logged set — because a bare slot session has no exercises
     * to log against, which is the state a member's fortnight is actually in
     * before they apply anything. `isUntouched` counts notes for exactly this
     * reason: somebody who wrote "shoulder hurt, stopped early" has recorded
     * the session as surely as one who typed numbers.
     *
     * FR-008 never overwrites a record, and this is the same predicate
     * `ApplyProgramHandler.gather` uses to leave a session out of the warning
     * — so the list the member agreed to and the rows actually rewritten are
     * the same set.
     */
    await b.uow.run(async () => {
      first!.edit({ notes: 'shoulder hurt, stopped early' }, now());
      await b.sessions.save(first!);
    });
    b.quiesce();

    await applied(b, weeks(4));
    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result.filled).toBe(1);
    const after = await b.mine();
    expect(after[0]?.title).toBe('gym');
    expect(after[0]?.programId).toBeNull();
    expect(after[1]?.title).toBe('Week 2');
  });

  it('does not rewrite a session that already carries this week', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await applied(b, weeks(4));
    await b.saga.forMember(MEMBER, {}, now());
    const before = (await b.mine()).map(content);
    b.quiesce();

    const result = await b.saga.forMember(MEMBER, {}, now());

    // The pass runs nightly and on every slot edit. Filling unconditionally
    // would mint new exercise ids, bump `updatedAt` and push a delta to every
    // device each time, and re-announce an alert that had not changed.
    expect(result).toEqual({ created: 0, filled: 0, removed: 0 });
    expect(b.writes()).toBe(0);
    expect((await b.mine()).map(content)).toEqual(before);
  });

  it('fills nothing once the program runs out of weeks', async () => {
    const b = bench({ days: 21 });
    await withSlots(b, [slot()]);
    await applied(b, weeks(2));

    await b.saga.forMember(MEMBER, {}, now());

    // A program shorter than the weeks remaining simply ends: the slots
    // continue, empty, until another is applied.
    const sessions = await b.mine();
    expect(sessions.map((session) => session.weekIndex)).toEqual([0, 1, null]);
    expect(sessions[2]?.title).toBe('gym');
  });

  it('pairs a floating template by the slot’s place in the member’s own order', async () => {
    // Two slots on one day. The member's list has the 18:00 gym first even
    // though the 07:00 swim is earlier on the clock, and floating templates
    // fill by position — so sorting by time here would silently re-pair every
    // template the moment they dragged a row.
    const b = bench({ days: 1 });
    const gym = slot({ id: 'slot-gym', start: '18:00' });
    const swim = slot({ id: 'slot-swim', start: '07:00', sport: 'swimming' });
    await withSlots(b, [gym, swim]);
    await applied(b, [
      {
        index: 0,
        sessions: [
          template({ templateId: 'tpl-a', title: 'First' }),
          template({ templateId: 'tpl-b', title: 'Second' }),
        ],
      },
    ]);

    await b.saga.forMember(MEMBER, {}, now());

    expect(slotOrdinal([gym, swim], gym)).toBe(0);
    expect(slotOrdinal([gym, swim], swim)).toBe(1);
    const byId = new Map(
      (await b.mine()).map((session) => [session.slotId, session]),
    );
    expect(byId.get('slot-gym')?.title).toBe('First');
    expect(byId.get('slot-swim')?.title).toBe('Second');
  });

  it('counts a day’s slots only, so week four’s ordinal is week one’s', async () => {
    const b = bench({ days: 14 });
    const gym = slot({ id: 'slot-gym' });
    const swim = slot({ id: 'slot-swim', start: '07:00', sport: 'swimming' });
    await withSlots(b, [gym, swim]);
    await applied(b, [
      {
        index: 0,
        sessions: [
          template({ templateId: 'a0', title: 'W1 first' }),
          template({ templateId: 'b0', title: 'W1 second' }),
        ],
      },
      {
        index: 1,
        sessions: [
          template({ templateId: 'a1', title: 'W2 first' }),
          template({ templateId: 'b1', title: 'W2 second' }),
        ],
      },
    ]);

    await b.saga.forMember(MEMBER, {}, now());

    // The ordinal comes from the profile, which does not change between one
    // day of the fortnight and the next. Taking it from the occurrence list
    // would count the whole fortnight rather than the day.
    expect((await b.mine()).map((session) => session.title)).toEqual([
      'W1 second',
      'W1 first',
      'W2 second',
      'W2 first',
    ]);
  });

  it('prefers a template that names the weekday over a floating one', async () => {
    const b = bench({ days: 1 });
    await withSlots(b, [slot()]);
    await applied(b, [
      {
        index: 0,
        sessions: [
          template({ templateId: 'floating', title: 'Anywhere' }),
          template({
            templateId: 'pinned',
            weekday: todayWeekday(),
            title: 'This day',
          }),
        ],
      },
    ]);

    await b.saga.forMember(MEMBER, {}, now());

    expect((await b.mine())[0]?.title).toBe('This day');
  });
});

describe('the materialiser: a zone change', () => {
  it('re-times every future planned session from the slot’s wall clock', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());
    const before = (await b.mine()).map((session) =>
      session.plannedAt.getTime(),
    );
    b.quiesce();

    b.member.zone(MEMBER, BERLIN);
    await b.saga.onMemberContextChanged(
      event('profile.ProfileUpdated', { changed: ['timezone'] }),
    );

    const sessions = await b.mine();
    // The instant that was 18:00 in Cairo is not 18:00 in Berlin, and nothing
    // re-reads the slot at alert time.
    expect(sessions[0]?.plannedAt).toEqual(at(today(), '18:00', BERLIN));
    expect(sessions[0]?.plannedAt.getTime()).not.toBe(before[0]);
    expect(sessions[1]?.plannedAt).toEqual(
      at(addDays(today(), 7), '18:00', BERLIN),
    );
    // The derived id survives the move, so nothing is orphaned and no second
    // copy of the fortnight appears.
    expect(sessions.map((session) => session.id)).toEqual([
      slotSessionId(MEMBER, 'slot-gym', today()),
      slotSessionId(MEMBER, 'slot-gym', addDays(today(), 7)),
    ]);
    // `SessionRescheduled` is what moves the alerts. A silent field write would
    // move the session and leave the reminder where it was.
    expect(b.names()).toEqual([
      'training.SessionRescheduled',
      'training.SessionRescheduled',
    ]);
  });

  it('leaves the past, the finished and the hand-made alone', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    const past = slotSession(-7);
    const booked = slotSession(14);
    booked.complete(now());
    const byHand = handMade();
    await given(b, past, booked, byHand);

    const untouched = new Map(
      (await b.mine()).map((session) => [
        session.id,
        session.plannedAt.getTime(),
      ]),
    );

    b.member.zone(MEMBER, BERLIN);
    await b.saga.onMemberContextChanged(
      event('profile.ProfileUpdated', { changed: ['timezone'] }),
    );

    const after = new Map(
      (await b.mine()).map((session) => [session.id, session]),
    );
    expect(after.get(past.id)?.plannedAt.getTime()).toBe(
      untouched.get(past.id),
    );
    expect(after.get(booked.id)?.plannedAt.getTime()).toBe(
      untouched.get(booked.id),
    );
    expect(after.get(booked.id)?.status).toBe('completed');
    // A hand-made session has no slot and therefore no wall clock: the member
    // chose an instant, and guessing would move an appointment they never
    // described in wall-clock terms.
    expect(after.get(byHand.id)?.plannedAt.getTime()).toBe(
      untouched.get(byHand.id),
    );
  });

  it('re-times nothing when the zone did not move', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());
    b.quiesce();

    // Same zone, same event: `edit` compares before it writes, so a redelivered
    // event saves nothing and raises nothing.
    await b.saga.onMemberContextChanged(
      event('profile.ProfileUpdated', { changed: ['timezone'] }),
    );

    expect(b.writes()).toBe(0);
    expect(b.names()).toEqual([]);
  });

  it('ignores a profile change that is not the zone', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);

    await b.saga.onMemberContextChanged(
      event('profile.ProfileUpdated', { changed: ['displayName'] }),
    );

    // A member editing their food dislikes must not cost a pass.
    expect(b.writes()).toBe(0);
  });

  it('runs a pass for a changed cut-off and changes no session', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);

    await b.saga.onMemberContextChanged(
      event('profile.PreferencesChanged', { changed: ['nextPracticeCutoff'] }),
    );

    // The cut-off is read by `nextPractice` and by nothing that writes a row,
    // so its pass changes no instant — but the horizon is still materialised,
    // which is what the trigger is for.
    const sessions = await b.mine();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.plannedAt).toEqual(at(today(), '18:00'));
    expect(b.names()).toEqual([
      'training.SessionScheduled',
      'training.SessionScheduled',
    ]);
  });

  it('ignores a preferences change that names neither', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);

    await b.saga.onMemberContextChanged(
      event('profile.PreferencesChanged', { changed: ['mealMode'] }),
    );

    expect(b.writes()).toBe(0);
  });
});

describe('the materialiser: the reconcile', () => {
  it('loses the future sessions of a removed slot and keeps the past ones', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());
    const past = slotSession(-7);
    await given(b, past);

    await withSlots(b, []);
    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result.removed).toBe(2);
    const sessions = await b.mine();
    const future = sessions.filter((session) => session.plannedAt > now());
    expect(future).toHaveLength(2);
    expect(future.every((session) => session.isDeleted)).toBe(true);
    // Deleting must not touch the status: it is the only record of whether the
    // session was completed, cancelled or never dealt with, and the Deleted
    // view exists to show exactly that.
    expect(future.every((session) => session.status === 'planned')).toBe(true);
    expect(sessions.find((s) => s.id === past.id)?.isDeleted).toBe(false);
    // Tombstoned, not removed: a hard delete never reaches a phone, whose
    // delete sweep runs only against a full snapshot.
    expect(b.sessions.rows.size).toBe(3);
    expect(b.names()).toEqual([
      'training.SessionDeleted',
      'training.SessionDeleted',
    ]);
  });

  it('never touches a session the member has dealt with', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());

    const [first, second] = await b.mine();
    first!.skip(now());
    second!.complete(now());
    await given(b, first!, second!);

    await withSlots(b, []);
    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result.removed).toBe(0);
    const after = await b.mine();
    expect(after.map((session) => session.status)).toEqual([
      'skipped',
      'completed',
    ]);
    expect(after.every((session) => !session.isDeleted)).toBe(true);
  });

  it('never touches a session with no slot', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    const byHand = handMade();
    await given(b, byHand);

    // No slots at all: every slot-borne session is an orphan, and this one is
    // still not, because it never came from a slot.
    await withSlots(b, []);
    await b.saga.forMember(MEMBER, {}, now());

    const after = await b.mine();
    expect(after.find((session) => session.id === byHand.id)?.isDeleted).toBe(
      false,
    );
  });

  it('brings a slot’s sessions back when the slot returns', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.forMember(MEMBER, {}, now());

    await withSlots(b, []);
    await b.saga.forMember(MEMBER, {}, now());
    expect((await b.mine()).every((session) => session.isDeleted)).toBe(true);
    b.quiesce();

    // The editor keeps slot ids, so putting a slot back is the same id. The id
    // is derived, so without a restore the create would be skipped for ever
    // and the member would silently have no sessions for that slot.
    await withSlots(b, [slot()]);
    const result = await b.saga.forMember(MEMBER, {}, now());

    expect(result.created).toBe(2);
    expect((await b.mine()).every((session) => session.isDeleted)).toBe(false);
    expect(b.names()).toEqual([
      'training.SessionScheduled',
      'training.SessionScheduled',
    ]);
  });

  it('leaves another member’s sessions alone', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await withSlots(b, [slot({ id: 'slot-other' })], OTHER);
    await b.saga.forMember(OTHER, {}, now());
    expect(await b.mine(OTHER)).toHaveLength(2);

    // The member has no slots, so their own fortnight reconciles to nothing —
    // and the other member's, which is keyed to a slot this profile has never
    // heard of, must not be swept with it.
    await withSlots(b, []);
    await b.saga.forMember(MEMBER, {}, now());

    const theirs = await b.mine(OTHER);
    expect(theirs).toHaveLength(2);
    expect(theirs.every((session) => !session.isDeleted)).toBe(true);
  });
});

describe('the materialiser: the nightly pass', () => {
  it('walks every member with a week and stamps the heartbeat', async () => {
    const b = bench({ days: 7 });
    await withSlots(b, [slot()]);
    await withSlots(b, [slot({ id: 'slot-other' })], OTHER);
    // A member with no slots is not in the pass at all.
    await b.uow.run(() =>
      b.profiles.save(AthleteProfile.empty('member-3', now())),
    );
    b.quiesce();

    const result = await b.saga.handle(now());

    expect(result.members).toBe(2);
    expect(result.created).toBe(2);
    expect(result.ms).toBeGreaterThanOrEqual(0);
    expect(b.stamp).toHaveBeenCalledWith(
      TRAINING_MATERIALISE_JOB,
      true,
      undefined,
      expect.any(Number),
    );
  });

  it('logs and skips a member who throws, and finishes the others', async () => {
    const b = bench({ days: 7 });
    await withSlots(b, [slot()]);
    await withSlots(b, [slot({ id: 'slot-other' })], OTHER);
    b.member.broken.add(MEMBER);

    const result = await b.saga.handle(now());

    // One member with an unreadable zone must not stop the horizon advancing
    // for everybody else — and the counters are incremented as each member
    // returns, so the one that threw leaves the totals short while whatever it
    // saved before throwing stands.
    expect(result.members).toBe(2);
    expect(result.created).toBe(1);
    expect(await b.mine(MEMBER)).toHaveLength(0);
    expect(await b.mine(OTHER)).toHaveLength(1);
    expect(b.stamp).toHaveBeenCalledWith(
      TRAINING_MATERIALISE_JOB,
      true,
      undefined,
      expect.any(Number),
    );
  });

  it('stamps a failure and rethrows when the pass itself cannot start', async () => {
    const b = bench({ days: 7 });
    vi.spyOn(b.profiles, 'memberIdsWithSlots').mockRejectedValue(
      new Error('mongo is away'),
    );

    await expect(b.saga.handle(now())).rejects.toThrow('mongo is away');

    // A scheduled job that stops arriving has to be visible; `/health` reports
    // this key stale after fifteen minutes, and a silent 401 between n8n and
    // the gateway once went unnoticed for days.
    expect(b.stamp).toHaveBeenCalledWith(
      TRAINING_MATERIALISE_JOB,
      false,
      'mongo is away',
      expect.any(Number),
    );
  });

  it('is idempotent across a whole second night', async () => {
    const b = bench({ days: 14 });
    await withSlots(b, [slot()]);
    await b.saga.handle(now());
    b.quiesce();

    const second = await b.saga.handle(now());

    expect(second.created).toBe(0);
    expect(second.removed).toBe(0);
    expect(b.writes()).toBe(0);
    expect(b.names()).toEqual([]);
  });
});

describe('the materialiser: the training triggers', () => {
  it('materialises on SlotsChanged, SportsChanged and ProgramApplied', async () => {
    for (const name of [
      'training.SlotsChanged',
      'training.SportsChanged',
      'training.ProgramApplied',
    ]) {
      const b = bench({ days: 7 });
      await withSlots(b, [slot()]);

      await b.saga.onTrainingChanged(event(name, {}));

      expect(await b.mine(), name).toHaveLength(1);
    }
  });

  it('does nothing for an event carrying no member', async () => {
    const b = bench({ days: 7 });
    await withSlots(b, [slot()]);

    await b.saga.onTrainingChanged(event('training.SlotsChanged', {}, null));

    expect(b.writes()).toBe(0);
  });
});
