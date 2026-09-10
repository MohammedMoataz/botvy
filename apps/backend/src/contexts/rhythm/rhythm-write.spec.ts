import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { nextDate as nextLocalDate } from './domain/adherence.js';
import type { PlanTask, PlanTraining } from './domain/daily-plan.aggregate.js';
import {
  CoachTranscriptPort,
  MemberSchedulePort,
  NextSessionPort,
  PlannedTasksPort,
  TodayMealsPort,
  type MemberSchedule,
  type TouchMessageKind,
} from './domain/rhythm.ports.js';
import { CaptureCheckinReplyHandler } from './features/capture-checkin-reply/capture-checkin-reply.handler.js';
import {
  ConfirmPlanHandler,
  PlanNotFound,
} from './features/confirm-plan/confirm-plan.handler.js';
import { MealLineChangedHandler } from './features/meal-line-changed/meal-line-changed.handler.js';
import { RhythmPreferencesChangedHandler } from './features/preferences-changed/preferences-changed.handler.js';
import { PromptNowHandler } from './features/prompt-now/prompt-now.handler.js';
import { RhythmPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { RecordCheckinHandler } from './features/record-checkin/record-checkin.handler.js';
import { RhythmBootstrapHandler } from './features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { SkipPlanHandler } from './features/skip-plan/skip-plan.handler.js';
import { DraftBuilder } from './features/tick/draft.builder.js';
import { TickHandler } from './features/tick/tick.handler.js';
import {
  InMemoryCheckinRepository,
  InMemoryDailyPlanRepository,
  InMemoryRhythmStateRepository,
} from './infrastructure/in-memory-rhythm.repositories.js';

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';

/**
 * Every instant in this file is built from `Date.now()` and never from a
 * literal date.
 *
 * A fixture pinned to a real date is a time bomb here specifically: the whole
 * feature compares the member's wall clock against their preferences, and
 * alert planning drops a lead time whose moment has passed — so a fixture dated
 * in the future starts failing the day the clock reaches it, and one dated in
 * the past starts failing when a DST rule for that year changes underneath it.
 *
 * `at('23:00')` means "23:00 today, on the member's own clock", resolved
 * through `wallClockToUtc` so the instant is the one their zone actually names.
 */
function at(hhmm: string, zone = CAIRO, dayOffset = 0): Date {
  let date = localDate(new Date(), zone);
  for (let index = 0; index < dayOffset; index += 1) {
    date = nextLocalDate(date);
  }
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`could not resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

/** Today and tomorrow as the member's calendar names them. */
/**
 * N days before the member's today, on their calendar.
 *
 * Calendar arithmetic rather than millisecond arithmetic: a local day is 23 or
 * 25 hours long twice a year, and subtracting 86,400,000 lands on the wrong
 * date on both of them — which for a streak test means asserting against a run
 * with a hole in it.
 */
function dateBack(days: number, zone = CAIRO): string {
  const value = new Date(`${today(zone)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function today(zone = CAIRO): string {
  return localDate(new Date(), zone);
}
function tomorrow(zone = CAIRO): string {
  return nextLocalDate(today(zone));
}

/**
 * The three times are stated here rather than taken from the registry, because
 * a spec that read the defaults would silently follow an operator retuning
 * them and stop testing the boundary it was written for. The morning time is
 * 08:00 so that a 07:00 registration sits strictly before all three, which is
 * the case the "suppresses nothing" scenario is about.
 */
class StubSchedules extends MemberSchedulePort {
  timezone = CAIRO;
  planTomorrowTime = '21:00';
  endOfDayTime = '22:00';
  morningBriefingTime = '08:00';
  checkinEnabled = true;
  /** Ids this stub refuses to answer for, to exercise the missing-schedule path. */
  readonly silentFor = new Set<string>();

  async forUsers(userIds: string[]): Promise<MemberSchedule[]> {
    return userIds
      .filter((userId) => !this.silentFor.has(userId))
      .map((userId) => ({
        userId,
        timezone: this.timezone,
        planTomorrowTime: this.planTomorrowTime,
        endOfDayTime: this.endOfDayTime,
        morningBriefingTime: this.morningBriefingTime,
        checkinEnabled: this.checkinEnabled,
      }));
  }
}

/**
 * Planning's answer, as this context sees it.
 *
 * `due` and `open` are separate lists because `confirm-plan` reads both and has
 * to accept a carry-over the member selected — a stub that answered the same
 * list to both calls would let a handler that only read `dueOn` pass.
 */
class StubTasks extends PlannedTasksPort {
  due: PlanTask[] = [];
  open: PlanTask[] = [];

  async dueOn(): Promise<PlanTask[]> {
    return this.due.map((task) => ({ ...task }));
  }

  async openBefore(): Promise<PlanTask[]> {
    return this.open.map((task) => ({ ...task }));
  }
}

class StubSessions extends NextSessionPort {
  session: PlanTraining | null = null;
  async forDate(): Promise<PlanTraining | null> {
    return this.session;
  }
}

class StubMeals extends TodayMealsPort {
  line: string | null = null;
  async lineFor(): Promise<string | null> {
    return this.line;
  }
}

class RecordingTranscript extends CoachTranscriptPort {
  readonly appended: Array<{
    userId: string;
    kind: string;
    content: string;
    touch?: TouchMessageKind;
  }> = [];

  async append(input: {
    userId: string;
    kind: 'coach' | 'planner';
    content: string;
    touch?: TouchMessageKind;
    at: Date;
  }): Promise<{ seq: number } | null> {
    this.appended.push({
      userId: input.userId,
      kind: input.kind,
      content: input.content,
      touch: input.touch,
    });
    return { seq: this.appended.length };
  }
}

function task(id: string, priority = 1, overrides: Partial<PlanTask> = {}): PlanTask {
  return { id, title: `Task ${id}`, priority, dueAt: null, deferCount: 0, ...overrides };
}

function event(name: string, payload: unknown, userId: string | null = MEMBER, occurredAt = new Date()): DomainEvent {
  return {
    eventId: newId(),
    name,
    context: name.split('.')[0]!,
    aggregate: { type: 'user', id: userId ?? 'x' },
    userId,
    occurredAt,
    payload,
    schemaVersion: 1,
  };
}

interface Bench {
  uow: InMemoryUnitOfWork;
  plans: InMemoryDailyPlanRepository;
  checkins: InMemoryCheckinRepository;
  states: InMemoryRhythmStateRepository;
  schedules: StubSchedules;
  tasks: StubTasks;
  sessions: StubSessions;
  meals: StubMeals;
  transcript: RecordingTranscript;
  settings: SettingsService;
  tick: TickHandler;
  bootstrap: RhythmBootstrapHandler;
  preferences: RhythmPreferencesChangedHandler;
  promptNow: PromptNowHandler;
  confirm: ConfirmPlanHandler;
  skip: SkipPlanHandler;
  record: RecordCheckinHandler;
  capture: CaptureCheckinReplyHandler;
  mealLine: MealLineChangedHandler;
  purge: RhythmPurgeOnDeletedHandler;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const plans = new InMemoryDailyPlanRepository(uow);
  const checkins = new InMemoryCheckinRepository(uow);
  const states = new InMemoryRhythmStateRepository(uow);
  const schedules = new StubSchedules();
  const tasks = new StubTasks();
  const sessions = new StubSessions();
  const meals = new StubMeals();
  const transcript = new RecordingTranscript();
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const heartbeats = {
    stamp: vi.fn(async () => undefined),
  } as unknown as HeartbeatService;

  const drafts = new DraftBuilder(tasks, sessions, meals, settings);
  const tick = new TickHandler(
    uow,
    states,
    plans,
    schedules,
    // The morning branch asks Planning which of a confirmed plan's tasks are
    // still open. It used to filter against the draft builder's output, which
    // applies `draftTopN` and omits carry-overs, so a member who confirmed
    // eight tasks was read four of them.
    tasks,
    transcript,
    drafts,
    settings,
    heartbeats,
  );
  const record = new RecordCheckinHandler(uow, checkins, states, schedules);

  return {
    uow,
    plans,
    checkins,
    states,
    schedules,
    tasks,
    sessions,
    meals,
    transcript,
    settings,
    tick,
    bootstrap: new RhythmBootstrapHandler(uow, states, schedules),
    preferences: new RhythmPreferencesChangedHandler(),
    promptNow: new PromptNowHandler(states, schedules, tick),
    confirm: new ConfirmPlanHandler(uow, plans, tasks),
    skip: new SkipPlanHandler(uow, plans),
    record,
    capture: new CaptureCheckinReplyHandler(states, tick, record),
    mealLine: new MealLineChangedHandler(uow, plans),
    purge: new RhythmPurgeOnDeletedHandler(uow, plans, checkins, states),
  };
}

let b: Bench;
beforeEach(() => {
  b = bench();
});

// --------------------------------------------------------------------- T306

describe('the row a member registers with', () => {
  it('suppresses every touch whose time has already passed when they register at 23:00', async () => {
    /*
     * The spec's own edge case. All three of 21:00, 22:00 and 08:00 are behind
     * a member registering at 23:00 Cairo, so all three are claimed for today
     * without being sent — otherwise the tick five minutes later would ask them
     * to plan a day with forty minutes left in it and then tell them it had
     * been set.
     */
    const registered = at('23:00');
    expect(
      await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, registered)),
    ).toBe('created');

    const state = await b.states.find(MEMBER);
    expect(state?.hasClaimed('plan', today())).toBe(true);
    expect(state?.hasClaimed('end_of_day', today())).toBe(true);
    expect(state?.hasClaimed('morning', today())).toBe(true);

    // And nothing was sent for that evening: a pass at 23:05 finds every date
    // claimed and writes no message.
    const result = await b.tick.handle(at('23:05'));
    expect(result.planPrompts).toBe(0);
    expect(result.endOfDay).toBe(0);
    expect(b.transcript.appended).toHaveLength(0);
  });

  it('fires the next evening normally for that same member', async () => {
    await b.bootstrap.handle(
      event('identity.UserRegistered', {}, MEMBER, at('23:00')),
    );

    // 21:00 the following day: yesterday's claim is strictly older than today,
    // so the prompt is owed. This is the half a `claim !== today` comparison
    // would also pass and a "suppress forever" flag would fail.
    const result = await b.tick.handle(at('21:00', CAIRO, 1));

    expect(result.planPrompts).toBe(1);
    expect(b.transcript.appended.map((message) => message.touch)).toContain(
      'evening_prompt',
    );
    // The morning briefing fires on the same pass, and correctly so: 08:00 is
    // behind 21:00 and tomorrow's date is unclaimed for it too. Asserted rather
    // than engineered away, because a suppression that outlived the day it was
    // written for would show up right here as a missing briefing.
    expect(result.morning).toBe(1);
  });

  it('suppresses nothing for a member who registers at 07:00', async () => {
    await b.bootstrap.handle(
      event('identity.UserRegistered', {}, MEMBER, at('07:00')),
    );

    const state = await b.states.find(MEMBER);
    expect(state?.lastPlanPromptDate).toBeNull();
    expect(state?.lastEndOfDayDate).toBeNull();
    expect(state?.lastMorningBriefingDate).toBeNull();

    // Their 08:00 briefing arrives an hour later, which is the point of not
    // suppressing it.
    const result = await b.tick.handle(at('08:00'));
    expect(result.morning).toBe(1);
  });

  it('suppresses only the touch whose time has exactly arrived', async () => {
    // The comparison is `>=`, matching the tick's, so registering at 08:00 on
    // the dot claims the briefing and leaves the evening owed. Written down
    // because a `>` here and a `>=` in the tick would disagree about one minute
    // a day and nothing else, which is the hardest kind of drift to find.
    await b.bootstrap.handle(
      event('identity.UserRegistered', {}, MEMBER, at('08:00')),
    );

    const state = await b.states.find(MEMBER);
    expect(state?.hasClaimed('morning', today())).toBe(true);
    expect(state?.lastPlanPromptDate).toBeNull();
  });

  it('creates nothing twice when the relay redelivers the registration', async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));

    // A streak the member has since built, to prove the second delivery does
    // not reset the row rather than merely not adding one.
    await b.record.handle(
      { userId: MEMBER, adhered: true, source: 'app' },
      at('22:30'),
    );

    expect(
      await b.bootstrap.handle(
        event('identity.UserRegistered', {}, MEMBER, at('07:00')),
      ),
    ).toBe('already-there');

    const state = await b.states.find(MEMBER);
    expect(state?.streak.current).toBe(1);
    expect(b.states.rows.size).toBe(1);
  });
});

