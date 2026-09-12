import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/cqrs/ids.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { SessionRuleError } from './domain/session.aggregate.js';
import { addDays } from './domain/slot-calendar.js';
import { AthleteProfileQueryHandler } from './features/athlete-profile/athlete-profile.query.js';
import { CancelSessionHandler } from './features/cancel-session/cancel-session.handler.js';
import { CompleteSessionHandler } from './features/complete-session/complete-session.handler.js';
import {
  CreateSessionHandler,
  InvalidSessionId,
  type CreateSessionCommand,
} from './features/create-session/create-session.handler.js';
import { DeleteSessionHandler } from './features/delete-session/delete-session.handler.js';
import { LogSessionHandler } from './features/log-session/log-session.handler.js';
import { NextPracticeCutoffPort } from './domain/training.ports.js';
import { NextPracticeQueryHandler } from './features/next-practice/next-practice.query.js';
import { PurgeSessionHandler } from './features/purge-session/purge-session.handler.js';
import { ReopenSessionHandler } from './features/reopen-session/reopen-session.handler.js';
import { RestoreSessionHandler } from './features/restore-session/restore-session.handler.js';
import { SessionQueryHandler } from './features/session/session.query.js';
import { SessionsInRangeQueryHandler } from './features/sessions/sessions-in-range.query.js';
import { SessionsQueryHandler } from './features/sessions/sessions.query.js';
import { SkipSessionHandler } from './features/skip-session/skip-session.handler.js';
import { UpdateSessionHandler } from './features/update-session/update-session.handler.js';
import {
  InMemoryAthleteProfileRepository,
  InMemorySessionRepository,
} from './infrastructure/in-memory-training.repositories.js';

/**
 * The session slices: the commands, the reads, and the two published surfaces.
 *
 * The clock *rules* are graded in `training-clock.spec.ts` — the cut-off over a
 * fortnight, the slot calendar, `isMissed` against a moving now. This file
 * grades the **handlers**: which refusals reach the caller, what a replayed
 * create does, whether the read model carries the derived fields, and whether
 * `nextPractice` passes the member's own zone and the member's own cut-off
 * through rather than something of its own.
 *
 * That split matters for the cut-off in particular. A handler spec that
 * re-asserted the rule would pass while the handler read the *installation*
 * default instead of the member's preference, because the two agree for anybody
 * who has not changed it — which is exactly what made the same bug invisible in
 * `defaults.meetingDurationMin`. So the stub below answers a cut-off different
 * from the registry's, and the assertion is that the answer changes with it.
 *
 * ## Every date is computed from the clock, never written down
 *
 * `Date.now()` anchors all of it, because a fixture pinned to a real date passes
 * until the day the clock reaches it. `Africa/Cairo` is this phase's fixed test
 * zone: it is ahead of UTC and observes daylight saving, and "ahead of UTC" is
 * the half that has been got wrong before — at 23:00 UTC it is already tomorrow
 * in Cairo, so a spec that ran in UTC would agree with a broken implementation
 * for most of the day. The helpers are duplicated from `training-clock.spec.ts`
 * rather than imported: a spec that borrows another spec's fixtures fails for
 * reasons that belong to the other file.
 */

const CAIRO = 'Africa/Cairo';
/** Six or seven hours behind Cairo — far enough that a midnight falls between. */
const NEW_YORK = 'America/New_York';
const MEMBER = 'member-1';
const OTHER = 'member-2';

/** The registry's own default, restated so the stubs can differ from it. */
const REGISTRY_CUTOFF = '21:00';

// ------------------------------------------------------------- clock helpers

function at(date: string, hhmm: string, zone = CAIRO): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

function today(zone = CAIRO): string {
  return localDate(new Date(), zone);
}

// -------------------------------------------------------------- the harness

/** The member's clock, stubbed. Cairo unless a test moves them. */
class StubMemberContext extends MemberContextPort {
  timezone = CAIRO;

  async clock(): Promise<MemberClock> {
    return { timezone: this.timezone };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: ['1h', '0m'], quietHours: { from: '22:00', to: '07:00' } };
  }
}

