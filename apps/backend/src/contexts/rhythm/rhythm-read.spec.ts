import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate } from '../../shared/time/time.js';
import {
  bestStreak,
  currentStreak,
  nextDate,
  previousDate,
  type CheckinRecord,
} from './domain/adherence.js';
import { Checkin } from './domain/checkin.aggregate.js';
import { DailyPlan, type PlanTask } from './domain/daily-plan.aggregate.js';
import { RhythmState } from './domain/rhythm-state.aggregate.js';
import {
  MemberSchedulePort,
  type MemberSchedule,
} from './domain/rhythm.ports.js';
import { CheckinsQueryHandler } from './features/checkins/checkins.query.js';
import { PlansQueryHandler } from './features/plans/plans.query.js';
import { StreakQueryHandler } from './features/streak/streak.query.js';
import { TodayPlanQueryHandler } from './features/today-plan/today-plan.query.js';
import { TomorrowDraftQueryHandler } from './features/tomorrow-draft/tomorrow-draft.query.js';
import {
  InMemoryCheckinRepository,
  InMemoryDailyPlanRepository,
  InMemoryRhythmStateRepository,
} from './infrastructure/in-memory-rhythm.repositories.js';

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';

/**
 * Profile's answer, stubbed.
 *
 * `forUsers` and not `forUser`, because that is the port's shape — the tick
 * asks for a page of members at once. A stub that answered a single id would
 * hide the thing the read side has to get right: an unknown member comes back
 * as an *empty array*, not as a row with a null zone, and every handler that
 * resolves a local date has to survive that. `unknown()` below is that case.
 */
class StubSchedule extends MemberSchedulePort {
  constructor(private readonly timezone: string | null = CAIRO) {
    super();
  }

  static unknown(): StubSchedule {
    return new StubSchedule(null);
  }

  async forUsers(userIds: string[]): Promise<MemberSchedule[]> {
    if (this.timezone === null) return [];
    return userIds.map((userId) => ({
      userId,
      timezone: this.timezone as string,
      planTomorrowTime: '21:00',
      endOfDayTime: '22:00',
      morningBriefingTime: '07:00',
      checkinEnabled: true,
    }));
  }
}

interface Bench {
  uow: InMemoryUnitOfWork;
  plans: InMemoryDailyPlanRepository;
  checkins: InMemoryCheckinRepository;
  states: InMemoryRhythmStateRepository;
  today: TodayPlanQueryHandler;
  tomorrow: TomorrowDraftQueryHandler;
  planRange: PlansQueryHandler;
  checkinRange: CheckinsQueryHandler;
  streak: StreakQueryHandler;
}

function bench(schedules: MemberSchedulePort = new StubSchedule()): Bench {
  const uow = new InMemoryUnitOfWork();
  const plans = new InMemoryDailyPlanRepository(uow);
  const checkins = new InMemoryCheckinRepository(uow);
  const states = new InMemoryRhythmStateRepository(uow);

  return {
    uow,
    plans,
    checkins,
    states,
    today: new TodayPlanQueryHandler(plans, schedules),
    tomorrow: new TomorrowDraftQueryHandler(plans, schedules),
    planRange: new PlansQueryHandler(plans),
    checkinRange: new CheckinsQueryHandler(checkins),
    streak: new StreakQueryHandler(states, checkins, schedules),
  };
}

/**
 * Every date in this file is derived from `Date.now()` and the member's zone,
 * never written down.
 *
 * A fixture pinned to a real date is a time bomb: it passes until the clock
 * reaches it. It is also the only correct way to test this particular read
 * side, because "today" is the answer under test — hard-coding it would mean
 * asserting the handler agrees with a constant rather than with the member's
 * calendar.
 */
const NOW = new Date();
const TODAY = localDate(NOW, CAIRO);
const daysBack = (n: number) => {
  let date = TODAY;
  for (let index = 0; index < n; index += 1) date = previousDate(date);
  return date;
};