// --------------------------------------------------------------------- T310

describe('a preference change', () => {
  it('notes a rhythm time without clearing a single claim', async () => {
    /*
     * The defect this asserts against: a member who moves three zones east
     * after their summary was sent must not get a second one. Clearing the
     * claim here is the obvious-looking "reschedule" and is exactly how that
     * happens, so the claim is checked to still be in place afterwards.
     */
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
    await b.tick.handle(at('22:00'));

    const before = await b.states.find(MEMBER);
    expect(before?.hasClaimed('end_of_day', today())).toBe(true);

    expect(
      await b.preferences.handle(
        event('profile.PreferencesChanged', { changed: ['endOfDayTime'] }),
      ),
    ).toBe('noted');

    const after = await b.states.find(MEMBER);
    expect(after?.lastEndOfDayDate).toBe(before?.lastEndOfDayDate);

    // And the tick still sends nothing for that evening, at the new time or the
    // old one.
    b.transcript.appended.length = 0;
    b.schedules.endOfDayTime = '21:00';
    const result = await b.tick.handle(at('22:10'));
    expect(result.endOfDay).toBe(0);
    expect(b.transcript.appended).toHaveLength(0);
  });

  it('ignores a change to a preference the rhythm does not read', async () => {
    expect(
      await b.preferences.handle(
        event('profile.PreferencesChanged', { changed: ['mealMode'] }),
      ),
    ).toBe('not-ours');
  });
});