/**
 * The member's own next-practice cut-off.
 *
 * A stub for `NextPracticeCutoffPort`, which the real module binds to Profile's
 * published `preferencesFor` read — never to `SettingsService`, because
 * `nextPracticeCutoff` is a `user_preferences` field seeded from
 * `settings.defaults.*` (constitution XII, FR-007). It starts at a value
 * **different** from the registry default on purpose: a stub echoing 21:00 would
 * pass whether the handler asked the member or the installation.
 */
class StubCutoff extends NextPracticeCutoffPort {
  cutoff = '18:00';

  async cutoffFor(): Promise<string> {
    return this.cutoff;
  }
}

interface Harness {
  uow: InMemoryUnitOfWork;
  sessions: InMemorySessionRepository;
  profiles: InMemoryAthleteProfileRepository;
  member: StubMemberContext;
  cutoffs: StubCutoff;
  create: CreateSessionHandler;
  update: UpdateSessionHandler;
  log: LogSessionHandler;
  complete: CompleteSessionHandler;
  cancel: CancelSessionHandler;
  skip: SkipSessionHandler;
  reopen: ReopenSessionHandler;
  remove: DeleteSessionHandler;
  restore: RestoreSessionHandler;
  purge: PurgeSessionHandler;
  weekView: SessionsQueryHandler;
  detail: SessionQueryHandler;
  card: NextPracticeQueryHandler;
  published: SessionsInRangeQueryHandler;
  athlete: AthleteProfileQueryHandler;
}

function harness(): Harness {
  const uow = new InMemoryUnitOfWork();
  const sessions = new InMemorySessionRepository(uow);
  const profiles = new InMemoryAthleteProfileRepository(uow);
  const member = new StubMemberContext();
  const cutoffs = new StubCutoff();

  return {
    uow,
    sessions,
    profiles,
    member,
    cutoffs,
    create: new CreateSessionHandler(uow, sessions),
    update: new UpdateSessionHandler(uow, sessions),
    log: new LogSessionHandler(uow, sessions),
    complete: new CompleteSessionHandler(uow, sessions),
    cancel: new CancelSessionHandler(uow, sessions),
    skip: new SkipSessionHandler(uow, sessions),
    reopen: new ReopenSessionHandler(uow, sessions),
    remove: new DeleteSessionHandler(uow, sessions),
    restore: new RestoreSessionHandler(uow, sessions),
    purge: new PurgeSessionHandler(uow, sessions),
    weekView: new SessionsQueryHandler(sessions, member),
    detail: new SessionQueryHandler(sessions, member),
    card: new NextPracticeQueryHandler(sessions, member, cutoffs),
    published: new SessionsInRangeQueryHandler(sessions, member),
    athlete: new AthleteProfileQueryHandler(profiles),
  };
}

/** A gym session at a wall-clock time on one of the member's own days. */
function command(
  overrides: Partial<CreateSessionCommand> = {},
): CreateSessionCommand {
  return {
    id: newId(),
    plannedAt: at(today(), '18:00'),
    durationMin: 60,
    sport: 'gym',
    title: 'Push day',
    ...overrides,
  };
}

/** Three sets with targets and nothing done yet. */
function targets(reps: number, weightKg: number) {
  return [1, 2, 3].map(() => ({
    targetReps: reps,
    targetWeightKg: weightKg,
    targetDurationSec: null,
    targetDistanceM: null,
    actualReps: null,
    actualWeightKg: null,
    actualDurationSec: null,
    actualDistanceM: null,
    done: false,
  }));
}

function squat(reps = 5, weightKg = 100) {
  return {
    id: 'squat',
    name: 'Back squat',
    notes: null,
    mediaRefs: [],
    sets: targets(reps, weightKg),
  };
}

let h: Harness;
beforeEach(() => {
  h = harness();
});

// ------------------------------------------------------------------- create