/**
 * One day's answer as a history is seeded from it: the local date, and the
 * verdict — `null` for a member who sent a mood and no verdict.
 *
 * Declared up here rather than beside the test that uses it because `it.each`
 * evaluates its table while the module is still being read, so a `const`
 * below the `describe` would be in its temporal dead zone.
 */
type Answer = [date: string, adhered: boolean | null];

const asAdhered =
  (adhered: boolean) =>
  (back: number): Answer => [daysBack(back), adhered];

const task = (id: string, priority = 1, deferCount = 0): PlanTask => ({
  id,
  title: `Task ${id}`,
  priority,
  dueAt: null,
  deferCount,
});

async function seedPlan(
  b: Bench,
  date: string,
  userId = MEMBER,
  tasks: PlanTask[] = [task('t1')],
): Promise<DailyPlan> {
  const plan = DailyPlan.propose({ userId, date, tasks, at: NOW });
  // Through the unit of work, as production does. The in-memory adapter
  // refuses a save that raises an event outside one — deliberately, because a
  // domain event published after the commit rather than inside it is an event
  // lost on a crash, and a spec that seeded around the rule would be a spec
  // that could not tell the difference.
  await b.uow.run(() => b.plans.save(plan));
  return plan;
}

async function seedCheckin(
  b: Bench,
  date: string,
  answer: { adhered?: boolean | null; mood?: number | null; note?: string },
): Promise<void> {
  const checkin = Checkin.create({
    userId: MEMBER,
    date,
    source: 'app',
    at: NOW,
  });
  checkin.record({ ...answer, at: NOW });
  await b.uow.run(() => b.checkins.save(checkin));
}

describe('todayPlan', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  /**
   * The case the non-null contract exists for, and the common one: a plan is
   * written by the evening touch, so every member has no row for today until
   * their first evening happens.
   */
  it('answers a member with no plan with an empty plan for their own today', async () => {
    const view = await b.today.handle(MEMBER, undefined, NOW);

    expect(view.date).toBe(TODAY);
    expect(view.status).toBe('draft');
    expect(view.tasks).toEqual([]);
    expect(view.training).toBeNull();
    expect(view.autoConfirmed).toBe(false);
    // The four claims are what distinguish "nothing happened" from a real
    // draft: a proposed plan always carries `promptedAt`.
    expect(view.promptedAt).toBeNull();
    expect(view.summarisedAt).toBeNull();
    expect(view.briefedAt).toBeNull();
  });

  /** And it writes nothing — a read that persisted a draft would give the
   * tick an unanswered proposal to auto-confirm that nobody was ever shown. */
  it('does not persist the empty plan it invented', async () => {
    await b.today.handle(MEMBER, undefined, NOW);
    expect(b.plans.rows.size).toBe(0);
  });

  it('returns the stored plan when there is one', async () => {
    await seedPlan(b, TODAY, MEMBER, [task('a', 1, 3)]);

    const view = await b.today.handle(MEMBER, undefined, NOW);

    expect(view.promptedAt).toEqual(NOW);
    expect(view.tasks).toEqual([
      { id: 'a', title: 'Task a', priority: 1, dueAt: null, deferCount: 3 },
    ]);
  });

  it('honours an explicit date, for the plans screen', async () => {
    await seedPlan(b, daysBack(3));

    const view = await b.today.handle(MEMBER, daysBack(3), NOW);

    expect(view.date).toBe(daysBack(3));
    expect(view.tasks).toHaveLength(1);
  });

  /**
   * Not a hypothetical: `forUsers` returns rows only for members Profile
   * knows, so a member deleted between the token being issued and the query
   * arriving comes back empty. A throw here would be a 500 on the Home screen.
   */
  it('still answers a member Profile has no row for', async () => {
    const orphan = bench(StubSchedule.unknown());

    const view = await orphan.today.handle(MEMBER, undefined, NOW);

    expect(view.date).toBe(localDate(NOW, 'UTC'));
    expect(view.status).toBe('draft');
  });

  it('never reads another member’s plan', async () => {
    await seedPlan(b, TODAY, OTHER);

    const view = await b.today.handle(MEMBER, undefined, NOW);

    expect(view.tasks).toEqual([]);
  });
});