// --------------------------------------------------------------------- T311

describe('the operator’s Run button', () => {
  beforeEach(async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
    // Moved behind every instant this block uses, so that a pass at 21:00 sends
    // the evening prompt and nothing else. Without it the 08:00 briefing is
    // also owed at 21:00 and every message count below counts two touches,
    // which would make the assertions about "was the forced touch sent" pass
    // for the wrong reason.
    b.schedules.morningBriefingTime = '23:30';
    b.tasks.due = [task('t1')];
  });

  it('sends a touch at three in the afternoon, hours before its time', async () => {
    // A conditional Run would report a zero here, which is indistinguishable
    // from a broken gateway — which is the whole reason the flag exists.
    expect(await b.promptNow.handle({ userId: MEMBER, kind: 'plan' }, at('15:00')))
      .toEqual({ sent: 1 });
    expect(b.transcript.appended).toHaveLength(1);
  });

  it('sends again for a date already claimed, and leaves it claimed', async () => {
    await b.tick.handle(at('21:00'));
    expect(b.transcript.appended).toHaveLength(1);

    await b.promptNow.handle({ userId: MEMBER, kind: 'plan' }, at('21:30'));
    expect(b.transcript.appended).toHaveLength(2);

    // Still claimed, so the five-minute tick does not add a third copy.
    const result = await b.tick.handle(at('21:35'));
    expect(result.planPrompts).toBe(0);
    expect(b.transcript.appended).toHaveLength(2);
  });

  it('runs for every member when no id is given', async () => {
    await b.bootstrap.handle(
      event('identity.UserRegistered', {}, 'member-2', at('07:00')),
    );

    expect(await b.promptNow.handle({ kind: 'morning' }, at('15:00'))).toEqual({
      sent: 2,
    });
    expect(b.transcript.appended.map((message) => message.userId).sort()).toEqual([
      MEMBER,
      'member-2',
    ]);
  });

  it('reports nothing sent for an id with no rhythm row', async () => {
    expect(
      await b.promptNow.handle({ userId: 'nobody', kind: 'plan' }, at('15:00')),
    ).toEqual({ sent: 0 });
  });
});