describe('creating a session by hand', () => {
  it('carries no slotId, which is what keeps the materialiser away from it', async () => {
    /*
     * The rule the create command exists to enforce, asserted on the row rather
     * than on the command's type — because `orphanedPlanned` matches on
     * `slotId !== null`, so a hand-made session with a slot would be removed by
     * the reconcile the next time the member edited their timetable. There is no
     * way for a client to ask for one: the field is absent from the command.
     */
    const created = await h.create.handle(MEMBER, command());

    expect(created.replayed).toBe(false);
    const row = h.sessions.rows.get(created.id);
    expect(row?.slotId).toBeNull();
    expect(row?.programId).toBeNull();
    expect(row?.weekIndex).toBeNull();
    expect(row?.status).toBe('planned');
  });

  it('announces itself exactly once, in the unit of work that saved it', async () => {
    // `SessionScheduled` is what the alert pipeline and the rhythm's draft hang
    // off. The in-memory unit of work refuses events raised outside a
    // transaction, so this also asserts the save is wrapped.
    const created = await h.create.handle(MEMBER, command());

    const names = h.uow.events.map((event) => event.name);
    expect(names).toEqual(['training.SessionScheduled']);
    expect(h.uow.events[0]?.payload).toMatchObject({
      sessionId: created.id,
      title: 'Push day',
      sport: 'gym',
      durationMin: 60,
      status: 'planned',
    });
  });

  it('answers a repeated id as the create that already happened', async () => {
    /*
     * The phone mints the id before the server has heard of the session, so a
     * retry after a dropped connection is indistinguishable from a genuine
     * second create unless the id decides it. The second call must write nothing
     * and — this is the half that matters — raise nothing, or the alert saga
     * plans a duplicate reminder.
     */
    const first = await h.create.handle(MEMBER, command({ id: newId() }));
    h.uow.reset();

    const replay = await h.create.handle(
      MEMBER,
      command({ id: first.id, title: 'A different title' }),
    );

    expect(replay).toEqual({
      id: first.id,
      updatedAt: first.updatedAt,
      replayed: true,
    });
    expect(h.uow.events).toHaveLength(0);
    expect(h.sessions.rows.get(first.id)?.title).toBe('Push day');
  });

  it('refuses an id that is not a UUID', async () => {
    await expect(
      h.create.handle(MEMBER, command({ id: 'session-1' })),
    ).rejects.toThrow(InvalidSessionId);
    expect(h.sessions.rows.size).toBe(0);
  });

  it('refuses a session with no title and writes nothing', async () => {
    await expect(
      h.create.handle(MEMBER, command({ title: '   ' })),
    ).rejects.toThrow(SessionRuleError);
    expect(h.sessions.rows.size).toBe(0);
    expect(h.uow.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- logging

describe('logging a session (FR-004, story 3 scenario 1)', () => {
  it('stores what was done beside what was planned', async () => {
    const created = await h.create.handle(
      MEMBER,
      command({ exercises: [squat(5, 100)] }),
    );

    await h.log.handle(MEMBER, created.id, {
      exercises: [
        {
          id: 'squat',
          sets: [
            { targetReps: 5, targetWeightKg: 100, actualReps: 5, actualWeightKg: 100, done: true },
            { targetReps: 5, targetWeightKg: 100, actualReps: 4, actualWeightKg: 100, done: true },
          ],
        },
      ],
      notes: 'felt heavy',
    });

    const view = await h.detail.byId(MEMBER, created.id);
    const sets = view?.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(2);
    // Both halves present on the same set: the target is not overwritten by the
    // actual, which is the whole point of keeping both.
    expect(sets[0]).toMatchObject({ targetReps: 5, actualReps: 5 });
    expect(sets[1]).toMatchObject({ targetReps: 5, actualReps: 4 });
    expect(view?.notes).toBe('felt heavy');
  });

  it('does not complete the session', async () => {
    /*
     * A member part way through has logged sets and a `planned` status, which is
     * the state the session screen renders. Inferring completion from "all the
     * sets are ticked" would complete the session before they had written the
     * note — and would then clear the reminder for a session still under way.
     */
    const created = await h.create.handle(
      MEMBER,
      command({ exercises: [squat()] }),
    );

    await h.log.handle(MEMBER, created.id, {
      exercises: [{ id: 'squat', sets: [{ actualReps: 5, done: true }] }],
    });

    const view = await h.detail.byId(MEMBER, created.id);
    expect(view?.status).toBe('planned');
    expect(view?.completedAt).toBeNull();
    expect(h.uow.events.map((event) => event.name)).toContain(
      'training.SessionLogged',
    );
    expect(h.uow.events.map((event) => event.name)).not.toContain(
      'training.SessionCompleted',
    );
  });

  it('writes nothing at all when one exercise in the batch is unknown', async () => {
    /*
     * The endpoint logs every exercise in one request (SC-003: six exercises in
     * under ninety seconds cannot afford six round trips), so the whole batch is
     * one transaction. A partially applied log would leave the member's screen
     * and the server disagreeing with no way to tell which half arrived.
     */
    const created = await h.create.handle(
      MEMBER,
      command({ exercises: [squat()] }),
    );
    h.uow.reset();

    await expect(
      h.log.handle(MEMBER, created.id, {
        exercises: [
          { id: 'squat', sets: [{ actualReps: 5, done: true }] },
          { id: 'bench', sets: [{ actualReps: 8, done: true }] },
        ],
      }),
    ).rejects.toThrow(SessionRuleError);

    const view = await h.detail.byId(MEMBER, created.id);
    expect(view?.exercises[0]?.sets.every((set) => !set.done)).toBe(true);
    expect(h.uow.rolledBack).toBe(true);
  });

  it('can be logged long after the session ended, with no status to correct first', async () => {
    // FR-018. Nothing stored "missed", so a late log is an ordinary log.
    const date = addDays(today(), -3);
    const created = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '18:00'), exercises: [squat()] }),
    );

    const before = await h.detail.byId(MEMBER, created.id);
    expect(before?.isMissed).toBe(true);

    await h.log.handle(MEMBER, created.id, {
      exercises: [{ id: 'squat', sets: [{ actualReps: 5, done: true }] }],
    });
    await h.complete.handle(MEMBER, created.id);

    const after = await h.detail.byId(MEMBER, created.id);
    expect(after?.status).toBe('completed');
    expect(after?.isMissed).toBe(false);
  });
});

// ------------------------------------------------------- status and deletion

describe('the four statuses and the tombstone', () => {
  it('keeps a skipped session in the week and marks it (FR-005, story 3 scenario 3)', async () => {
    /*
     * Both halves asserted, because the tempting implementation of "skip" is a
     * delete and it would be wrong: deleting the row would make a skipped week
     * and a quiet week look identical.
     */
    const date = today();
    const created = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '18:00') }),
    );

    await h.skip.handle(MEMBER, created.id);

    const week = await h.weekView.between(
      MEMBER,
      at(date, '00:00'),
      at(date, '23:59'),
    );
    expect(week.map((row) => row.id)).toEqual([created.id]);
    expect(week[0]?.status).toBe('skipped');
    // And not missed: the member has dealt with it, so the clock has nothing
    // left to say about it.
    expect(week[0]?.isMissed).toBe(false);
  });

  it('leaves the status untouched when the session is deleted', async () => {
    /*
     * The rule this project has broken twice. The status is the only record of
     * whether the session was completed, cancelled, skipped or never dealt with,
     * and the Deleted view exists to show exactly that — a delete that "tidied"
     * it would destroy the only copy of the fact.
     */
    const created = await h.create.handle(MEMBER, command());
    await h.skip.handle(MEMBER, created.id);

    await h.remove.handle(MEMBER, created.id);

    const row = h.sessions.rows.get(created.id);
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.status).toBe('skipped');
  });

  it('restores a session with the status it had, not as planned', async () => {
    // A restore that reopened everything would make the Deleted view a trap:
    // recovering a session you had cancelled would put it back in your week.
    const created = await h.create.handle(MEMBER, command());
    await h.cancel.handle(MEMBER, created.id);
    await h.remove.handle(MEMBER, created.id);

    await h.restore.handle(MEMBER, created.id);

    const row = h.sessions.rows.get(created.id);
    expect(row?.deletedAt).toBeNull();
    expect(row?.status).toBe('cancelled');
  });

  it('reopens a session the member ticked by mistake, and only once', async () => {
    const created = await h.create.handle(MEMBER, command());
    await h.complete.handle(MEMBER, created.id);
    h.uow.reset();

    await h.reopen.handle(MEMBER, created.id);
    expect(h.sessions.rows.get(created.id)?.status).toBe('planned');
    expect(h.uow.events.map((event) => event.name)).toEqual([
      'training.SessionScheduled',
    ]);

    // A retrying client must not raise a second one for the saga to reconcile.
    h.uow.reset();
    await h.reopen.handle(MEMBER, created.id);
    expect(h.uow.events).toHaveLength(0);
  });

  it('refuses to purge a live session', async () => {
    // Erasing a row that is not a tombstone is data loss dressed as
    // housekeeping. The refusal is `not_deleted`, which the controller turns
    // into a 409 and the sync facade into a `not_deleted` rejection — never
    // `stale`, which would make the phone retry for ever.
    const created = await h.create.handle(MEMBER, command());

    await expect(h.purge.handle(MEMBER, created.id)).rejects.toMatchObject({
      code: 'not_deleted',
    });
    expect(h.sessions.rows.has(created.id)).toBe(true);

    await h.remove.handle(MEMBER, created.id);
    await h.purge.handle(MEMBER, created.id);
    expect(h.sessions.rows.has(created.id)).toBe(false);
  });

  it('does not let one member touch another member’s session', async () => {
    const created = await h.create.handle(MEMBER, command());

    await expect(h.skip.handle(OTHER, created.id)).rejects.toThrow();
    await expect(h.detail.byId(OTHER, created.id)).resolves.toBeNull();
    expect(h.sessions.rows.get(created.id)?.status).toBe('planned');
  });
});