describe('tomorrowDraft', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('reads the day after the member’s today', async () => {
    await seedPlan(b, nextDate(TODAY), MEMBER, [task('x')]);

    const view = await b.tomorrow.handle(MEMBER, NOW);

    expect(view.date).toBe(nextDate(TODAY));
    expect(view.tasks).toHaveLength(1);
  });

  /** Before the evening prompt fires there is no document for tomorrow at
   * all, which is most of every day — so this is the ordinary answer. */
  it('answers an empty plan before anything has been proposed', async () => {
    const view = await b.tomorrow.handle(MEMBER, NOW);

    expect(view.date).toBe(nextDate(TODAY));
    expect(view.promptedAt).toBeNull();
  });

  /**
   * "Draft" is the name, not a filter. Filtering to `draft` would make a
   * confirmed plan indistinguishable from no plan, so the card would offer to
   * plan a day the member had already settled.
   */
  it('returns a confirmed plan for tomorrow rather than hiding it', async () => {
    const plan = await seedPlan(b, nextDate(TODAY));
    plan.confirm({ tasks: plan.tasks, at: NOW });
    await b.uow.run(() => b.plans.save(plan));

    const view = await b.tomorrow.handle(MEMBER, NOW);

    expect(view.status).toBe('confirmed');
  });
});

describe('plans over a range', () => {
  let b: Bench;
  beforeEach(async () => {
    b = bench();
    for (const back of [3, 2, 1, 0]) await seedPlan(b, daysBack(back));
  });

  it('is inclusive at both ends', async () => {
    const views = await b.planRange.handle(MEMBER, daysBack(2), daysBack(1));

    expect(views.map((view) => view.date)).toEqual([
      daysBack(2),
      daysBack(1),
    ]);
  });

  it('returns a single day when both ends are the same date', async () => {
    const views = await b.planRange.handle(MEMBER, daysBack(2), daysBack(2));

    expect(views.map((view) => view.date)).toEqual([daysBack(2)]);
  });

  /** Sparse, not padded: the difference between "no evening happened" and
   * "an empty evening happened" is the whole content of a history screen. */
  it('omits days with no plan rather than inventing them', async () => {
    const views = await b.planRange.handle(MEMBER, daysBack(10), TODAY);

    expect(views).toHaveLength(4);
  });
});

describe('checkins over a range', () => {
  let b: Bench;
  beforeEach(async () => {
    b = bench();
    for (const back of [3, 2, 1]) {
      await seedCheckin(b, daysBack(back), { adhered: true, mood: 60 });
    }
  });

  it('is inclusive at both ends', async () => {
    const views = await b.checkinRange.handle(MEMBER, daysBack(3), daysBack(1));

    expect(views.map((view) => view.date)).toEqual([
      daysBack(3),
      daysBack(2),
      daysBack(1),
    ]);
  });

  /**
   * Nought is a member having a terrible day; null is a member who did not
   * say. A `mood || undefined` between the store and the chart is a bug, and
   * this is the assertion that catches it.
   */
  it('keeps a mood of zero distinct from an unanswered mood', async () => {
    await seedCheckin(b, daysBack(5), { mood: 0, adhered: true });
    await seedCheckin(b, daysBack(4), { adhered: true });

    const views = await b.checkinRange.handle(MEMBER, daysBack(5), daysBack(4));

    expect(views[0]?.mood).toBe(0);
    expect(views[1]?.mood).toBeNull();
  });
});