// --------------------------------------------------------------------- T322

describe('confirming and skipping tomorrow', () => {
  beforeEach(async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
    // Behind the 21:00 pass, so the only plan row that exists is tomorrow's
    // draft. With the briefing at 08:00 the same pass also writes *today's*
    // plan, and "confirming a date with no plan is refused" would then be
    // testing a date that does have one.
    b.schedules.morningBriefingTime = '23:30';
    b.tasks.due = [task('t1', 1), task('t2', 2), task('t3', 3)];
    b.sessions.session = {
      sessionId: 'session-1',
      title: 'Intervals',
      sport: 'running',
      startAt: at('19:00', CAIRO, 1),
    };
    await b.tick.handle(at('21:00'));
  });

  it('clears the training slot the draft proposed when the member says false', async () => {
    const drafted = await b.plans.forDate(MEMBER, tomorrow());
    expect(drafted?.training?.sessionId).toBe('session-1');

    const confirmed = await b.confirm.handle(
      { userId: MEMBER, date: tomorrow(), taskIds: ['t1'], training: false },
      at('21:20'),
    );

    expect(confirmed.training).toBe(false);
    expect((await b.plans.forDate(MEMBER, tomorrow()))?.training).toBeNull();
  });

  it('leaves the slot alone when training is omitted', async () => {
    const confirmed = await b.confirm.handle(
      { userId: MEMBER, date: tomorrow(), taskIds: ['t1'] },
      at('21:20'),
    );
    expect(confirmed.training).toBe(true);
  });

  it('drops an id it does not recognise rather than refusing the whole answer', async () => {
    /*
     * The draft can be an hour old. A 400 for one completed task would lose the
     * other three, and the member would be looking at a sheet that was accurate
     * when it was drawn.
     */
    const confirmed = await b.confirm.handle(
      {
        userId: MEMBER,
        date: tomorrow(),
        taskIds: ['t1', 't2', 'someone-elses-task'],
      },
      at('21:20'),
    );

    expect(confirmed.taskIds).toEqual(['t1', 't2']);
    expect(confirmed.status).toBe('confirmed');
  });

  it('re-reads the title from Planning instead of trusting the draft snapshot', async () => {
    // The task was retitled between the prompt and the answer. What is stored
    // is what Planning says now, which is also why a client-supplied title
    // could never enter the plan.
    b.tasks.due = [task('t1', 1, { title: 'Renamed after the prompt' })];

    await b.confirm.handle(
      { userId: MEMBER, date: tomorrow(), taskIds: ['t1'] },
      at('21:50'),
    );

    const plan = await b.plans.forDate(MEMBER, tomorrow());
    expect(plan?.tasks[0]?.title).toBe('Renamed after the prompt');
  });

  it('accepts a carry-over the member selected, not only what is due', async () => {
    b.tasks.due = [];
    b.tasks.open = [task('carried', 1, { deferCount: 2 })];

    const confirmed = await b.confirm.handle(
      { userId: MEMBER, date: tomorrow(), taskIds: ['carried'] },
      at('21:20'),
    );
    expect(confirmed.taskIds).toEqual(['carried']);
  });

  it('is idempotent in effect when the member confirms twice', async () => {
    const first = await b.confirm.handle(
      { userId: MEMBER, date: tomorrow(), taskIds: ['t1', 't2'] },
      at('21:20'),
    );
    const second = await b.confirm.handle(
      { userId: MEMBER, date: tomorrow(), taskIds: ['t1', 't2'] },
      at('21:25'),
    );

    expect(second.taskIds).toEqual(first.taskIds);
    expect(second.status).toBe('confirmed');
    expect(b.plans.rows.size).toBe(1);
  });

  it('refuses a date with no plan', async () => {
    await expect(
      b.confirm.handle(
        { userId: MEMBER, date: today(), taskIds: ['t1'] },
        at('21:20'),
      ),
    ).rejects.toBeInstanceOf(PlanNotFound);

    await expect(
      b.skip.handle({ userId: MEMBER, date: today() }, at('21:20')),
    ).rejects.toBeInstanceOf(PlanNotFound);
  });

  it('keeps the drafted contents when the member skips', async () => {
    const skipped = await b.skip.handle(
      { userId: MEMBER, date: tomorrow() },
      at('21:20'),
    );

    expect(skipped.status).toBe('skipped');
    const plan = await b.plans.forDate(MEMBER, tomorrow());
    // The training is still named, because the end-of-day summary reads it from
    // here and telling somebody who skipped planning that they have a session
    // at seven is useful.
    expect(plan?.training?.sessionId).toBe('session-1');
    expect(plan?.tasks).toHaveLength(3);
  });
});