// ------------------------------------------------------------- the read model

describe('the read model', () => {
  it('carries isMissed for every row in the week (FR-018)', async () => {
    /*
     * The card, the week view and Today all ask the session the same question,
     * which is only true if the field is on the view rather than computed by
     * each client. A past unlogged session reads as missed; a future one does
     * not.
     */
    const date = today();
    const past = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '06:00'), title: 'Morning swim' }),
    );
    const future = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '23:30'), title: 'Late gym' }),
    );

    const week = await h.weekView.between(
      MEMBER,
      at(date, '00:00'),
      at(date, '23:59'),
      at(date, '12:00'),
    );

    const byId = new Map(week.map((row) => [row.id, row]));
    expect(byId.get(past.id)?.isMissed).toBe(true);
    expect(byId.get(future.id)?.isMissed).toBe(false);
  });

  it('hides a deleted session from both reads', async () => {
    const date = today();
    const created = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '18:00') }),
    );
    await h.remove.handle(MEMBER, created.id);

    await expect(h.detail.byId(MEMBER, created.id)).resolves.toBeNull();
    await expect(
      h.weekView.between(MEMBER, at(date, '00:00'), at(date, '23:59')),
    ).resolves.toEqual([]);
  });

  it('answers a document for a member with no athlete profile at all', async () => {
    /*
     * The profile is written from `identity.UserRegistered` and the relay is
     * eventual, so there is a window in which the row does not exist. A nullable
     * read would put the same "have they set this up yet" branch into four
     * callers; an empty profile is a thing every one of them can already render.
     * And nothing is written by the read.
     */
    await expect(h.athlete.handle(MEMBER)).resolves.toEqual({
      sports: [],
      slots: [],
    });
    expect(h.profiles.rows.size).toBe(0);
  });
});

