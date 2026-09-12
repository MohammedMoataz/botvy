import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { PlanAlertsSaga } from './features/plan-alerts-saga/plan-alerts.saga.js';
import { InMemoryAlertRepository } from './infrastructure/in-memory-alert.repository.js';

/**
 * T623 — a training session's reminders (FR-014).
 *
 * Its own file rather than a `describe` in `notifications.spec.ts`, because the
 * bench there wires the sweep, the push transport, the device ports and the
 * purge counters, and none of that is what this branch is about: the branch is
 * four dependencies and two event names. The one thing that would justify
 * sharing the bench — asserting the sweep delivers a session alert — is already
 * covered there for every kind, since the sweep never reads `source.kind`.
 *
 * ## Every instant is relative to `Date.now()`
 *
 * A fixture pinned to a real date is a time bomb here specifically: `desiredFor`
 * drops a lead time whose moment has already passed, so a session written with a
 * literal date starts producing one alert instead of two the day the clock
 * reaches it.
 *
 * ## And every session is at 18:00, days out, for a second reason
 *
 * "In five hours" is a relative offset that lands wherever the machine's clock
 * happens to be, and a derived warning that lands inside the member's quiet
 * window is **held until the window ends** — which is `sendAt` doing exactly its
 * job, and which reorders the set so that a `1h` warning sits after the `0m`
 * moment it was counted back from. That is worth a spec of its own and it is not
 * this branch's; asserting it here would make these cases pass or fail on the
 * hour the suite was run. So the fixture puts the session at a wall clock that
 * is awake in the member's own zone, with room for a `1d` lead time in front of
 * it.
 */

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';

/**
 * "That wall clock, n of the member's own calendar days from today."
 *
 * Anchored on today's local noon rather than on `Date.now()` directly, so
 * adding days cannot cross a midnight or a daylight-saving boundary and land on
 * the wrong date.
 */
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

class StubMemberContext extends MemberContextPort {
  leadTimes = ['1h', '0m'];
  quietHours = { from: '22:00', to: '07:00' };

  async clock(): Promise<MemberClock> {
    return { timezone: CAIRO };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: this.leadTimes, quietHours: this.quietHours };
  }
}

/**
 * A `training.*` event, built the way `Session.alertFacts()` builds its payload.
 *
 * The helper takes the *whole* fact set rather than defaulting the fields,
 * because the defect this shape exists to prevent is a payload missing a field
 * the consumer reads — P2's task events omitted `title` and every task
 * notification in the product said "Task due". A helper that quietly filled in
 * a title would hide exactly that.
 */
function scheduled(
  name: 'training.SessionScheduled' | 'training.SessionRescheduled',
  facts: {
    sessionId: string;
    plannedAt: Date;
    durationMin: number;
    sport: string;
    title: string;
    focus: string | null;
    status: string;
  },
  userId = MEMBER,
): DomainEvent {
  return event(name, facts, userId);
}

function event(
  name: string,
  payload: Record<string, unknown>,
  userId = MEMBER,
): DomainEvent {
  return {
    eventId: newId(),
    name,
    context: name.split('.')[0]!,
    aggregate: { type: 'session', id: String(payload.sessionId ?? 'x') },
    userId,
    occurredAt: new Date(),
    payload,
    schemaVersion: 1,
  };
}

interface Bench {
  alerts: InMemoryAlertRepository;
  member: StubMemberContext;
  saga: PlanAlertsSaga;
  pending(userId?: string): Promise<
    Array<{ label: string; notifyAt: Date; title: string; deepLink: string }>
  >;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const alerts = new InMemoryAlertRepository(uow);
  const member = new StubMemberContext();
  return {
    alerts,
    member,
    // Four dependencies and no meetings reconciler, which is the shape the
    // saga's own comment promises a non-meetings spec can bind.
    saga: new PlanAlertsSaga(uow, alerts, member, () => alerts.nextId()),
    async pending(userId = MEMBER) {
      const rows = await alerts.pendingForMember(userId, new Date(0));
      return [...rows].sort(
        (a, b) => a.notifyAt.getTime() - b.notifyAt.getTime(),
      );
    },
  };
}

let b: Bench;
beforeEach(() => {
  b = bench();
});

const FACTS = {
  sessionId: 'session-1',
  plannedAt: at('18:00', 3),
  durationMin: 60,
  sport: 'gym',
  title: 'Upper body',
  focus: 'bench',
  status: 'planned',
};