// --------------------------------------------------------------------- T340

describe('the check-in and the streak', () => {
  beforeEach(async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
  });

  it('increments the streak on a yes, and again the next day', async () => {
    const first = await b.record.handle(
      { userId: MEMBER, date: today(), adhered: true, mood: 70, source: 'app' },
      at('22:30'),
    );
    expect(first.streak).toBe(1);

    const second = await b.record.handle(
      { userId: MEMBER, date: tomorrow(), adhered: true, source: 'app' },
      at('22:30', CAIRO, 1),
    );
    expect(second.streak).toBe(2);
    expect(second.best).toBe(2);
  });

  it('resets the streak to zero on a no and keeps the best', async () => {
    await b.record.handle(
      { userId: MEMBER, date: today(), adhered: true, source: 'app' },
      at('22:30'),
    );
    const missed = await b.record.handle(
      { userId: MEMBER, date: tomorrow(), adhered: false, source: 'app' },
      at('22:30', CAIRO, 1),
    );

    expect(missed.streak).toBe(0);
    // `best` is the only value here that cannot be re-derived from the rows, so
    // it is the one that has to survive a miss.
    expect(missed.best).toBe(1);
  });

  it('keeps the streak when a member corrects a no into a yes', async () => {
    /*
     * The case that made the streak a derivation rather than a fold.
     *
     * A member on a run answers "no" and then corrects it — a mistap, or they
     * remembered the walk. The old fold zeroed the counter on the "no" and left
     * `lastAdheredDate` at yesterday, so the correction computed `0 + 1` and a
     * nine-day streak came back as one, with nothing left in the store that
     * could have recovered it. Patching one row is exactly what this handler
     * exists to allow, so a correction is ordinary and not an edge case.
     */
    // Three days of yes, ending yesterday.
    await b.record.handle(
      { userId: MEMBER, date: dateBack(3), adhered: true, source: 'app' },
      at('22:30'),
    );
    await b.record.handle(
      { userId: MEMBER, date: dateBack(2), adhered: true, source: 'app' },
      at('22:30'),
    );
    await b.record.handle(
      { userId: MEMBER, date: dateBack(1), adhered: true, source: 'app' },
      at('22:30'),
    );

    const missed = await b.record.handle(
      { userId: MEMBER, date: today(), adhered: false, source: 'app' },
      at('22:30'),
    );
    expect(missed.streak).toBe(0);

    const corrected = await b.record.handle(
      { userId: MEMBER, date: today(), adhered: true, source: 'chat' },
      at('22:35'),
    );

    // Four consecutive days, not one.
    expect(corrected.streak).toBe(4);
    expect(corrected.best).toBeGreaterThanOrEqual(4);
    // Still one row for today.
    expect(b.checkins.rows.size).toBe(4);
  });

  it('does not count one day twice when it is answered from two places', async () => {
    await b.record.handle(
      { userId: MEMBER, date: today(), adhered: true, source: 'chat' },
      at('22:30'),
    );
    const again = await b.record.handle(
      { userId: MEMBER, date: today(), adhered: true, mood: 55, source: 'app' },
      at('22:40'),
    );

    expect(again.streak).toBe(1);
    // One row, patched — the id is `"<userId>:<date>"`.
    expect(b.checkins.rows.size).toBe(1);
    expect(again.mood).toBe(55);
  });

  it('leaves the streak alone for a mood with no verdict', async () => {
    await b.record.handle(
      { userId: MEMBER, date: today(), adhered: true, source: 'app' },
      at('22:30'),
    );
    const moodOnly = await b.record.handle(
      { userId: MEMBER, date: tomorrow(), mood: 20, source: 'app' },
      at('09:00', CAIRO, 1),
    );

    expect(moodOnly.streak).toBe(1);
    // And the verdict it did not carry is not read as a miss.
    expect(moodOnly.adhered).toBeNull();
  });

  it('does not erase a verdict when a later answer carries only a mood', async () => {
    await b.record.handle(
      { userId: MEMBER, date: today(), adhered: true, source: 'chat' },
      at('22:30'),
    );
    const patched = await b.record.handle(
      { userId: MEMBER, date: today(), mood: 40, source: 'app' },
      at('22:45'),
    );

    expect(patched.adhered).toBe(true);
    expect(patched.mood).toBe(40);
  });

  it('files the answer under the member’s own local date when none is given', async () => {
    // 01:00 in Cairo is still the previous day in UTC, so a handler reading the
    // process clock would file this answer against the day before — colliding
    // with the answer the member may already have given for it.
    const recorded = await b.record.handle(
      { userId: MEMBER, adhered: true, source: 'app' },
      at('01:00', CAIRO, 1),
    );
    expect(recorded.date).toBe(tomorrow());
  });

  it('closes the check-in window it answers', async () => {
    await b.tick.handle(at('22:00'));
    expect((await b.states.find(MEMBER))?.awaitingCheckin).toBe(true);

    await b.record.handle(
      { userId: MEMBER, adhered: true, source: 'app' },
      at('22:30'),
    );
    expect((await b.states.find(MEMBER))?.awaitingCheckin).toBe(false);
  });

  it('raises CheckinRecorded from inside the transaction', async () => {
    await b.record.handle(
      { userId: MEMBER, adhered: true, source: 'app' },
      at('22:30'),
    );
    expect(b.uow.events.map((raised) => raised.name)).toContain(
      'rhythm.CheckinRecorded',
    );
  });
});