// ---------------------------------------------------------- the next practice

describe('nextPractice (FR-006, FR-007)', () => {
  /**
   * Two sessions: one earlier today, already completed, and one tomorrow. The
   * shape story 2 scenario 1 and the cut-off both turn on.
   */
  async function morningDoneAndTomorrow(): Promise<{
    morning: string;
    tomorrow: string;
  }> {
    const date = today();
    const morning = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '06:00'), title: 'Morning swim' }),
    );
    // Completed *now* rather than at 07:00 this morning. `complete` moves
    // `updatedAt`, and the optimistic filter refuses a save whose `updatedAt`
    // is behind the stored row — so a fixture that back-dates the completion of
    // a session it created a moment ago is refused by the store, correctly.
    await h.complete.handle(MEMBER, morning.id);
    const tomorrow = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(addDays(date, 1), '18:00'), title: 'Push day' }),
    );
    return { morning: morning.id, tomorrow: tomorrow.id };
  }

  it("passes the member's own cut-off through, so a changed one changes the answer", async () => {
    /*
     * The assertion that separates a port from the settings registry. At 19:30
     * a member on the registry's 21:00 is still looking at today; the same
     * member on their own 18:00 is looking ahead. A handler reading
     * `SettingsService` would give the first answer to both, and the two agree
     * for everybody who has never changed the preference — which is what makes
     * the bug invisible.
     */
    const { morning, tomorrow } = await morningDoneAndTomorrow();
    const evening = at(today(), '19:30');

    h.cutoffs.cutoff = REGISTRY_CUTOFF;
    const beforeCutoff = await h.card.handle(MEMBER, evening);
    expect(beforeCutoff.reason).toBe('today');
    expect(beforeCutoff.isToday).toBe(true);
    expect(beforeCutoff.session?.id).toBe(morning);

    h.cutoffs.cutoff = '18:00';
    const afterCutoff = await h.card.handle(MEMBER, evening);
    expect(afterCutoff.reason).toBe('after-cutoff');
    expect(afterCutoff.isToday).toBe(false);
    expect(afterCutoff.session?.id).toBe(tomorrow);
  });

  it("resolves the day in the member's zone and not the server's", async () => {
    /*
     * One session, one instant, two zones — and a different answer, because the
     * pair straddles midnight in one of them and not in the other.
     *
     * The session is at 02:00 tomorrow on the Cairo clock and the card is opened
     * at 20:00 tonight. For a member in Cairo that session is *tomorrow's*, so
     * the reason is `after-cutoff`. New York is six or seven hours behind, so
     * the same two instants read there as 13:00 and 19:00 **on one day** — the
     * session is today's, and the reason says so.
     *
     * Shifting both instants by the same offset is precisely why this is the
     * shape the test has to take: any pair that does not cross a midnight reads
     * identically in every zone, which is how a handler reading the server's own
     * `TZ` passes a naive fixture. The zone from `MemberContextPort` is the only
     * thing that changes between the two calls.
     */
    const date = today(CAIRO);
    const created = await h.create.handle(
      MEMBER,
      command({
        plannedAt: at(addDays(date, 1), '02:00', CAIRO),
        title: 'Small hours gym',
      }),
    );
    const tonight = at(date, '20:00', CAIRO);
    h.cutoffs.cutoff = REGISTRY_CUTOFF;

    h.member.timezone = CAIRO;
    const asCairo = await h.card.handle(MEMBER, tonight);
    expect(asCairo.reason).toBe('after-cutoff');
    expect(asCairo.isToday).toBe(false);
    expect(asCairo.session?.id).toBe(created.id);

    h.member.timezone = NEW_YORK;
    const asNewYork = await h.card.handle(MEMBER, tonight);
    expect(asNewYork.reason).toBe('today');
    expect(asNewYork.isToday).toBe(true);
    expect(asNewYork.session?.id).toBe(created.id);
  });

  it('says so plainly when the member has nothing scheduled', async () => {
    const answer = await h.card.handle(MEMBER);
    expect(answer.session).toBeNull();
    expect(answer.reason).toBe('none-scheduled');
    expect(answer.isToday).toBe(false);
  });

  it('carries the derived isMissed onto the card', async () => {
    // Story 2 scenario 1: before the cut-off, today's session is shown "marked
    // as done or missed". The card reads it from the same place the week does.
    const date = today();
    const created = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '06:00') }),
    );

    h.cutoffs.cutoff = REGISTRY_CUTOFF;
    const answer = await h.card.handle(MEMBER, at(date, '12:00'));
    expect(answer.session?.id).toBe(created.id);
    expect(answer.session?.isMissed).toBe(true);
  });
});