describe('streak', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  /** The card draws something for a member whose bootstrap row is still in
   * the outbox, rather than crashing on a null. */
  it('answers zero and seven nulls for a member with no state row', async () => {
    const view = await b.streak.handle(MEMBER, NOW);

    expect(view).toEqual({
      current: 0,
      best: 0,
      lastAdheredDate: null,
      weekAdherence: [null, null, null, null, null, null, null],
    });
  });

  /**
   * The three states, in seven fixed slots, oldest first.
   *
   * An unanswered day is `null` and must never be coerced to `false`:
   * rendering silence as a miss tells a member they broke a streak they did
   * not break. The mood-only day at T-2 is the subtle half of the same rule —
   * the member answered, but not the half the dots draw.
   */
  it('carries three states per day, with an unanswered day as null', async () => {
    await seedCheckin(b, daysBack(6), { adhered: true });
    await seedCheckin(b, daysBack(5), { adhered: false });
    await seedCheckin(b, daysBack(3), { adhered: true });
    await seedCheckin(b, daysBack(2), { mood: 40 });

    const view = await b.streak.handle(MEMBER, NOW);

    expect(view.weekAdherence).toEqual([
      true,
      false,
      null,
      true,
      null,
      null,
      null,
    ]);
    expect(view.weekAdherence).toHaveLength(7);
    // Spelled out because `toEqual` would pass on `undefined` too, and an
    // `undefined` item serialises to null over GraphQL while behaving
    // differently everywhere else.
    expect(view.weekAdherence[2]).toBeNull();
    expect(view.weekAdherence[4]).toBeNull();
  });

  it('does not let today’s silence zero a live streak', async () => {
    await seedHistory(b, [4, 3, 2, 1].map(asAdhered(true)));

    const view = await b.streak.handle(MEMBER, NOW);

    expect(view.current).toBe(4);
    expect(view.lastAdheredDate).toBe(daysBack(1));
    expect(view.weekAdherence[6]).toBeNull();
  });

  /**
   * The point of having both paths.
   *
   * `RhythmState.streak` is folded day by day by the write side; `currentStreak`
   * walks the check-in rows. They are two routes to one number the member is
   * watching, and a stored counter that has drifted from the rows it was folded
   * from is invisible without an assertion like this one. If this test ever
   * fails, the fold and the walk have diverged — do not "fix" it by reading the
   * derived value in the query, because `best` cannot be derived once rows age
   * out.
   */
  it.each([
    ['an unbroken run ending yesterday', [4, 3, 2, 1].map(asAdhered(true))],
    [
      'a run broken in the middle',
      [
        [daysBack(4), true],
        [daysBack(3), false],
        [daysBack(2), true],
        [daysBack(1), true],
      ] as Answer[],
    ],
    [
      'a miss on the most recent answered day',
      [
        [daysBack(3), true],
        [daysBack(2), true],
        [daysBack(1), false],
      ] as Answer[],
    ],
    [
      'a mood-only day in the middle, which says nothing about the streak',
      [
        [daysBack(3), true],
        [daysBack(2), null],
        [daysBack(1), true],
      ] as Answer[],
    ],
  ])('stored and derived streaks agree over %s', async (_name, history) => {
    await seedHistory(b, history);

    const view = await b.streak.handle(MEMBER, NOW);
    const records: CheckinRecord[] = history.map(([date, adhered]) => ({
      date,
      adhered,
    }));

    expect(view.current).toBe(currentStreak(records, TODAY));
    expect(view.best).toBe(bestStreak(records));
  });
});

/**
 * Seed the rows *and* the folded state from one history, in date order.
 *
 * Both halves from the same input, because that is what makes the agreement
 * assertion mean anything: a helper that stored a streak independently of the
 * rows would be asserting that two constants match.
 */
async function seedHistory(b: Bench, history: Answer[]): Promise<void> {
  const state = RhythmState.create({ userId: MEMBER, at: NOW });

  const sorted = [...history].sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0));
  for (const [date, adhered] of sorted) {
    await seedCheckin(b, date, { adhered });
  }

  // Derived from the rows, exactly as `record-checkin` does it — the fold this
  // used to call was replaced because it could not survive a member correcting
  // a "no" into a "yes" on the same day.
  const today = sorted.at(-1)?.[0];
  if (today) {
    state.recomputeStreak(
      sorted.map(([date, adhered]) => ({ date, adhered })),
      today,
      NOW,
    );
  }

  await b.uow.run(() => b.states.save(state));
}
