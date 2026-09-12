import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { KindGuard } from '../../shared/auth/kind.guard.js';
import type { Principal } from '../../shared/auth/principal.js';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, localHhMm, wallClockToUtc } from '../../shared/time/time.js';
import { MEMBER_CHOSEN_LABEL } from './domain/alert.aggregate.js';
import {
  MeetingMembersPort,
  MeetingOccurrencesPort,
  type MeetingOccurrence,
} from './domain/notification.ports.js';
import { PlanAlertsSaga } from './features/plan-alerts-saga/plan-alerts.saga.js';
import { InternalReconcileController } from './features/reconcile-meeting-alerts/internal-reconcile.controller.js';
import {
  MEETING_ALERTS_JOB,
  PREP_LABEL,
  ReconcileMeetingAlertsHandler,
  offsetLabel,
} from './features/reconcile-meeting-alerts/reconcile-meeting-alerts.handler.js';
import { InMemoryAlertRepository } from './infrastructure/in-memory-alert.repository.js';

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';

const DAY_MS = 86_400_000;

class StubMemberContext extends MemberContextPort {
  timezone = CAIRO;
  leadTimes = ['1h', '0m'];
  quietHours = { from: '22:00', to: '07:00' };

  async clock(): Promise<MemberClock> {
    return { timezone: this.timezone };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: this.leadTimes, quietHours: this.quietHours };
  }
}

/**
 * A meeting as this spec describes one: a wall-clock time, the local days it
 * falls on, and the two exception lists a recurrence carries.
 *
 * Days are **offsets from today**, never dates. A fixture pinned to a real date
 * is a time bomb — the alert window is a fortnight from now, so a literal date
 * passes until the clock reaches it and then silently expands to nothing.
 */
interface FixtureMeeting {
  meetingId: string;
  title: string;
  /** The wall clock the member typed, e.g. '14:00'. */
  at: string;
  /** Local days it falls on, as offsets from today. */
  dayOffsets: number[];
  prepMinutes: number;
  reminderOffsets: number[];
  /** The zone the series is pinned to, or null to follow the member (FR-007). */
  lockTimezone: string | null;
  /** Days dropped from the series: `exdates`. */
  skipped: number[];
  /** Day offset → minutes the occurrence was dragged by: an override. */
  moved: Map<number, number>;
}

function meeting(patch: Partial<FixtureMeeting> = {}): FixtureMeeting {
  return {
    meetingId: 'meeting-1',
    title: 'Standup',
    at: '14:00',
    dayOffsets: [1, 2, 3],
    prepMinutes: 0,
    reminderOffsets: [60, 0],
    lockTimezone: null,
    skipped: [],
    moved: new Map(),
    ...patch,
  };
}

/**
 * Stands in for Meetings' `MeetingOccurrencesQueryHandler`, and expands the
 * same way it does: **wall time**, in `lockTimezone ?? the member's zone`.
 *
 * That is the one behaviour this stub has to get right, because it is the whole
 * of FR-014. A stub that returned fixed instants would make the time-zone case
 * pass while proving nothing — the member moving is precisely the thing that
 * changes which instants an unpinned series falls on, and a pinned one not
 * changing is what the flag is for.
 */
class StubOccurrences extends MeetingOccurrencesPort {
  meetings: FixtureMeeting[] = [];
  calls = 0;

  constructor(private readonly member: StubMemberContext) {
    super();
  }

  async forMember(
    _userId: string,
    from: Date,
    to: Date,
  ): Promise<MeetingOccurrence[]> {
    this.calls += 1;
    const found: MeetingOccurrence[] = [];

    for (const fixture of this.meetings) {
      const zone = fixture.lockTimezone ?? this.member.timezone;

      for (const dayOffset of fixture.dayOffsets) {
        if (fixture.skipped.includes(dayOffset)) continue;

        const date = localDate(new Date(Date.now() + dayOffset * DAY_MS), zone);
        const originalStart = wallClockToUtc(`${date}T${fixture.at}`, zone);
        if (!originalStart) continue;

        const drag = fixture.moved.get(dayOffset) ?? 0;
        const startAt = new Date(originalStart.getTime() + drag * 60_000);
        if (startAt < from || startAt >= to) continue;

        found.push({
          meetingId: fixture.meetingId,
          title: fixture.title,
          originalStart,
          startAt,
          durationMin: 30,
          prepMinutes: fixture.prepMinutes,
          reminderOffsets: [...fixture.reminderOffsets],
        });
      }
    }

    return found.sort(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
  }
}

class StubMeetingMembers extends MeetingMembersPort {
  userIds: string[] = [MEMBER];

