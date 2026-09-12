import { beforeEach, describe, expect, it } from 'vitest';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import {
  AthleteProfile,
  type TrainingSlot,
} from './domain/athlete-profile.aggregate.js';
import { Session } from './domain/session.aggregate.js';
import {
  AthleteProfileRepository,
  SessionRepository,
} from './domain/training.repositories.js';
import { TrainingSummaryQueryHandler } from './features/training-summary/training-summary.query.js';

/**
 * T661 — what the coach knows about the training week (FR-017).
 *
 * The requirement is three facts in one line: the sports, the session that is
 * next, and how consistently they have been training. The case that matters
 * most is the *empty* one — a member with no slots must yield a line saying so
 * rather than nothing, because the coach's whole prompt is about training and
 * silence about the week reads to a model as an omission rather than as an
 * absence.
 *
 * ## Fakes rather than the in-memory adapters
 *
 * The context's in-memory adapters are being written in the same phase and this
 * query needs two of their methods. The fakes here are the whole of what it
 * reads, which also makes the read surface visible: two methods on the session
 * port and one on the profile port, and no collection scan.
 *
 * Every instant is built relative to `Date.now()` in a fixed zone. A fixture
 * pinned to a real date starts failing the day the clock reaches it, and this
 * query compares "next" and "recent" against a clock.
 */

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';

/** "That wall clock, n of the member's own calendar days from today." */
function at(hhmm: string, dayOffset: number): Date {
  const noon = wallClockToUtc(`${localDate(new Date(), CAIRO)}T12:00`, CAIRO);
  if (!noon) throw new Error(`could not resolve noon in ${CAIRO}`);
  const date = localDate(
    new Date(noon.getTime() + dayOffset * 86_400_000),
    CAIRO,
  );
  const instant = wallClockToUtc(`${date}T${hhmm}`, CAIRO);
  if (!instant) throw new Error(`could not resolve ${date}T${hhmm} in ${CAIRO}`);
  return instant;
}

function slot(id: string, weekday: number, sport: string): TrainingSlot {
  return {
    id,
    weekday,
    start: '18:00',
    durationMin: 60,
    sport,
    location: null,
  };
}

function session(input: {
  id: string;
  plannedAt: Date;
  sport?: string;
  title?: string;
  focus?: string | null;
  durationMin?: number;
}): Session {
  return Session.plan({
    id: input.id,
    userId: MEMBER,
    plannedAt: input.plannedAt,
    durationMin: input.durationMin ?? 60,
    sport: input.sport ?? 'gym',
    title: input.title ?? 'Upper body',
    focus: input.focus ?? null,
    programId: null,
    weekIndex: null,
    slotId: 's-1',
    suggestionId: null,
    exercises: [],
    notes: null,
    createdAt: new Date(),
  });
}

class FakeProfiles extends AthleteProfileRepository {
  row: AthleteProfile | null = null;

  async find(userId: string): Promise<AthleteProfile | null> {
    return this.row && this.row.userId === userId ? this.row : null;
  }

  async memberIdsWithSlots(): Promise<string[]> {
    return this.row?.hasWeek ? [this.row.userId] : [];
  }

  async removeAllFor(): Promise<number> {
    throw new Error('not used by this query');
  }

  async findById(): Promise<AthleteProfile | null> {
    throw new Error('not used by this query');
  }

  async save(): Promise<void> {
    throw new Error('not used by this query');
  }

  async remove(): Promise<void> {
    throw new Error('not used by this query');
  }
}

/**
 * The two reads the summary makes, with the semantics their ports promise.
 *
 * `plannedAfter` is soonest-first and `planned` only; `recentByStatus` is
 * **most recent first** and every status, because a run of completed sessions
 * has to be able to end. Getting either order wrong here would hide the same
 * bug in the query, so both are implemented from the port's own comment rather
 * than from whatever the assertions happen to need — and both record what they
 * were asked, so a query that reached for the wrong window would show up.
 */
class FakeSessions extends SessionRepository {
  rows: Session[] = [];
  readonly asked: Array<{ method: string; instant: Date }> = [];

  async plannedAfter(
    userId: string,
    after: Date,
    limit: number,
  ): Promise<Session[]> {
    this.asked.push({ method: 'plannedAfter', instant: after });
    return this.rows
      .filter(
        (row) =>
          row.userId === userId &&
          !row.isDeleted &&
          row.status === 'planned' &&
          row.plannedAt.getTime() > after.getTime(),
      )
      .sort((a, b) => a.plannedAt.getTime() - b.plannedAt.getTime())
      .slice(0, limit);
  }

