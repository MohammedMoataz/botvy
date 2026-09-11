import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, localHhMm, wallClockToUtc } from '../../shared/time/time.js';
import { nextDate } from './domain/adherence.js';
import type {
  PlanMeeting,
  PlanTask,
  PlanTraining,
} from './domain/daily-plan.aggregate.js';
import { RhythmState } from './domain/rhythm-state.aggregate.js';
import {
  CoachTranscriptPort,
  MeetingsOnPort,
  MemberSchedulePort,
  NextSessionPort,
  PlannedTasksPort,
  TodayMealsPort,
  type MemberSchedule,
  type TouchMessageKind,
} from './domain/rhythm.ports.js';
import { DraftBuilder } from './features/tick/draft.builder.js';
import { PAGE_SIZE, TickHandler } from './features/tick/tick.handler.js';
import {
  InMemoryCheckinRepository,
  InMemoryDailyPlanRepository,
  InMemoryRhythmStateRepository,
} from './infrastructure/in-memory-rhythm.repositories.js';

/**
 * The per-member clock, which is the whole of user story 3 and the part of this
 * feature that cannot be checked by looking at it.
 *
 * Six rules, each with a scenario in `spec.md`, and every one of them is a rule
 * about *when nothing happens*: the touch that must not fire twice, the day
 * that must not be sent late, the preference change that must not re-open an
 * evening. Those are the assertions a manual run cannot make — you can watch a
 * notification arrive, but you cannot watch one correctly not arrive.
 *
 * ## Every instant is derived from `Date.now()`
 *
 * Never a literal. This feature compares a member's wall clock against their
 * preferences, so a fixture pinned to a real date starts failing the day the
 * clock reaches it — and a fixture pinned to a *past* date starts failing when
 * a government changes that year's daylight-saving rule underneath it, which
 * has happened to this codebase's zones inside the last decade.
 *
 * The daylight-saving case is the interesting one: it needs a real transition,
 * and it finds the *next* one by asking the zone rather than by naming a
 * Sunday in March. See `nextSpringForward`.
 */

const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';

/**
 * This wall clock, in this zone, on **a named calendar day**.
 *
 * The sibling of `at` for the one case that must not take each zone's own
 * "today": two zones compared against each other. The two-zone test says what
 * went wrong without it.
 */