  async withMeetings(): Promise<string[]> {
    return this.userIds;
  }
}

function event(
  name: string,
  payload: Record<string, unknown>,
  userId: string | undefined = MEMBER,
): DomainEvent {
  return {
    eventId: newId(),
    name,
    context: name.split('.')[0]!,
    aggregate: { type: 'meeting', id: 'meeting-1' },
    userId,
    occurredAt: new Date(),
    payload,
    schemaVersion: 1,
  };
}

interface Bench {
  uow: InMemoryUnitOfWork;
  alerts: InMemoryAlertRepository;
  member: StubMemberContext;
  occurrences: StubOccurrences;
  members: StubMeetingMembers;
  settings: SettingsService;
  heartbeats: HeartbeatService;
  stamp: ReturnType<typeof vi.fn>;
  reconcile: ReconcileMeetingAlertsHandler;
  saga: PlanAlertsSaga;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const alerts = new InMemoryAlertRepository(uow);
  const member = new StubMemberContext();
  const occurrences = new StubOccurrences(member);
  const members = new StubMeetingMembers();
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const stamp = vi.fn(async () => undefined);
  const heartbeats = { stamp } as unknown as HeartbeatService;

  const reconcile = new ReconcileMeetingAlertsHandler(
    uow,
    alerts,
    member,
    occurrences,
    members,
    settings,
    heartbeats,
    () => alerts.nextId(),
  );

  return {
    uow,
    alerts,
    member,
    occurrences,
    members,
    settings,
    heartbeats,
    stamp,
    reconcile,
    saga: new PlanAlertsSaga(
      uow,
      alerts,
      member,
      () => alerts.nextId(),
      reconcile,
    ),
  };
}

/** Every alert planned for a meeting, whatever its occurrence. */
async function alertsFor(b: Bench, meetingId = 'meeting-1') {
  const rows = await b.alerts.pendingForSource(MEMBER, {
    kind: 'meeting',
    id: meetingId,
  });
  return rows.sort(
    (left, right) => left.notifyAt.getTime() - right.notifyAt.getTime(),
  );
}

/** `occurrenceAt|label` for every alert, which is what the reconcile keys on. */
async function keysFor(b: Bench, meetingId = 'meeting-1') {
  return (await alertsFor(b, meetingId))
    .map(
      (alert) =>
        `${alert.source.occurrenceAt?.toISOString() ?? 'once'}|${alert.label}`,
    )
    .sort();
}

/**
 * The instant the *rule* produces for the default fixture on a given day —
 * which is the occurrence key an event carries and an alert records.
 *
 * Computed the same way the stub computes it rather than written down, so the
 * suite cannot drift onto a literal date or a fixed offset from UTC.
 */
function originalStartOn(dayOffset: number, at = '14:00', zone = CAIRO): Date {
  const date = localDate(new Date(Date.now() + dayOffset * DAY_MS), zone);
  return wallClockToUtc(`${date}T${at}`, zone)!;
}

const scheduled = (fixture: FixtureMeeting) =>
  event('meetings.MeetingScheduled', {
    meetingId: fixture.meetingId,
    title: fixture.title,
    startAt: new Date(),
    durationMin: 30,
    rrule: 'FREQ=DAILY',
    lockTimezone: fixture.lockTimezone,
    reminderOffsets: fixture.reminderOffsets,
    prepMinutes: fixture.prepMinutes,
    status: 'scheduled',
  });

describe('a reminder offset in the lead-time vocabulary', () => {
  it('reads zero minutes as the moment the member chose', () => {
    /*
     * The reason this mapping is not a private detail. Zero minutes before the
     * meeting *is* the meeting, so it must carry `0m` — `MEMBER_CHOSEN_LABEL` —
     * and inherit the rule that a moment the member picked is never moved. A
     * bespoke label would have made a 23:00 call's own notification a derived
     * warning and held it until seven the next morning.
     */
    expect(offsetLabel(0)).toBe(MEMBER_CHOSEN_LABEL);
  });

  it('reads the rest as the durations the settings registry already validates', () => {
    expect(offsetLabel(30)).toBe('30m');
    expect(offsetLabel(60)).toBe('1h');
    expect(offsetLabel(90)).toBe('90m');
    expect(offsetLabel(1440)).toBe('1d');
    expect(offsetLabel(2880)).toBe('2d');
  });

  it('cannot collide with the preparation label', () => {
    // A property rather than a hope: every offset label begins with a digit, so
    // the reconcile's `(occurrence, label)` key can never confuse the two. If
    // it could, one of the member's two warnings would vanish silently.
    for (const minutes of [0, 1, 30, 60, 90, 1440, 10_080]) {
      expect(offsetLabel(minutes)).not.toBe(PREP_LABEL);
    }
    expect(/^\d/.test(PREP_LABEL)).toBe(false);
  });
});

describe('planning a recurring meeting', () => {
  let b: Bench;

  beforeEach(() => {
    b = bench();
  });

  it('plans one alert per offset per occurrence, plus a preparation alert', async () => {
    const fixture = meeting({
      dayOffsets: [1, 2, 3],
      reminderOffsets: [60, 0],
      prepMinutes: 30,
    });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));

    const rows = await alertsFor(b);
    // Three occurrences × (two offsets + one preparation block).
    expect(rows).toHaveLength(9);

    const occurrenceAts = new Set(
      rows.map((row) => row.source.occurrenceAt?.toISOString()),
    );
    expect(occurrenceAts.size).toBe(3);

    for (const occurrenceAt of occurrenceAts) {
      const forOne = rows.filter(
        (row) => row.source.occurrenceAt?.toISOString() === occurrenceAt,
      );
      expect(forOne.map((row) => row.label).sort()).toEqual([
        MEMBER_CHOSEN_LABEL,
        '1h',
        PREP_LABEL,
      ]);
    }
  });

