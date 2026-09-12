import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
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
  type MealHalf,
  type MemberSchedule,
  type TouchMessageKind,
} from './domain/rhythm.ports.js';
import { DraftBuilder } from './features/tick/draft.builder.js';
import { TickHandler } from './features/tick/tick.handler.js';
import {
  InMemoryDailyPlanRepository,
  InMemoryRhythmStateRepository,
} from './infrastructure/in-memory-rhythm.repositories.js';

/**
 * FR-012, and from P6 also training's half of FR-011: the day's meetings **and**
 * the day's session, in the evening proposal for tomorrow and in the morning
 * briefing for today.
 *
 * The second half of each is the one that gets forgotten — the evening proposal
 * is what anybody testing this by hand would look at — so both are asserted
 * here, and so is the case that has to stay unchanged: a member with neither
 * must read the sentence they read before either phase, with no orphan
 * "Meetings:" heading over a blank space.
 *
 * Training joined this file rather than getting its own because it is the same
 * question about the same three sentences, and `NextSessionPort` had a
 * null-returning stub here already: making that stub settable is a smaller and
 * more honest change than a second bench that wires the same nine collaborators
 * to assert one more line.
 *
 * ## Every instant comes from `Date.now()`
 *
 * Never a literal. The touches compare a member's wall clock against their own
 * preferences, so a fixture pinned to a real date starts failing the day the
 * clock reaches it, and one pinned to a past date starts failing when a
 * government moves that year's daylight-saving boundary underneath it.
 */

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';

/** "That wall clock, on the member's own calendar day." */
function at(hhmm: string, dayOffset = 0): Date {
  let date = localDate(new Date(), CAIRO);
  for (let index = 0; index < dayOffset; index += 1) date = nextDate(date);
  const instant = wallClockToUtc(`${date}T${hhmm}`, CAIRO);
  if (!instant) throw new Error(`could not resolve ${date}T${hhmm} in ${CAIRO}`);
  return instant;
}

function today(): string {
  return localDate(new Date(), CAIRO);
}
function tomorrow(): string {
  return nextDate(today());
}

// ------------------------------------------------------------------- stubs