// --------------------------------------------------------------------- T341

describe('reading a check-in out of a chat reply', () => {
  beforeEach(async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
    // The end-of-day touch is what opens the window.
    await b.tick.handle(at('22:00'));
  });

  it('records the answer when all three guards pass', async () => {
    const captured = await b.capture.handle(
      { userId: MEMBER, conversationKind: 'coach', text: 'yes, 80' },
      at('22:10'),
    );

    expect(captured).toMatchObject({ captured: true, verdict: 'adhered', mood: 80 });
    expect(b.checkins.rows.size).toBe(1);
    expect((await b.states.find(MEMBER))?.awaitingCheckin).toBe(false);
  });

  it('records nothing from a conversation that is not the coach one', async () => {
    /*
     * SC-004, and the concrete failure: these are ordinary sentences. "no, move
     * it to Friday" in the planner chat and "did that already" in a free chat
     * both contain words the classifier counts, and `no` zeroes a nine-day run.
     * The exact words that *would* count in the coach chat are used here on
     * purpose — a stub reply of "hello" would let a handler with no
     * conversation guard pass this test.
     */
    for (const text of ['no', 'did', 'rest day', 'تمام']) {
      expect(
        await b.capture.handle(
          { userId: MEMBER, conversationKind: 'planner', text },
          at('22:10'),
        ),
      ).toEqual({ captured: false, reason: 'not_coach' });
    }

    expect(b.checkins.rows.size).toBe(0);
    // The window is left open, so the member's next coach message can still be
    // the answer.
    expect((await b.states.find(MEMBER))?.awaitingCheckin).toBe(true);
  });

  it('records nothing when no question is outstanding', async () => {
    await b.record.handle(
      { userId: MEMBER, adhered: true, source: 'app' },
      at('22:05'),
    );

    expect(
      await b.capture.handle(
        { userId: MEMBER, conversationKind: 'coach', text: 'no' },
        at('22:10'),
      ),
    ).toEqual({ captured: false, reason: 'not_awaiting' });
  });

  it('records nothing once the window has run out, and closes it', async () => {
    const hours = await b.settings.get('rhythm.checkinWindowHours');

    expect(
      await b.capture.handle(
        { userId: MEMBER, conversationKind: 'coach', text: 'yes' },
        new Date(at('22:00').getTime() + (hours + 1) * 3_600_000),
      ),
    ).toEqual({ captured: false, reason: 'expired' });

    expect(b.checkins.rows.size).toBe(0);
    expect((await b.states.find(MEMBER))?.awaitingCheckin).toBe(false);
  });

  it('falls through on an unclear reply and leaves the window open', async () => {
    expect(
      await b.capture.handle(
        { userId: MEMBER, conversationKind: 'coach', text: 'what was the plan again' },
        at('22:10'),
      ),
    ).toEqual({ captured: false, reason: 'unclear' });

    expect(b.checkins.rows.size).toBe(0);
    // Left open deliberately: recording a guessed verdict costs the member
    // their streak, and asking again costs a sentence.
    expect((await b.states.find(MEMBER))?.awaitingCheckin).toBe(true);
  });

  it('lets negation win inside the coach chat', async () => {
    const captured = await b.capture.handle(
      { userId: MEMBER, conversationKind: 'coach', text: "yeah, I didn't manage it" },
      at('22:10'),
    );
    expect(captured).toMatchObject({ captured: true, verdict: 'missed', streak: 0 });
  });
});