  it('counts each occurrence back from where it actually sits', async () => {
    const fixture = meeting({
      dayOffsets: [1],
      reminderOffsets: [60],
      prepMinutes: 45,
    });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));

    const [occurrence] = await b.occurrences.forMember(
      MEMBER,
      new Date(0),
      new Date(Date.now() + 30 * DAY_MS),
    );
    const rows = await alertsFor(b);
    const warning = rows.find((row) => row.label === '1h')!;
    const prep = rows.find((row) => row.label === PREP_LABEL)!;

    expect(warning.notifyAt.getTime()).toBe(
      occurrence!.startAt.getTime() - 60 * 60_000,
    );
    expect(prep.notifyAt.getTime()).toBe(
      occurrence!.startAt.getTime() - 45 * 60_000,
    );
    // The preparation alert says what it is for; the offsets carry the
    // meeting's own name.
    expect(prep.title).toBe('Prepare: Standup');
    expect(warning.title).toBe('Standup');
    // The meeting, never the date: the client resolves which occurrence this is
    // from `source.occurrenceAt`.
    expect(warning.deepLink).toBe('botvy://meetings/meeting-1');
  });

  it('plans no alert when the meeting asks for none', async () => {
    const fixture = meeting({ reminderOffsets: [], prepMinutes: 0 });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));

    expect(await alertsFor(b)).toHaveLength(0);
  });

  it('records the rule’s moment as the occurrence key, not the moved one', async () => {
    /*
     * `source.occurrenceAt` is the occurrence's `originalStart` — the moment the
     * rule produced, which is also the override key on the meeting. That is what
     * gives a dragged occurrence a stable identity, and it is why the move case
     * below moves the alert it already holds rather than deleting one and
     * planning another.
     */
    const fixture = meeting({
      dayOffsets: [1],
      reminderOffsets: [0],
      moved: new Map([[1, 90]]),
    });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));

    const [alert] = await alertsFor(b);
    const [occurrence] = await b.occurrences.forMember(
      MEMBER,
      new Date(0),
      new Date(Date.now() + 30 * DAY_MS),
    );

    expect(alert!.source.occurrenceAt?.getTime()).toBe(
      occurrence!.originalStart.getTime(),
    );
    expect(alert!.notifyAt.getTime()).toBe(occurrence!.startAt.getTime());
    expect(occurrence!.startAt.getTime()).not.toBe(
      occurrence!.originalStart.getTime(),
    );
  });

  it('keeps every occurrence’s warnings apart under one meeting id', async () => {
    /*
     * The reason this branch has a reconcile of its own. P2's is one desired set
     * per `(source.kind, source.id)` keyed by label — exact for a task, which
     * has one moment. A recurring meeting is one id with many moments, so
     * keying by label alone would have occurrence two's `1h` warning overwrite
     * occurrence one's, and a member with a daily standup would get exactly one
     * reminder for the whole fortnight.
     */
    const fixture = meeting({ dayOffsets: [1, 2, 3], reminderOffsets: [60] });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));

    const rows = await alertsFor(b);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.label))).toEqual(new Set(['1h']));
    expect(
      new Set(rows.map((row) => row.notifyAt.getTime())).size,
    ).toBe(3);
  });

  it('never plans a warning whose moment has already passed', async () => {
    /*
     * A `1d` warning about a meeting tomorrow afternoon is due some hours ago.
     * Planning it would be worse than pointless: the nightly pass cannot see a
     * *sent* alert, so it would plan a fresh copy of the same warning every
     * night until the meeting arrived and the member would be told about one
     * meeting over and over.
     */
    // Two days before an occurrence tomorrow is yesterday, whatever the hour
    // the suite runs at; one hour before it is always still ahead.
    const fixture = meeting({ dayOffsets: [1], reminderOffsets: [2880, 60] });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));

    const rows = await alertsFor(b);
    expect(rows.map((row) => row.label)).toEqual(['1h']);
  });

  it('holds a derived warning out of the member’s quiet hours and never the meeting’s own moment', async () => {
    // A 07:30 meeting two days out: the hour-ahead warning lands at 06:30,
    // inside 22:00–07:00, and is held to 07:00. The meeting's own moment is the
    // one the member chose and is not touched.
    const fixture = meeting({
      at: '07:30',
      dayOffsets: [2],
      reminderOffsets: [60, 0],
    });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));

    const rows = await alertsFor(b);
    const warning = rows.find((row) => row.label === '1h')!;
    const own = rows.find((row) => row.label === MEMBER_CHOSEN_LABEL)!;

    expect(localHhMm(warning.notifyAt, CAIRO)).toBe('07:00');
    expect(localHhMm(own.notifyAt, CAIRO)).toBe('07:30');
  });
});