function onDay(date: string, hhmm: string, zone: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

/** "This wall clock, on that member's own calendar day." */
function at(hhmm: string, zone: string, dayOffset = 0): Date {
  let date = localDate(new Date(), zone);
  for (let index = 0; index < Math.abs(dayOffset); index += 1) {
    date = dayOffset > 0 ? nextDate(date) : previousLocalDate(date);
  }
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

function previousLocalDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

/**
 * The next calendar date in `zone` on which 02:30 does not exist.
 *
 * Found by asking `shared/time` rather than by hard-coding a Sunday: it
 * resolves a wall clock inside a spring-forward gap to the first valid instant
 * after it, so a date where 02:30 reads back as something other than 02:30 is
 * a date with a missing hour. Scanning forward from today keeps the fixture
 * relative to now and correct for ever, including after a rule change.
 *
 * Returns null when the zone has no transition in the next fourteen months, so
 * a zone that abolishes daylight saving skips the test instead of failing it.
 */
function nextSpringForward(zone: string): string | null {
  let date = localDate(new Date(), zone);
  for (let index = 0; index < 430; index += 1) {
    const resolved = wallClockToUtc(`${date}T02:30`, zone);
    if (resolved && localHhMm(resolved, zone) !== '02:30') return date;
    date = nextDate(date);
  }
  return null;
}

// --------------------------------------------------------------- the stubs

/** Per-member schedules, because two members in two zones is the point. */
class Schedules extends MemberSchedulePort {
  readonly rows = new Map<string, MemberSchedule>();

  set(
    userId: string,
    zone: string,
    overrides: Partial<Omit<MemberSchedule, 'userId' | 'timezone'>> = {},
  ): void {
    this.rows.set(userId, {
      userId,
      timezone: zone,
      planTomorrowTime: '21:00',
      endOfDayTime: '22:00',
      morningBriefingTime: '08:00',
      checkinEnabled: true,
      ...overrides,
    });
  }

  async forUsers(userIds: string[]): Promise<MemberSchedule[]> {
    return userIds
      .map((userId) => this.rows.get(userId))
      .filter((row): row is MemberSchedule => row !== undefined);
  }
}

class NoTasks extends PlannedTasksPort {
  async dueOn(): Promise<PlanTask[]> {
    return [];
  }
  async openBefore(): Promise<PlanTask[]> {
    return [];
  }
}

/** No meetings, which is every scenario in this file. See `rhythm-meetings.spec.ts`. */
class NoMeetings extends MeetingsOnPort {
  async onDate(): Promise<PlanMeeting[]> {
    return [];
  }
}

class NoSessions extends NextSessionPort {
  async forDate(): Promise<PlanTraining | null> {
    return null;
  }
}

class NoMeals extends TodayMealsPort {
  async lineFor(): Promise<string | null> {
    return null;
  }
}

class Transcript extends CoachTranscriptPort {
  readonly appended: Array<{ userId: string; touch?: TouchMessageKind }> = [];

  async append(input: {
    userId: string;
    kind: 'coach' | 'planner';
    content: string;
    touch?: TouchMessageKind;
    at: Date;
  }): Promise<{ seq: number } | null> {
    this.appended.push({ userId: input.userId, touch: input.touch });
    return { seq: this.appended.length };
  }
}

interface Bench {
  uow: InMemoryUnitOfWork;
  states: InMemoryRhythmStateRepository;
  plans: InMemoryDailyPlanRepository;
  schedules: Schedules;
  transcript: Transcript;
  settings: SettingsService;
  tick: TickHandler;
  /** Registers a member with a rhythm row and a schedule. */
  join(userId: string, zone: string, overrides?: Partial<MemberSchedule>): Promise<void>;
  /** The touches this member has been sent, in order. */
  touchesFor(userId: string): (TouchMessageKind | undefined)[];
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const states = new InMemoryRhythmStateRepository(uow);
  const plans = new InMemoryDailyPlanRepository(uow);
  const checkins = new InMemoryCheckinRepository(uow);
  const schedules = new Schedules();
  const transcript = new Transcript();
  const tasks = new NoTasks();
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const heartbeats = {
    stamp: vi.fn(async () => undefined),
  } as unknown as HeartbeatService;

  const tick = new TickHandler(
    uow,
    states,
    plans,
    schedules,
    tasks,
    transcript,
    new DraftBuilder(
      tasks,
      new NoMeetings(),
      new NoSessions(),
      new NoMeals(),
      settings,
    ),
    settings,
    heartbeats,
  );

  return {
    uow,
    states,
    plans,
    schedules,
    transcript,
    settings,
    tick,
    async join(userId, zone, overrides = {}) {
      schedules.set(userId, zone, overrides);
      /*
       * Seeded at **yesterday's midnight on the member's own clock**, not at
       * `new Date()`, and that is not cosmetic.
       *
       * The repository refuses a save whose `updatedAt` is older than the
       * stored row — the optimistic check, and it is doing its job. A row
       * created at the real current time cannot then be claimed by a tick
       * handed an instant earlier in the same day, so every test in this file
       * that walks the morning would have thrown `StaleWriteError`, been
       * swallowed by the per-member try/catch, and reported "no touches" as if
       * the clock rule were wrong. Worse, it would have *passed* when the suite
       * ran in the evening and failed when it ran before lunch: a spec whose
       * verdict depends on the time of day it is run is worse than no spec.
       *
       * Yesterday's midnight also models what these tests are actually about —
       * an established member, whose day is entirely owed — rather than
       * somebody who registered mid-scenario.
       */
      const joinedAt = at('00:00', zone, -1);
      const state = RhythmState.create({ userId, at: joinedAt });
      await uow.run(() => states.save(state));
      void checkins;
    },
    touchesFor(userId) {
      return transcript.appended
        .filter((entry) => entry.userId === userId)
        .map((entry) => entry.touch);
    },
  };
}

// ------------------------------------------------------------------ the rules

describe('each member’s own local time, and nobody else’s', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('gives Cairo and Berlin the same 22:00 at two different instants', async () => {
    /*
     * The scenario the whole design exists for. Cairo is two hours ahead of
     * Berlin for most of the year, so when it is 22:00 in Cairo it is 20:00 in
     * Berlin — and n8n's pulse is one pulse. A cron that knew the times would
     * need one entry per zone; the gateway decides instead.
     */
    await b.join('cairo', CAIRO);
    await b.join('berlin', BERLIN);

    /*
     * Both instants are built from **one** calendar day, and that is not
     * tidiness — it is a flake this test had, and P6 found it.
     *
     * `at(hhmm, zone)` resolves against *that zone's* own "today", and for a
     * couple of hours after midnight in the eastern zone the two are on
     * different dates. Cairo's 22:00 was then a *later* instant than Berlin's,
     * the second tick went backwards, and the Berlin member's evening never
     * arrived: `expected [...] to include 'checkin_question'`. A red line that
     * depends on what hour the suite is run at teaches whoever sees it to
     * ignore red, which costs more than the thing it was testing.
     *
     * So the day is pinned to Cairo's and Berlin's 22:00 is asked for on that
     * same date. The property under test is untouched — one pulse, two zones,
     * two different instants for one wall clock — and it now holds at four in
     * the morning as well as at noon.
     */
    const day = localDate(new Date(), CAIRO);
    const cairoEvening = onDay(day, '22:00', CAIRO);
    const berlinEvening = onDay(day, '22:00', BERLIN);

    await b.tick.handle(cairoEvening);

    expect(b.touchesFor('cairo')).toContain('checkin_question');
    // The Berlin member's evening has not arrived, whatever the instant is.
    if (localHhMm(cairoEvening, BERLIN) < '21:00') {
      expect(b.touchesFor('berlin')).toEqual([]);
    }

    // And now theirs does. Later than Cairo's, because Berlin is behind — which
    // is the whole claim, so it is asserted rather than assumed.
    expect(berlinEvening.getTime()).toBeGreaterThan(cairoEvening.getTime());
    await b.tick.handle(berlinEvening);
    expect(b.touchesFor('berlin')).toContain('checkin_question');
  });

  it('sends each touch exactly once however often the tick runs', async () => {
    await b.join('m', CAIRO);

    // A five-minute pulse across the evening: eight passes, one summary.
    for (const minute of ['22:00', '22:05', '22:10', '22:15', '22:20', '22:25', '22:30', '22:35']) {
      await b.tick.handle(at(minute, CAIRO));
    }

    const summaries = b.touchesFor('m').filter((touch) => touch === 'checkin_question');
    expect(summaries).toHaveLength(1);
  });

  it('sends the prompt and the summary separately, an hour apart', async () => {
    /*
     * Three claim dates and not one: a gateway up at 21:30 owes the prompt and
     * does not yet owe the summary.
     *
     * The day is ticked through in order, which is not decoration — the first
     * version of this test jumped straight to 21:30 and got two touches,
     * because 08:00 had also passed with its date unclaimed and the member was
     * genuinely owed their briefing too. The tick was right and the fixture was
     * wrong. Walking the day is what a five-minute pulse actually does.
     */
    await b.join('m', CAIRO);

    await b.tick.handle(at('09:00', CAIRO));
    expect(b.touchesFor('m')).toEqual(['morning_briefing']);

    await b.tick.handle(at('21:30', CAIRO));
    expect(b.touchesFor('m')).toEqual(['morning_briefing', 'evening_prompt']);

    await b.tick.handle(at('22:30', CAIRO));
    expect(b.touchesFor('m')).toEqual([
      'morning_briefing',
      'evening_prompt',
      'checkin_question',
    ]);
  });
});

describe('downtime is caught up the same day and never the next', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('sends the summary once when the gateway returns at 22:40', async () => {
    // Nothing ran at 22:00. The rule is "the time has passed today and the
    // date is unclaimed", so 22:40 still owes it.
    await b.join('m', CAIRO);

    await b.tick.handle(at('22:40', CAIRO));

    expect(b.touchesFor('m')).toContain('checkin_question');
    const state = await b.states.find('m');
    expect(state?.lastEndOfDayDate).toBe(localDate(new Date(), CAIRO));
  });

  it('does not send yesterday’s summary when the gateway returns the next morning', async () => {
    /*
     * The other half of the same rule, and the one that would be wrong if the
     * claim were "the last touch sent" rather than "the date already claimed".
     * A member who wakes to last night's end-of-day summary at nine in the
     * morning has been told something untrue about a day that is over.
     */
    await b.join('m', CAIRO);

    // The system was down through the whole evening and comes back at 09:00.
    await b.tick.handle(at('09:00', CAIRO, 1));

    // The morning briefing is owed — its time has passed today. The summary is
    // not, because 22:00 today has not arrived yet.
    expect(b.touchesFor('m')).toEqual(['morning_briefing']);
  });

  it('claims before it sends, so a crash costs one touch and not an evening of them', async () => {
    /*
     * The transcript throws, as an unreachable Conversations context would.
     *
     * Two things are asserted, and the second was a surprise worth keeping.
     *
     * **The claim stands.** The touch that failed is not retried five minutes
     * later and then every five minutes after that, which is the failure a
     * member would actually notice. One lost message is the price, chosen
     * knowingly.
     *
     * **A failure stops that member's *remaining* touches for that pass** —
     * the throw unwinds out of the whole per-member block, so a summary owed at
     * the same moment is not attempted. That self-heals on the next pulse,
     * because its own claim date is still unwritten, and the second half of
     * this test proves it: five minutes later the summary arrives. Isolating
     * each touch in its own try/catch would save five minutes and cost the
     * ability to tell "this member's evening failed" from "one message of it
     * failed" in the logs.
     */
    const failing = bench();
    await failing.join('m', CAIRO);
    let broken = true;
    const working = failing.transcript.append.bind(failing.transcript);
    failing.transcript.append = async (input) => {
      if (broken) throw new Error('conversations unreachable');
      return working(input);
    };

    await failing.tick.handle(at('21:00', CAIRO));

    const afterFailure = await failing.states.find('m');
    expect(afterFailure?.lastPlanPromptDate).toBe(localDate(new Date(), CAIRO));
    expect(failing.touchesFor('m')).toEqual([]);
    // The summary was never attempted, so its date is still open.
    expect(afterFailure?.lastEndOfDayDate).toBeNull();

    broken = false;
    await failing.tick.handle(at('21:05', CAIRO));

    // The prompt is not retried; the summary is not yet due; the briefing is.
    expect(failing.touchesFor('m')).toEqual(['morning_briefing']);

    await failing.tick.handle(at('22:05', CAIRO));
    expect(failing.touchesFor('m')).toEqual([
      'morning_briefing',
      'checkin_question',
    ]);
  });
});