// ------------------------------------------------------- the published surface

describe('SessionsInRangeQuery (P5’s agenda, P3’s rhythm)', () => {
  it('answers the agenda shape, every status, soonest first', async () => {
    /*
     * The field names are Meetings' `AgendaSession` — the port another context
     * binds to this handler — so getting them right is half of that contract.
     * Every status, because a skipped session is a fact about a day the member
     * may well be looking for; the calendar keeps a cancelled meeting for the
     * same reason.
     */
    const date = today();
    const evening = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(date, '18:00'), title: 'Push day' }),
    );
    const morning = await h.create.handle(
      MEMBER,
      command({
        plannedAt: at(date, '07:00'),
        title: 'Swim',
        sport: 'swimming',
        durationMin: 45,
      }),
    );
    await h.skip.handle(MEMBER, morning.id);

    const rows = await h.published.between(
      MEMBER,
      at(date, '00:00'),
      at(date, '23:59'),
    );

    expect(rows).toEqual([
      {
        id: morning.id,
        title: 'Swim',
        sport: 'swimming',
        startAt: at(date, '07:00'),
        durationMin: 45,
      },
      {
        id: evening.id,
        title: 'Push day',
        sport: 'gym',
        startAt: at(date, '18:00'),
        durationMin: 60,
      },
    ]);
  });

  it("takes the rhythm's local date and offers only planned sessions", async () => {
    /*
     * The rhythm's sentence is a *proposal* — "tomorrow you have gym at six" —
     * so proposing a session the member has already cancelled is worse than
     * saying nothing. And the date is a string because a pair of instants would
     * make the caller decide whose midnight it meant, which is the decision this
     * method exists to take away from it.
     */
    const tomorrow = addDays(today(), 1);
    const going = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(tomorrow, '18:00'), title: 'Push day' }),
    );
    const notGoing = await h.create.handle(
      MEMBER,
      command({ plannedAt: at(tomorrow, '20:00'), title: 'Five-a-side' }),
    );
    await h.cancel.handle(MEMBER, notGoing.id);

    const rows = await h.published.onDate(MEMBER, tomorrow);
    expect(rows.map((row) => row.id)).toEqual([going.id]);

    // And nothing from the day before or the day after leaks in.
    await expect(h.published.onDate(MEMBER, today())).resolves.toEqual([]);
  });
});