  async recentByStatus(
    userId: string,
    before: Date,
    limit: number,
  ): Promise<Session[]> {
    this.asked.push({ method: 'recentByStatus', instant: before });
    return this.rows
      .filter(
        (row) =>
          row.userId === userId &&
          !row.isDeleted &&
          row.plannedAt.getTime() < before.getTime(),
      )
      .sort((a, b) => b.plannedAt.getTime() - a.plannedAt.getTime())
      .slice(0, limit);
  }

  async between(): Promise<Session[]> {
    throw new Error('not used by this query');
  }

  async findMany(): Promise<Session[]> {
    throw new Error('not used by this query');
  }

  async orphanedPlanned(): Promise<Session[]> {
    throw new Error('not used by this query');
  }

  async futurePlanned(): Promise<Session[]> {
    throw new Error('not used by this query');
  }

  async purgeTombstonesBefore(): Promise<number> {
    throw new Error('not used by this query');
  }

  async removeAllFor(): Promise<number> {
    throw new Error('not used by this query');
  }

  async pullSince(): Promise<Session[]> {
    throw new Error('not used by this query');
  }

  async findById(): Promise<Session | null> {
    throw new Error('not used by this query');
  }

  async save(): Promise<void> {
    throw new Error('not used by this query');
  }

  async remove(): Promise<void> {
    throw new Error('not used by this query');
  }
}

class StubMemberContext extends MemberContextPort {
  async clock(): Promise<MemberClock> {
    return { timezone: CAIRO };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: [], quietHours: { from: '22:00', to: '07:00' } };
  }
}

let profiles: FakeProfiles;
let sessions: FakeSessions;
let query: TrainingSummaryQueryHandler;

beforeEach(() => {
  profiles = new FakeProfiles();
  sessions = new FakeSessions();
  query = new TrainingSummaryQueryHandler(
    profiles,
    sessions,
    new StubMemberContext(),
  );
});

/** Two sports and a Monday/Thursday week, which is the ordinary member. */
function withWeek(): void {
  const profile = AthleteProfile.empty(MEMBER);
  profile.chooseSports(['gym', 'swimming']);
  profile.setSlots([slot('s-1', 1, 'gym'), slot('s-2', 4, 'swimming')]);
  profiles.row = profile;
}

describe('a member with no training week still gets a line', () => {
  it('says so plainly rather than answering with nothing', async () => {
    /*
     * The case the task names, and the reason it is not simply "return null":
     * the coach's prompt is entirely about training, so an absent training line
     * does not read as "they do not train" — it reads as a gap, and the model
     * fills a gap by assuming. Saying it lets the coach offer to set the week
     * up, which is the useful answer.
     */
    profiles.row = AthleteProfile.empty(MEMBER);

    const line = await query.summary(MEMBER, at('14:00', 0));

    expect(line).toBe(
      'they have not set up any sports or a weekly training schedule yet',
    );
  });

  it('gives the same answer for a member whose profile row does not exist yet', async () => {
    // The bootstrap reacts to `identity.UserRegistered` through the relay,
    // which is eventual, so there is a window with no row at all. It is the
    // same state and it must not be a second branch anybody has to render.
    profiles.row = null;

    expect(await query.summary(MEMBER, at('14:00', 0))).toBe(
      'they have not set up any sports or a weekly training schedule yet',
    );
  });

  it('names the sports of a member who picked them but set no slots', async () => {
    // Half way through onboarding. Telling the coach the sports and that the
    // week is empty is more use than either fact alone.
    const profile = AthleteProfile.empty(MEMBER);
    profile.chooseSports(['padel']);
    profiles.row = profile;

    const line = await query.summary(MEMBER, at('14:00', 0));

    expect(line).toContain('Sports: padel');
    expect(line).toContain('no weekly training slots set yet');
  });
});