describe('daylight saving needs no code of its own', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('fires once, at the first minute that exists, on a spring-forward day', async () => {
    const gapDay = nextSpringForward(BERLIN);
    if (!gapDay) {
      // A zone with no transition in the next fourteen months. Nothing to
      // assert, and failing would be asserting a government's policy.
      return;
    }

    // A member whose end-of-day time falls inside the hour that never happens.
    await b.join('m', BERLIN, { endOfDayTime: '02:30' });

    // 03:00 on the gap day is the first minute after the jump.
    const firstValid = wallClockToUtc(`${gapDay}T03:00`, BERLIN)!;
    await b.tick.handle(firstValid);
    await b.tick.handle(new Date(firstValid.getTime() + 5 * 60_000));
    await b.tick.handle(new Date(firstValid.getTime() + 60 * 60_000));

    const summaries = b
      .touchesFor('m')
      .filter((touch) => touch === 'checkin_question');
    expect(summaries).toHaveLength(1);
  });
});

describe('a preference change cannot re-open an evening', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('does not send a second summary when the member moves 22:00 to 21:00', async () => {
    /*
     * The claim is keyed on the *date*, not the time, and this is why. A member
     * who receives their summary at 22:00 and then decides they would rather
     * have it at 21:00 has already had tonight's — and a claim keyed on the
     * time would find 21:00 unclaimed and send a second one.
     */
    await b.join('m', CAIRO);
    await b.tick.handle(at('22:00', CAIRO));
    expect(b.touchesFor('m')).toContain('checkin_question');

    b.schedules.set('m', CAIRO, { endOfDayTime: '21:00' });
    await b.tick.handle(at('22:30', CAIRO));

    const summaries = b
      .touchesFor('m')
      .filter((touch) => touch === 'checkin_question');
    expect(summaries).toHaveLength(1);
  });

  it('uses the new time from the next day, with no state change in between', async () => {
    // The tick reads the schedule live, so a saved preference is in effect on
    // the next pass. Nothing has to clear or rewrite a claim — which is the
    // whole reason the preferences handler has no work to do.
    await b.join('m', CAIRO, { endOfDayTime: '22:00' });
    await b.tick.handle(at('22:00', CAIRO));

    b.schedules.set('m', CAIRO, { endOfDayTime: '19:00' });
    await b.tick.handle(at('19:30', CAIRO, 1));

    const summaries = b
      .touchesFor('m')
      .filter((touch) => touch === 'checkin_question');
    expect(summaries).toHaveLength(2);
  });
});