// --------------------------------------------------------------------- T307

describe('the meal line, replaced after the fact', () => {
  beforeEach(async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
    // Behind the 21:00 pass, so tomorrow's draft is the only plan on disk and
    // "creates nothing for a date with no plan" is asked of a genuinely empty
    // date.
    b.schedules.morningBriefingTime = '23:30';
    b.tasks.due = [task('t1')];
    b.meals.line = 'Meals: eggs, rice, chicken';
    await b.tick.handle(at('21:00'));
  });

  /**
   * The scenario the handler exists for: the member regenerates their meals at
   * nine the next morning, hours after the plan was written. The instant is
   * passed explicitly because it has to be *after* the row it edits — an event
   * dated before the plan's own `updatedAt` is a stale write and the repository
   * refuses it, which is the correct refusal and not the thing under test.
   */
  const regeneratedAt = () => at('09:00', CAIRO, 1);

  it('replaces the stored line when the member regenerates their meals', async () => {
    expect(
      await b.mealLine.handle(
        event(
          'nutrition.MealPlanReady',
          { date: tomorrow(), line: 'Meals: oats, lentils, fish' },
          MEMBER,
          regeneratedAt(),
        ),
      ),
    ).toBe('updated');

    expect((await b.plans.forDate(MEMBER, tomorrow()))?.mealLine).toBe(
      'Meals: oats, lentils, fish',
    );
  });

  it('writes nothing when the relay redelivers the same event', async () => {
    const same = event(
      'nutrition.MealPlanReady',
      { date: tomorrow(), line: 'Meals: oats, lentils, fish' },
      MEMBER,
      regeneratedAt(),
    );

    expect(await b.mealLine.handle(same)).toBe('updated');
    const after = (await b.plans.forDate(MEMBER, tomorrow()))?.updatedAt;

    expect(await b.mealLine.handle(same)).toBe('unchanged');
    // The same `updatedAt`, which matters beyond tidiness: the phone pulls by
    // `updatedAt`, so a phantom bump re-sends the plan on every duplicate.
    expect((await b.plans.forDate(MEMBER, tomorrow()))?.updatedAt).toEqual(after);
  });

  it('replaces the old line with the reason when a plan is withheld', async () => {
    expect(
      await b.mealLine.handle(
        event(
          'nutrition.MealPlanWithheld',
          { date: tomorrow(), reason: 'the model was unavailable' },
          MEMBER,
          regeneratedAt(),
        ),
      ),
    ).toBe('updated');

    // Not left standing, and not blank: yesterday's menu on today's card would
    // have the member shopping for food nothing is suggesting.
    expect((await b.plans.forDate(MEMBER, tomorrow()))?.mealLine).toBe(
      'Meals: none planned — the model was unavailable',
    );
  });

  it('creates nothing for a date with no plan', async () => {
    expect(
      await b.mealLine.handle(
        event(
          'nutrition.MealPlanReady',
          { date: today(), line: 'Meals: anything' },
          MEMBER,
          regeneratedAt(),
        ),
      ),
    ).toBe('no-plan');
    expect(await b.plans.forDate(MEMBER, today())).toBeNull();
  });
});