// -------------------------------------------------------------------- editing

describe('editing a session', () => {
  it('announces a reschedule when the moment moves and stays quiet otherwise', async () => {
    /*
     * `SessionRescheduled` is what re-plans the reminder, so it has to fire for
     * a moved session and must not fire for an edited note — the saga would
     * rebuild the same alerts, and a client re-sending the editor on every
     * keystroke would do it per keystroke.
     */
    const created = await h.create.handle(MEMBER, command());
    h.uow.reset();

    const moved = await h.update.handle(MEMBER, created.id, {
      plannedAt: at(addDays(today(), 1), '19:00'),
    });
    expect(moved.changed).toEqual(['plannedAt']);
    expect(h.uow.events.map((event) => event.name)).toEqual([
      'training.SessionRescheduled',
    ]);

    h.uow.reset();
    const noted = await h.update.handle(MEMBER, created.id, {
      notes: 'bring the belt',
    });
    expect(noted.changed).toEqual(['notes']);
    expect(h.uow.events).toHaveLength(0);
  });

  it('costs nothing when the form comes back unchanged', async () => {
    const created = await h.create.handle(MEMBER, command());
    h.uow.reset();

    const answer = await h.update.handle(MEMBER, created.id, {
      title: 'Push day',
      sport: 'gym',
    });
    expect(answer.changed).toEqual([]);
    expect(h.uow.events).toHaveLength(0);
  });
});