describe('a member who travels gets no second copy', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('does not repeat a summary for somebody who flies west', async () => {
    /*
     * The case `isDue` exists for. It is 01:00 on Tuesday in Cairo, their
     * Tuesday summary was sent two hours ago, and they land in New York where
     * it is 19:00 on *Monday* — their local date has gone backwards. A rule of
     * "the claim is not today's date" would call Monday's summary unclaimed and
     * send a second one at 22:00 New York time, three hours later.
     */
    await b.join('traveller', CAIRO);

    // Cairo's Tuesday evening.
    await b.tick.handle(at('22:00', CAIRO));
    expect(b.touchesFor('traveller')).toContain('checkin_question');

    // They land, and the zone on their profile changes.
    b.schedules.set('traveller', 'America/New_York');

    // 22:00 New York on the calendar day that is *earlier* than the one already
    // claimed.
    await b.tick.handle(at('22:00', 'America/New_York', -1));

    const summaries = b
      .touchesFor('traveller')
      .filter((touch) => touch === 'checkin_question');
    expect(summaries).toHaveLength(1);
  });

  it('gives somebody who flies east their next evening on the new clock', async () => {
    // The other direction, which must still work: the date jumps forward,
    // nothing is claimed for it, and the touch fires at the new local time on
    // what is genuinely a new day.
    await b.join('traveller', BERLIN);
    await b.tick.handle(at('22:00', BERLIN));

    b.schedules.set('traveller', 'Asia/Tokyo');
    await b.tick.handle(at('22:00', 'Asia/Tokyo', 1));

    const summaries = b
      .touchesFor('traveller')
      .filter((touch) => touch === 'checkin_question');
    expect(summaries).toHaveLength(2);
  });
});