// --------------------------------------------------------------------- T362

describe('purging a deleted member', () => {
  it('removes their plans, check-ins and rhythm state', async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
    // Behind the 22:00 pass, so exactly one plan row exists and the count below
    // is about the purge rather than about how many touches a pass made.
    b.schedules.morningBriefingTime = '23:30';
    b.tasks.due = [task('t1')];
    await b.tick.handle(at('22:00'));
    await b.record.handle(
      { userId: MEMBER, adhered: true, source: 'app' },
      at('22:30'),
    );

    expect(b.plans.rows.size).toBe(1);
    expect(b.checkins.rows.size).toBe(1);
    expect(b.states.rows.size).toBe(1);

    expect(await b.purge.handle(event('identity.UserDeleted', {}))).toBe('purged');

    expect(b.plans.rows.size).toBe(0);
    expect(b.checkins.rows.size).toBe(0);
    // The state row included: `streak.best` is a member's personal record, and
    // leaving it behind keeps data after they asked to be erased.
    expect(b.states.rows.size).toBe(0);
  });

  it('reports nothing to do on a redelivery', async () => {
    await b.bootstrap.handle(event('identity.UserRegistered', {}, MEMBER, at('07:00')));
    await b.purge.handle(event('identity.UserDeleted', {}));

    expect(await b.purge.handle(event('identity.UserDeleted', {}))).toBe(
      'nothing-to-do',
    );
  });

  it('does nothing for an event with no userId', async () => {
    expect(
      await b.purge.handle(event('identity.UserDeleted', {}, null)),
    ).toBe('nothing-to-do');
  });
});