describe('running the reconciliation twice', () => {
  it('writes nothing at all the second time', async () => {
    /*
     * Not "arrives at the same count" — writes *nothing*. The relay is
     * at-least-once and the nightly pass runs over the same fortnight every
     * night, so a reconcile that re-planned what it already held would move
     * `plannedAt` on every row every night, which is the field the sweep's
     * device filter compares against: every phone would be told it has never
     * heard of alarms it set days ago.
     */
    const b = bench();
    const fixture = meeting({ prepMinutes: 20 });
    b.occurrences.meetings = [fixture];

    await b.saga.onMeetingChanged(scheduled(fixture));
    const before = await alertsFor(b);
    expect(before.length).toBeGreaterThan(0);

    const save = vi.spyOn(b.alerts, 'save');
    const remove = vi.spyOn(b.alerts, 'remove');

    await b.saga.onMeetingChanged(scheduled(fixture));
    await b.reconcile.handle();

    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    const after = await alertsFor(b);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after.map((row) => row.plannedAt.getTime())).toEqual(
      before.map((row) => row.plannedAt.getTime()),
    );
  });
});

describe('skipping and moving one occurrence', () => {
  let b: Bench;
  let fixture: FixtureMeeting;

  beforeEach(async () => {
    b = bench();
    fixture = meeting({
      dayOffsets: [1, 2, 3],
      reminderOffsets: [60, 0],
      prepMinutes: 15,
    });
    b.occurrences.meetings = [fixture];
    await b.saga.onMeetingChanged(scheduled(fixture));
  });

  it('removes exactly the skipped occurrence’s alerts and leaves the others', async () => {
    const before = await keysFor(b);
    const dropped = originalStartOn(2);

    fixture.skipped = [2];
    await b.saga.onMeetingChanged(
      event('meetings.OccurrenceSkipped', {
        meetingId: fixture.meetingId,
        originalStart: dropped,
      }),
    );

    const after = await keysFor(b);
    // Two offsets and a preparation block, gone with the one date.
    expect(after).toHaveLength(before.length - 3);
    // Every survivor was there before, and none of them belongs to the day the
    // member dropped.
    expect(before).toEqual(expect.arrayContaining(after));
    expect(
      after.some((key) => key.startsWith(dropped.toISOString())),
    ).toBe(false);
    expect(after.filter((key) => key.endsWith('|1h'))).toHaveLength(2);
  });

  it('relocates the moved occurrence’s alerts and leaves the others', async () => {
    const before = await alertsFor(b);
    const originalStart = originalStartOn(2);
    const isMoved = (occurrenceAt: Date | null) =>
      occurrenceAt?.getTime() === originalStart.getTime();

    fixture.moved = new Map([[2, 90]]);
    await b.saga.onMeetingChanged(
      event('meetings.OccurrenceMoved', {
        meetingId: fixture.meetingId,
        originalStart,
        movedTo: new Date(originalStart.getTime() + 90 * 60_000),
      }),
    );

    const after = await alertsFor(b);
    // Relocated, not replaced: the same rows, because the override key is the
    // rule's moment and that has not changed.
    expect(new Set(after.map((row) => row.id))).toEqual(
      new Set(before.map((row) => row.id)),
    );

    for (const row of after) {
      const was = before.find((old) => old.id === row.id)!;
      const shift = row.notifyAt.getTime() - was.notifyAt.getTime();
      expect(shift).toBe(isMoved(row.source.occurrenceAt) ? 90 * 60_000 : 0);
    }
  });
});