describe('the three facts FR-017 asks for', () => {
  beforeEach(withWeek);

  it('names the sports, the next session with its focus, and the streak', async () => {
    const now = at('14:00', 0);
    sessions.rows = [
      session({ id: 'past-1', plannedAt: at('18:00', -3) }),
      session({ id: 'past-2', plannedAt: at('18:00', -1) }),
      session({
        id: 'next-1',
        plannedAt: at('18:00', 2),
        sport: 'swimming',
        title: 'Intervals',
        focus: '8x100m',
        durationMin: 45,
      }),
      session({ id: 'next-2', plannedAt: at('18:00', 5) }),
    ];
    for (const id of ['past-1', 'past-2']) {
      sessions.rows.find((row) => row.id === id)!.complete();
    }

    const line = await query.summary(MEMBER, now);

    expect(line).toContain('Sports: gym, swimming');
    // The *soonest* upcoming session, not the last row in the list, and its
    // focus — which is the field a coach needs to answer "what should I do".
    expect(line).toContain('Intervals (swimming, 45m), focus: 8x100m');
    expect(line).toContain('2 session(s) completed in a row');
    // The wall clock is the member's, not the server's: this is the line that
    // would have shifted every session by three hours in v1.
    expect(line).toContain(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: CAIRO,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(at('18:00', 2)),
    );
    // Both reads are asked about the moment handed in, never `new Date()`.
    expect(sessions.asked.every((row) => row.instant === now)).toBe(true);
  });

  it('omits the focus of a session that has none rather than writing an empty one', async () => {
    sessions.rows = [
      session({ id: 'next-1', plannedAt: at('18:00', 1), focus: null }),
    ];

    const line = await query.summary(MEMBER, at('14:00', 0));

    expect(line).toContain('Upper body (gym, 60m)');
    expect(line).not.toContain('focus');
  });

  it('says there is nothing scheduled next when the week is set but empty ahead', async () => {
    // Story 2 scenario 3, as the coach hears it. Distinct from "no slots" —
    // the member has a timetable and the horizon simply holds nothing yet.
    sessions.rows = [];

    const line = await query.summary(MEMBER, at('14:00', 0));

    expect(line).toContain('Sports: gym, swimming');
    expect(line).toContain('nothing scheduled next');
    expect(line).not.toContain('no weekly training slots');
  });
});

describe('the streak counts sessions and not days', () => {
  beforeEach(withWeek);

  it('counts a run of completed sessions across rest days', async () => {
    /*
     * `recentByStatus`'s own reason for existing. A member who trains three
     * times a week has a streak of three after a week; folding by day would
     * make every rest day a break and report one.
     */
    sessions.rows = [
      session({ id: 'a', plannedAt: at('18:00', -7) }),
      session({ id: 'b', plannedAt: at('18:00', -4) }),
      session({ id: 'c', plannedAt: at('18:00', -2) }),
    ];
    for (const row of sessions.rows) row.complete();

    expect(await query.summary(MEMBER, at('14:00', 0))).toContain(
      '3 session(s) completed in a row',
    );
  });

  it('ends the run at a skipped session, counting only the sessions since', async () => {
    sessions.rows = [
      session({ id: 'a', plannedAt: at('18:00', -9) }),
      session({ id: 'b', plannedAt: at('18:00', -6) }),
      session({ id: 'skipped', plannedAt: at('18:00', -4) }),
      session({ id: 'c', plannedAt: at('18:00', -2) }),
    ];
    for (const row of sessions.rows) row.complete();
    sessions.rows.find((row) => row.id === 'skipped')!.skip();

    expect(await query.summary(MEMBER, at('14:00', 0))).toContain(
      '1 session(s) completed in a row',
    );
  });

  it('ends the run at a missed session, which nothing ever wrote a status for', async () => {
    /*
     * FR-018: `missed` is a reading of the clock and is never stored, so the
     * row is still `planned` and in the past. A streak that only broke on an
     * explicit `skipped` would count straight through every session the member
     * silently did not do — which is the one thing "how consistently have they
     * been training" must not do.
     */
    sessions.rows = [
      session({ id: 'a', plannedAt: at('18:00', -8) }),
      session({ id: 'missed', plannedAt: at('18:00', -5) }),
      session({ id: 'b', plannedAt: at('18:00', -3) }),
    ];
    sessions.rows.find((row) => row.id === 'a')!.complete();
    sessions.rows.find((row) => row.id === 'b')!.complete();

    expect(await query.summary(MEMBER, at('14:00', 0))).toContain(
      '1 session(s) completed in a row',
    );
  });

  it('says so when the most recent session was not completed', async () => {
    // Zero is a fact and it is stated, for the same reason the check-in streak
    // is stated at zero: the coach is under instructions not to scold a missed
    // session, and an absent line leaves the model to infer one.
    sessions.rows = [session({ id: 'a', plannedAt: at('18:00', -2) })];
    sessions.rows[0]!.skip();

    expect(await query.summary(MEMBER, at('14:00', 0))).toContain(
      'no completed sessions in a row right now',
    );
  });
});