describe('the pass stays inside its performance goals', () => {
  /*
   * SC-001 and the plan's Performance Goals, asserted rather than reported.
   *
   * A timing test that printed a number nobody reads is a timing test that has
   * already failed at its job — so these fail the suite. The budgets are the
   * plan's own: under ten seconds for five hundred members when nobody is due,
   * under sixty when everybody is.
   *
   * Measured against in-memory adapters, so what this actually bounds is the
   * per-member work — the loop, the date arithmetic, the draft assembly and the
   * message composition. It does not bound Mongo. That is the right thing for
   * a unit suite to bound: a regression here is an algorithm that became
   * quadratic in the member count, which is the failure a store cannot rescue
   * and the one a gate against a real database would blame on the database.
   */
  const MEMBERS = 500;

  it(`sweeps ${MEMBERS} members in under ten seconds when nobody is due`, async () => {
    const b = bench();
    for (let index = 0; index < MEMBERS; index += 1) {
      await b.join(`m${String(index).padStart(4, '0')}`, CAIRO);
    }

    // 07:00, which is before the earliest of the three times — the morning
    // briefing at 08:00. 14:00 would have been *after* it, and with the claim
    // dates seeded to yesterday every one of the five hundred would have been
    // owed a briefing: "nobody is due" has to mean nobody, and the earliest
    // time in the schedule is what decides when that is true.
    const started = Date.now();
    const result = await b.tick.handle(at('07:00', CAIRO));
    const elapsed = Date.now() - started;

    expect(result.users).toBe(MEMBERS);
    expect(result.planPrompts + result.endOfDay + result.morning).toBe(0);
    expect(elapsed).toBeLessThan(10_000);
  });

  it(`sends to ${MEMBERS} members in under sixty seconds when everybody is due`, async () => {
    const b = bench();
    for (let index = 0; index < MEMBERS; index += 1) {
      await b.join(`m${String(index).padStart(4, '0')}`, CAIRO);
    }

    const started = Date.now();
    // 23:00 is past all three, so every member is owed all three.
    const result = await b.tick.handle(at('23:00', CAIRO));
    const elapsed = Date.now() - started;

    expect(result.users).toBe(MEMBERS);
    expect(result.planPrompts).toBe(MEMBERS);
    expect(result.endOfDay).toBe(MEMBERS);
    expect(result.morning).toBe(MEMBERS);
    expect(elapsed).toBeLessThan(60_000);
  }, 90_000);

  it('pages rather than loading every member at once', async () => {
    // The reason the loop is a loop. A single `find()` would pass both timing
    // assertions above and fall over on an installation with more members than
    // fit in memory, which is a failure no timing test can catch.
    const b = bench();
    for (let index = 0; index < PAGE_SIZE + 25; index += 1) {
      await b.join(`m${String(index).padStart(4, '0')}`, CAIRO);
    }

    const pageSizes: number[] = [];
    const paged = b.states.page.bind(b.states);
    b.states.page = async (after, limit) => {
      const rows = await paged(after, limit);
      pageSizes.push(rows.length);
      return rows;
    };

    const result = await b.tick.handle(at('07:00', CAIRO));

    expect(result.users).toBe(PAGE_SIZE + 25);
    expect(pageSizes[0]).toBe(PAGE_SIZE);
    expect(pageSizes).toContain(25);
  });
});