describe('a meeting that is over', () => {
  for (const name of [
    'meetings.MeetingCompleted',
    'meetings.MeetingCancelled',
    'meetings.MeetingDeleted',
  ]) {
    it(`clears the pending alerts on ${name}`, async () => {
      const b = bench();
      const fixture = meeting({ prepMinutes: 10 });
      b.occurrences.meetings = [fixture];
      await b.saga.onMeetingChanged(scheduled(fixture));
      expect((await alertsFor(b)).length).toBeGreaterThan(0);

      // A completed meeting drops its warnings exactly as a cancelled one
      // does: a warning about a meeting that has already run is noise either
      // way, and noise a member acts on.
      await b.saga.onMeetingClosed(
        event(name, { meetingId: fixture.meetingId, at: new Date() }),
      );

      expect(await alertsFor(b)).toHaveLength(0);
    });
  }

  it('leaves another meeting’s alerts alone', async () => {
    const b = bench();
    const one = meeting({ meetingId: 'meeting-1' });
    const two = meeting({ meetingId: 'meeting-2', title: 'Review' });
    b.occurrences.meetings = [one, two];

    await b.saga.onMeetingChanged(scheduled(one));
    await b.saga.onMeetingChanged(scheduled(two));

    await b.saga.onMeetingClosed(
      event('meetings.MeetingCancelled', {
        meetingId: 'meeting-1',
        at: new Date(),
      }),
    );

    expect(await alertsFor(b, 'meeting-1')).toHaveLength(0);
    expect((await alertsFor(b, 'meeting-2')).length).toBeGreaterThan(0);
  });
});