class StubSchedules extends MemberSchedulePort {
  async forUsers(userIds: string[]): Promise<MemberSchedule[]> {
    return userIds.map((userId) => ({
      userId,
      timezone: CAIRO,
      planTomorrowTime: '21:00',
      endOfDayTime: '22:00',
      morningBriefingTime: '08:00',
      checkinEnabled: false,
    }));
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

/**
 * Meetings' answer, as this context sees it: one list per local date.
 *
 * Keyed by date rather than a single list, because the whole point of FR-012 is
 * that two different touches ask about two different days — a stub that
 * answered the same list for both would pass while the briefing was reading
 * tomorrow's diary.
 */
class StubMeetings extends MeetingsOnPort {
  readonly asked: string[] = [];
  readonly byDate = new Map<string, PlanMeeting[]>();

  set(date: string, meetings: PlanMeeting[]): void {
    this.byDate.set(date, meetings);
  }

  async onDate(_userId: string, date: string): Promise<PlanMeeting[]> {
    this.asked.push(date);
    // Copied out, so a test that renames a meeting in the stub afterwards is
    // renaming its own row and not the one the plan snapshotted.
    return (this.byDate.get(date) ?? []).map((meeting) => ({ ...meeting }));
  }
}

/**
 * Training's port, which answered null from P3 to P6.
 *
 * Settable now rather than constant, because T640 bound it to Training and the
 * two touches FR-011 names have to be shown to name the session. The default is
 * still null, which is what keeps the empty-day case below meaning what it
 * meant: a member with no training reads exactly the sentence they read before
 * either phase.
 */
class StubSessions extends NextSessionPort {
  readonly asked: string[] = [];
  readonly byDate = new Map<string, PlanTraining>();

  set(date: string, session: PlanTraining): void {
    this.byDate.set(date, session);
  }

  async forDate(_userId: string, date: string): Promise<PlanTraining | null> {
    this.asked.push(date);
    const session = this.byDate.get(date);
    // Copied out, for the reason `StubMeetings` copies its rows: a test that
    // renames the session afterwards is renaming its own row and not the one
    // the plan snapshotted.
    return session ? { ...session } : null;
  }
}

class NoMeals extends TodayMealsPort {
  async lineFor(): Promise<MealHalf> {
    // No line *and* no reason: nothing has chosen this day's meals, which is a
    // different day from one whose meals were withheld. The plan renders
    // correctly with neither.
    return { line: null, reason: null };
  }
}

class RecordingTranscript extends CoachTranscriptPort {
  readonly appended: Array<{ touch?: TouchMessageKind; content: string }> = [];

  async append(input: {
    userId: string;
    kind: 'coach' | 'planner';
    content: string;
    touch?: TouchMessageKind;
    at: Date;
  }): Promise<{ seq: number } | null> {
    this.appended.push({ touch: input.touch, content: input.content });
    return { seq: this.appended.length };
  }
}

interface Bench {
  plans: InMemoryDailyPlanRepository;
  meetings: StubMeetings;
  sessions: StubSessions;
  transcript: RecordingTranscript;
  uow: InMemoryUnitOfWork;
  tick: TickHandler;
  join(): Promise<void>;
  said(touch: TouchMessageKind): string;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const states = new InMemoryRhythmStateRepository(uow);
  const plans = new InMemoryDailyPlanRepository(uow);
  const meetings = new StubMeetings();
  const sessions = new StubSessions();
  const transcript = new RecordingTranscript();
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
    new StubSchedules(),
    tasks,
    transcript,
    new DraftBuilder(tasks, meetings, sessions, new NoMeals(), settings),
    settings,
    heartbeats,
  );

  return {
    plans,
    meetings,
    sessions,
    transcript,
    uow,
    tick,
    async join() {
      // Yesterday's midnight, for the reason `rhythm-clock.spec.ts` sets out at
      // length: the repository's optimistic check refuses a save older than the
      // stored row, so a state created at the real current time cannot be
      // claimed by a tick handed 08:00 this morning.
      const state = RhythmState.create({ userId: MEMBER, at: at('00:00', -1) });
      await uow.run(() => states.save(state));
    },
    said(touch) {
      const entry = transcript.appended.find((row) => row.touch === touch);
      if (!entry) throw new Error(`no ${touch} was written`);
      return entry.content;
    },
  };
}

let b: Bench;
beforeEach(() => {
  b = bench();
});

// --------------------------------------------------------------------- T532

describe('the day’s meetings reach both touches', () => {
  it('names tomorrow’s meetings, with their times, in the evening proposal', async () => {
    b.meetings.set(tomorrow(), [
      {
        meetingId: 'm-1',
        title: 'Design review',
        startAt: at('10:00', 1),
        durationMin: 45,
      },
      {
        meetingId: 'm-2',
        title: 'Sara — quarterly',
        startAt: at('16:30', 1),
        durationMin: 30,
      },
    ]);

    await b.join();
    await b.tick.handle(at('21:00'));

    const said = b.said('evening_prompt');
    expect(said).toContain('Meetings:');
    expect(said).toContain('• 10:00 Design review (45m)');
    expect(said).toContain('• 16:30 Sara — quarterly (30m)');
    // The day it asked about is tomorrow's, not the server's and not today's.
    expect(b.meetings.asked).toContain(tomorrow());
  });

  it('names today’s meetings in the morning briefing', async () => {
    /*
     * The half of FR-012 that gets forgotten. The briefing is a different
     * touch reading a different day, and it is the one a member reads before
     * they leave the house.
     */
    b.meetings.set(today(), [
      {
        meetingId: 'm-3',
        title: 'Standup',
        startAt: at('09:30'),
        durationMin: 15,
      },
    ]);

    await b.join();
    await b.tick.handle(at('08:00'));

    const said = b.said('morning_briefing');
    expect(said).toContain('Meetings:');
    expect(said).toContain('• 09:30 Standup (15m)');
    expect(b.meetings.asked).toEqual([today()]);
  });

  it('renders a single-digit day’s meeting as HH:mm and not a sliced date', async () => {
    /*
     * `formatInTz` returns "Tue 2 Sep, 09:05", whose width moves with the day
     * and the month, so slicing a time out of it yields ", 09:0" on the 2nd.
     * Asserted with a regex rather than a fixed string because the calendar day
     * this suite runs on is whatever today is — the property is that the time
     * is exactly five characters of clock, whatever the date.
     */
    b.meetings.set(today(), [
      {
        meetingId: 'm-4',
        title: 'Physio',
        startAt: at('09:05'),
        durationMin: 60,
      },
    ]);

    await b.join();
    await b.tick.handle(at('08:00'));

    expect(b.said('morning_briefing')).toMatch(/• 09:05 Physio \(60m\)/);
  });
});

describe('a day with no meetings', () => {
  it('reads exactly as it did before, with no orphan heading', async () => {
    await b.join();

    await b.tick.handle(at('21:00'));
    await b.tick.handle(at('22:00'));
    await b.tick.handle(at('08:00', 1));

    /*
     * All three kinds, because an empty list that printed its heading would do
     * it in whichever one nobody looked at. Four messages and not three: the
     * 21:00 pass also owes this member their morning briefing, since 08:00 is
     * behind them and the claim is still unwritten — which is the tick's
     * catch-up rule doing its job, not a second copy.
     */
    expect(b.transcript.appended.map((entry) => entry.touch).sort()).toEqual([
      'end_of_day_summary',
      'evening_prompt',
      'morning_briefing',
      'morning_briefing',
    ]);
    for (const entry of b.transcript.appended) {
      expect(entry.content).not.toContain('Meetings:');
    }
    expect(b.said('evening_prompt')).toContain(
      'Nothing is scheduled yet — nothing due and no training.',
    );
    expect(b.said('morning_briefing')).toContain(
      'Nothing due and no training. A clear day.',
    );
  });

  it('stops calling a day empty once it holds a meeting', async () => {
    /*
     * `isEmpty` decides between "nothing is scheduled" and the list, and it
     * counted only tasks and training. A member whose whole Tuesday is two
     * meetings would have been told their day was clear.
     */
    b.meetings.set(tomorrow(), [
      {
        meetingId: 'm-5',
        title: 'Board call',
        startAt: at('11:00', 1),
        durationMin: 90,
      },
    ]);

    await b.join();
    await b.tick.handle(at('21:00'));

    const said = b.said('evening_prompt');
    expect(said).not.toContain('Nothing is scheduled yet');
    expect(said).toContain('• 11:00 Board call (90m)');
  });
});

// --------------------------------------------------------------------- T640

describe('the day’s training reaches both touches', () => {
  it('names tomorrow’s session, with its sport and time, in the evening proposal', async () => {
    /*
     * FR-011's other half, and it was unassertable until T640: `NextSessionPort`
     * answered null from P3 to P6, so `touch-message.ts` has always been able to
     * render this line and has never had a session to render. The sentence is
     * unchanged — this is the case that shows it was correct all along, which is
     * exactly what the stub's own comment promised.
     */
    b.sessions.set(tomorrow(), {
      sessionId: 'session-1',
      title: 'Upper body',
      sport: 'gym',
      startAt: at('18:00', 1),
    });

    await b.join();
    await b.tick.handle(at('21:00'));

    expect(b.said('evening_prompt')).toContain(
      'Training: Upper body (gym) at 18:00',
    );
    // The day it asked about is tomorrow's, which is what the whole `forDate`
    // contract exists for: a port taking a local date leaves whose midnight it
    // is to the context that owns the sessions.
    expect(b.sessions.asked).toContain(tomorrow());
  });

  it('names today’s session in the morning briefing', async () => {
    // The forgotten half of every "does it show up" requirement. The briefing
    // is about *today*, so a stub keyed by date is what catches a builder
    // reading tomorrow's session at eight in the morning.
    b.sessions.set(today(), {
      sessionId: 'session-2',
      title: 'Intervals',
      sport: 'swimming',
      startAt: at('07:30'),
    });

    await b.join();
    await b.tick.handle(at('08:00'));

    expect(b.said('morning_briefing')).toContain(
      'Training: Intervals (swimming) at 07:30',
    );
    expect(b.sessions.asked).toContain(today());
  });

  it('keeps the session in the end-of-day summary, which states it either way', async () => {
    // The summary names training unconditionally — "No training tomorrow." when
    // there is none — because it is the part of the day a member cannot
    // reconstruct from a task list. So this asserts the positive branch, and
    // the empty-day case below still covers the negative one.
    b.sessions.set(tomorrow(), {
      sessionId: 'session-3',
      title: 'Long ride',
      sport: 'cycling',
      startAt: at('06:00', 1),
    });

    await b.join();
    await b.tick.handle(at('22:00'));

    const summary = b.said('end_of_day_summary');
    expect(summary).toContain('Training: Long ride (cycling) at 06:00');
    expect(summary).not.toContain('No training tomorrow.');
  });

  it('stops calling a day empty once it holds a session', async () => {
    // `isEmpty` decides between "nothing is scheduled" and the list. A member
    // whose whole Tuesday is one training session must not be told it is clear.
    b.sessions.set(tomorrow(), {
      sessionId: 'session-4',
      title: 'Push day',
      sport: 'gym',
      startAt: at('19:00', 1),
    });

    await b.join();
    await b.tick.handle(at('21:00'));

    const said = b.said('evening_prompt');
    expect(said).not.toContain('Nothing is scheduled yet');
    expect(said).toContain('Training: Push day (gym) at 19:00');
  });
});

describe('the plan is a snapshot', () => {
  it('keeps the title the member was shown after the meeting is renamed', async () => {
    b.meetings.set(tomorrow(), [
      {
        meetingId: 'm-6',
        title: 'Design review',
        startAt: at('10:00', 1),
        durationMin: 45,
      },
    ]);

    await b.join();
    await b.tick.handle(at('21:00'));
    expect(b.said('evening_prompt')).toContain('• 10:00 Design review (45m)');

    /*
     * The member answers, and only then is the meeting renamed. That ordering
     * is the whole property: an answered plan is a decision, `redraft` refuses
     * to touch one, and the snapshot is what makes "a meeting renamed on
     * Thursday must not rewrite Tuesday's plan" true. Rebuilt from the live
     * query instead, the summary forty minutes later would read the new title
     * back at a member who never saw it.
     */
    const plan = await b.plans.forDate(MEMBER, tomorrow());
    plan!.confirm({ tasks: plan!.tasks, at: at('21:30') });
    await b.uow.run(() => b.plans.save(plan!));

    b.meetings.set(tomorrow(), [
      {
        meetingId: 'm-6',
        title: 'Design review — MOVED, new agenda',
        startAt: at('15:00', 1),
        durationMin: 15,
      },
    ]);

    await b.tick.handle(at('22:00'));

    const summary = b.said('end_of_day_summary');
    expect(summary).toContain('• 10:00 Design review (45m)');
    expect(summary).not.toContain('MOVED');

    const stored = await b.plans.forDate(MEMBER, tomorrow());
    expect(stored?.meetings).toEqual([
      {
        meetingId: 'm-6',
        title: 'Design review',
        startAt: at('10:00', 1),
        durationMin: 45,
      },
    ]);
  });
});