describe('a member who registers late is not owed a day that is ending', () => {
  it('sends nothing to somebody whose first tick is minutes after they joined at 23:00', async () => {
    /*
     * This asserts the *tick's* half of the rule. `RhythmBootstrapHandler`
     * suppresses the touches that have already gone by, and the write spec
     * covers that; what this covers is the consequence, which is the thing a
     * member would actually notice: no notification at 23:05 about an evening
     * they were not here for.
     */
    const b = bench();
    b.schedules.set('latecomer', CAIRO);

    // A row created the way the bootstrap creates it, with today's passed
    // touches already claimed.
    const state = RhythmState.create({
      userId: 'latecomer',
      at: at('23:00', CAIRO),
    });
    state.suppressToday(
      localDate(new Date(), CAIRO),
      ['plan', 'end_of_day', 'morning'],
      at('23:00', CAIRO),
    );
    await b.uow.run(() => b.states.save(state));

    await b.tick.handle(at('23:05', CAIRO));
    expect(b.touchesFor('latecomer')).toEqual([]);

    // And tomorrow runs normally, in order, from the morning.
    await b.tick.handle(at('08:05', CAIRO, 1));
    await b.tick.handle(at('21:05', CAIRO, 1));
    await b.tick.handle(at('22:05', CAIRO, 1));
    expect(b.touchesFor('latecomer')).toEqual([
      'morning_briefing',
      'evening_prompt',
      'checkin_question',
    ]);
  });
});