describe('a scheduled session is reminded at the member’s own lead times', () => {
  it('plans one alert per lead time, at the session’s moment counted back', async () => {
    const plannedAt = at('18:00', 3);
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', { ...FACTS, plannedAt }),
    );

    const pending = await b.pending();
    expect(pending.map((row) => row.label)).toEqual(['1h', '0m']);
    expect(pending[1]!.notifyAt.getTime()).toBe(plannedAt.getTime());
    expect(pending[0]!.notifyAt.getTime()).toBe(
      plannedAt.getTime() - 60 * 60_000,
    );
  });

  it('names the session in the banner and links to it', async () => {
    /*
     * The assertion P2 did not have. `title` and the deep link both come off
     * the payload, so this fails if `Session.alertFacts()` ever stops carrying
     * the title — where an assertion about the *fallback's* behaviour would
     * pass with "Training" in every banner in the product.
     */
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', FACTS),
    );

    const pending = await b.pending();
    expect(pending.every((row) => row.title === 'Upper body')).toBe(true);
    expect(pending[0]!.deepLink).toBe('botvy://sessions/session-1');
  });

  it('is always timed, so a session never collapses to a single alert', async () => {
    /*
     * There is no all-day session — `plannedAt` is a moment and `durationMin`
     * is required — so the absence of `allDay` from the payload must not read
     * as `allDay !== false`, which is the exact shape of P2's second defect:
     * `TaskRescheduled` omitted the field and every edit dropped the member's
     * lead times.
     */
    b.member.leadTimes = ['1d', '2h', '30m', '0m'];
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', {
        ...FACTS,
        plannedAt: at('18:00', 3),
      }),
    );

    expect((await b.pending()).map((row) => row.label)).toEqual([
      '1d',
      '2h',
      '30m',
      '0m',
    ]);
  });

  it('moves the set rather than appending when the session is rescheduled', async () => {
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', FACTS),
    );
    const moved = at('19:30', 4);
    await b.saga.onSessionScheduled(
      scheduled('training.SessionRescheduled', {
        ...FACTS,
        plannedAt: moved,
        title: 'Lower body',
      }),
    );

    const pending = await b.pending();
    expect(pending).toHaveLength(2);
    expect(pending[1]!.notifyAt.getTime()).toBe(moved.getTime());
    expect(pending[1]!.title).toBe('Lower body');
  });

  it('writes nothing on a redelivered event', async () => {
    // The relay is at-least-once. Two deliveries of one event must not be two
    // reminders about one session.
    const raised = scheduled('training.SessionScheduled', FACTS);
    await b.saga.onSessionScheduled(raised);
    await b.saga.onSessionScheduled(raised);

    expect(await b.pending()).toHaveLength(2);
  });

  it('keeps one member’s session out of another’s pending set', async () => {
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', FACTS, OTHER),
    );

    expect(await b.pending(MEMBER)).toHaveLength(0);
    expect(await b.pending(OTHER)).toHaveLength(2);
  });
});

describe('a session dealt with stops reminding (FR-014)', () => {
  beforeEach(async () => {
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', FACTS),
    );
    expect(await b.pending()).toHaveLength(2);
  });

  for (const name of [
    'training.SessionCompleted',
    'training.SessionCancelled',
    'training.SessionSkipped',
    /*
     * The fourth name, and the one the task says to confirm against the
     * materialiser: a slot the member removes takes its future sessions with
     * it, and the materialiser removes those by tombstoning them — which raises
     * `SessionDeleted` and nothing else. Without this name in the branch, a
     * deleted Friday slot keeps every Friday alarm out to the horizon.
     */
    'training.SessionDeleted',
  ]) {
    it(`${name} clears the unsent ones`, async () => {
      await b.saga.onSessionClosed(
        event(name, { sessionId: 'session-1', at: new Date() }),
      );

      expect(await b.pending()).toHaveLength(0);
    });
  }

  it('leaves another session’s reminders alone', async () => {
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', {
        ...FACTS,
        sessionId: 'session-2',
      }),
    );

    await b.saga.onSessionClosed(
      event('training.SessionCompleted', {
        sessionId: 'session-1',
        at: new Date(),
      }),
    );

    const pending = await b.pending();
    expect(pending).toHaveLength(2);
    expect(
      (await b.alerts.pendingForSource(MEMBER, {
        kind: 'session',
        id: 'session-2',
      })).length,
    ).toBe(2);
  });

  it('drops the reminders when a restore re-announces a cancelled session', async () => {
    /*
     * `Session.restore()` re-raises `SessionScheduled` with the status the row
     * already had, and `edit()` does the same on `SessionRescheduled`. So the
     * scheduling branch has to read the status, or restoring a cancelled
     * session — or renaming a completed one — resurrects alarms FR-014 says
     * must be gone.
     */
    await b.saga.onSessionClosed(
      event('training.SessionCancelled', {
        sessionId: 'session-1',
        at: new Date(),
      }),
    );

    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', {
        ...FACTS,
        status: 'cancelled',
      }),
    );

    expect(await b.pending()).toHaveLength(0);
  });

  it('reminds again when the member reopens the session', async () => {
    // `reopen()` sets `planned` before it announces, so the same branch that
    // refuses a cancelled restore has to accept this one.
    await b.saga.onSessionClosed(
      event('training.SessionSkipped', {
        sessionId: 'session-1',
        at: new Date(),
      }),
    );
    await b.saga.onSessionScheduled(
      scheduled('training.SessionScheduled', FACTS),
    );

    expect(await b.pending()).toHaveLength(2);
  });
});