describe('a member who flies from Cairo to Berlin (FR-014)', () => {
  const timezoneChanged = () =>
    event('profile.ProfileUpdated', { changed: ['timezone'] });

  it('shifts every future occurrence’s warnings with the member', async () => {
    const b = bench();
    const fixture = meeting({
      at: '14:00',
      dayOffsets: [1, 2, 3],
      reminderOffsets: [60, 0],
    });
    b.occurrences.meetings = [fixture];
    await b.saga.onMeetingChanged(scheduled(fixture));

    const before = await alertsFor(b);
    b.member.timezone = BERLIN;
    await b.saga.onProfileUpdated(timezoneChanged());
    const after = await alertsFor(b);

    expect(after).toHaveLength(before.length);
    // The member's 14:00 routine is at 14:00 wherever they are, so every
    // instant moved. Reading the stored `occurrenceAt` back — which is what the
    // task path does — would have kept the whole fortnight on Cairo's clock.
    for (const row of after) {
      expect(localHhMm(row.source.occurrenceAt!, BERLIN)).toBe('14:00');
    }
    for (const row of after.filter(
      (candidate) => candidate.label === MEMBER_CHOSEN_LABEL,
    )) {
      expect(localHhMm(row.notifyAt, BERLIN)).toBe('14:00');
    }
    for (const row of after.filter((candidate) => candidate.label === '1h')) {
      expect(localHhMm(row.notifyAt, BERLIN)).toBe('13:00');
    }

    /*
     * And they are genuinely different instants, not the same ones relabelled.
     *
     * Compared **per label**, which is not fussiness. Cairo is an hour ahead of
     * Berlin in September, so the Berlin `1h` warning lands on exactly the
     * instant the Cairo `0m` alert used to occupy — a comparison across all
     * labels would find that instant still present and report no movement while
     * every warning had in fact moved. The pair of zones a fixture happens to
     * pick decides whether that false positive fires, which is the worst kind.
     */
    const wasByLabel = new Map<string, Set<number>>();
    for (const row of before) {
      const seen = wasByLabel.get(row.label) ?? new Set<number>();
      seen.add(row.notifyAt.getTime());
      wasByLabel.set(row.label, seen);
    }
    for (const row of after) {
      expect(wasByLabel.get(row.label)?.has(row.notifyAt.getTime())).toBe(false);
    }
  });

  it('leaves a meeting pinned to a place exactly where it was', async () => {
    const b = bench();
    const pinned = meeting({
      meetingId: 'meeting-pinned',
      title: 'Cairo board call',
      at: '14:00',
      lockTimezone: CAIRO,
      reminderOffsets: [60],
    });
    b.occurrences.meetings = [pinned];
    await b.saga.onMeetingChanged(scheduled(pinned));

    const before = await alertsFor(b, 'meeting-pinned');
    const save = vi.spyOn(b.alerts, 'save');
    const remove = vi.spyOn(b.alerts, 'remove');

    b.member.timezone = BERLIN;
    await b.saga.onProfileUpdated(timezoneChanged());

    const after = await alertsFor(b, 'meeting-pinned');
    expect(after.map((row) => row.notifyAt.getTime())).toEqual(
      before.map((row) => row.notifyAt.getTime()),
    );
    // The whole point of the flag: the reconcile finds nothing to change, so it
    // writes nothing at all.
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    for (const row of after) {
      expect(localHhMm(row.source.occurrenceAt!, CAIRO)).toBe('14:00');
    }
  });

  it('plans nothing when the patch changed only the display name', async () => {
    const b = bench();
    const fixture = meeting();
    b.occurrences.meetings = [fixture];
    await b.saga.onMeetingChanged(scheduled(fixture));

    b.occurrences.calls = 0;
    const save = vi.spyOn(b.alerts, 'save');
    const remove = vi.spyOn(b.alerts, 'remove');

    await b.saga.onProfileUpdated(
      event('profile.ProfileUpdated', { changed: ['displayName'] }),
    );

    // Not even a read. The event carries one `changed` list for the whole
    // patch, and a member editing their name must not cost a re-plan of their
    // fortnight.
    expect(b.occurrences.calls).toBe(0);
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('the nightly pass', () => {
  it('advances the window for every member with a diary and stamps its heartbeat', async () => {
    const b = bench();
    b.members.userIds = [MEMBER];
    b.occurrences.meetings = [
      meeting({ meetingId: 'meeting-1', reminderOffsets: [60] }),
      meeting({ meetingId: 'meeting-2', title: 'Review', prepMinutes: 30 }),
    ];

    const result = await b.reconcile.handle();

    expect(result.members).toBe(1);
    expect(result.meetings).toBe(2);
    expect(result.planned).toBeGreaterThan(0);
    expect(result.removed).toBe(0);
    expect(result.ms).toBeGreaterThanOrEqual(0);

    // A scheduled job that stops arriving has to be visible; `/health` reports
    // this key stale after fifteen minutes.
    expect(b.stamp).toHaveBeenCalledWith(
      MEETING_ALERTS_JOB,
      true,
      undefined,
      expect.any(Number),
    );
  });

  it('reads only the window the operator set', async () => {
    const b = bench();
    // Day 20 is outside the default fortnight and day 3 is inside it.
    b.occurrences.meetings = [
      meeting({ dayOffsets: [3, 20], reminderOffsets: [0] }),
    ];

    await b.reconcile.handle();
    expect(await alertsFor(b)).toHaveLength(1);

    await b.settings.setSystem('meetings.alertWindowDays', 30);
    await b.reconcile.handle();
    expect(await alertsFor(b)).toHaveLength(2);
  });

  it('logs and skips a member whose expansion fails, and still stamps', async () => {
    /*
     * The same call the rhythm tick makes, for the same reason: one member with
     * a rule the expander chokes on must not stop the window advancing for
     * everybody else. The counters are incremented as each member returns, so
     * the failing one leaves them short.
     */
    const b = bench();
    b.members.userIds = ['broken', MEMBER];
    b.occurrences.meetings = [meeting({ reminderOffsets: [0] })];

    const real = b.occurrences.forMember.bind(b.occurrences);
    vi.spyOn(b.occurrences, 'forMember').mockImplementation(
      async (userId, from, to) => {
        if (userId === 'broken') throw new Error('unreadable rule');
        return real(userId, from, to);
      },
    );

    const result = await b.reconcile.handle();

    expect(result.members).toBe(2);
    expect(result.meetings).toBe(1);
    expect(b.stamp).toHaveBeenCalledWith(
      MEETING_ALERTS_JOB,
      true,
      undefined,
      expect.any(Number),
    );
  });

  it('stamps a failure when the whole pass cannot run', async () => {
    const b = bench();
    vi.spyOn(b.members, 'withMeetings').mockRejectedValue(
      new Error('mongo is down'),
    );

    await expect(b.reconcile.handle()).rejects.toThrow('mongo is down');
    expect(b.stamp).toHaveBeenCalledWith(
      MEETING_ALERTS_JOB,
      false,
      'mongo is down',
      expect.any(Number),
    );
  });
});

describe('the internal reconcile endpoint', () => {
  /**
   * Driven through the real `KindGuard` against the real decorators on the real
   * controller, so the assertion is about this route and not about a copy of
   * its metadata. A member reaching a job endpoint would be acting with the
   * trust that endpoint assumes of its caller.
   */
  function guardFor(principal: Principal | undefined) {
    const context = {
      getType: () => 'http',
      getHandler: () => InternalReconcileController.prototype.run,
      getClass: () => InternalReconcileController,
      switchToHttp: () => ({ getRequest: () => ({ principal }) }),
    } as unknown as ExecutionContext;
    return () => new KindGuard(new Reflector()).canActivate(context);
  }

  const service = (scopes: string[]): Principal => ({
    kind: 'service',
    id: 'n8n',
    name: 'n8n',
    scopes,
  });

  it('refuses a member’s JWT whatever their role', () => {
    expect(
      guardFor({ kind: 'user', id: MEMBER, role: 'admin' }),
    ).toThrow(/member token is not one/);
  });

  it('refuses a service token that does not hold internal:tick', () => {
    // A service token is not a master key: the sweep's credential must not also
    // be able to re-plan everybody's diary.
    expect(guardFor(service(['internal:sweep']))).toThrow(
      /missing scope: internal:tick/,
    );
  });

  it('admits the scope the unattended passes hold', () => {
    expect(guardFor(service(['internal:tick']))()).toBe(true);
  });

  it('hands n8n the counts rather than an acknowledgement', async () => {
    const b = bench();
    b.occurrences.meetings = [meeting({ reminderOffsets: [0] })];

    const body = await new InternalReconcileController(b.reconcile).run();

    expect(Object.keys(body).sort()).toEqual([
      'meetings',
      'members',
      'ms',
      'planned',
      'removed',
    ]);
    expect(body.planned).toBeGreaterThan(0);
  });
});
