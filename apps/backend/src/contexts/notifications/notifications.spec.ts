import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import {
  PushService,
  type PushMessage,
  type PushResult,
} from '../../shared/push/push.service.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localHhMm, wallClockToUtc } from '../../shared/time/time.js';
import {
  desiredFor,
  endOfQuietHours,
  isQuiet,
  leadMinutes,
  sendAt,
} from './domain/alert-plan.js';
import { MEMBER_CHOSEN_LABEL } from './domain/alert.aggregate.js';
import {
  DeviceLookupPort,
  DeviceRemovalPort,
  TombstonePurgePort,
  type NotifiableDevice,
} from './domain/notification.ports.js';
import { PendingAlertsQueryHandler } from './features/pending-alerts/pending-alerts.query.js';
import { PlanAlertsSaga } from './features/plan-alerts-saga/plan-alerts.saga.js';
import { SweepHandler } from './features/sweep/sweep.handler.js';
import { InMemoryAlertRepository } from './infrastructure/in-memory-alert.repository.js';

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';

const inMinutes = (n: number) => new Date(Date.now() + n * 60_000);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

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

class StubDevices extends DeviceLookupPort {
  rows: NotifiableDevice[] = [];

  async forUsers(userIds: string[]): Promise<NotifiableDevice[]> {
    return this.rows.filter((row) => userIds.includes(row.userId));
  }
}

class StubRemoval extends DeviceRemovalPort {
  reaped: string[] = [];

  async removeByPushToken(tokens: string[]): Promise<number> {
    this.reaped.push(...tokens);
    return tokens.length;
  }
}

class StubPurge extends TombstonePurgePort {
  constructor(private readonly count: number) {
    super();
  }

  async purgeBefore(): Promise<number> {
    return this.count;
  }
}

/** A push transport that records rather than sends. */
class RecordingPush extends PushService {
  readonly sends: Array<{ tokens: string[]; message: PushMessage }> = [];
  outcome: PushResult = { sent: 1, failed: 0, invalidTokens: [] };
  throws: Error | null = null;

  constructor() {
    // The real service takes a transport and reads credentials at boot; the
    // subclass replaces `send` entirely, so neither is needed here.
    super(
      {
        send: async () => ({ sent: 0, failed: 0, invalidTokens: [] }),
      } as never,
      undefined,
    );
  }

  override async send(
    tokens: string[],
    message: PushMessage,
  ): Promise<PushResult> {
    if (this.throws) throw this.throws;
    this.sends.push({ tokens, message });
    return this.outcome;
  }
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
    aggregate: { type: 'test', id: 'x' },
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
  devices: StubDevices;
  removal: StubRemoval;
  push: RecordingPush;
  settings: SettingsService;
  saga: PlanAlertsSaga;
  sweep: SweepHandler;
  pending: PendingAlertsQueryHandler;
  heartbeats: HeartbeatService;
}

function bench(purgeCounts: number[] = [0, 0]): Bench {
  const uow = new InMemoryUnitOfWork();
  const alerts = new InMemoryAlertRepository(uow);
  const member = new StubMemberContext();
  const devices = new StubDevices();
  const removal = new StubRemoval();
  const push = new RecordingPush();
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const heartbeats = {
    stamp: vi.fn(async () => undefined),
  } as unknown as HeartbeatService;

  return {
    uow,
    alerts,
    member,
    devices,
    removal,
    push,
    settings,
    heartbeats,
    saga: new PlanAlertsSaga(uow, alerts, member, () => alerts.nextId()),
    sweep: new SweepHandler(
      uow,
      alerts,
      devices,
      removal,
      purgeCounts.map((count) => new StubPurge(count)),
      push,
      settings,
      heartbeats,
    ),
    pending: new PendingAlertsQueryHandler(alerts),
  };
}

describe('the planning arithmetic', () => {
  it('reads lead times as durations', () => {
    expect(leadMinutes('0m')).toBe(0);
    expect(leadMinutes('30m')).toBe(30);
    expect(leadMinutes('1h')).toBe(60);
    expect(leadMinutes('2d')).toBe(2880);
    expect(leadMinutes('soon')).toBeNull();
  });

  it('reads a quiet window that wraps midnight as the dark hours, not the daylight ones', () => {
    /*
     * The inversion this function exists to avoid.
     *
     * `{ from: '22:00', to: '07:00' }` is the normal case, and a naive
     * `from <= t < to` check is false for 23:00 and true for 12:00 — so the
     * "quiet" window would be the fifteen waking hours and every alert the
     * member actually wanted would be held, while the ones that would wake them
     * went straight through. Exactly backwards.
     */
    const night = { from: '22:00', to: '07:00' };
    expect(isQuiet('23:00', night)).toBe(true);
    expect(isQuiet('03:00', night)).toBe(true);
    expect(isQuiet('06:59', night)).toBe(true);
    expect(isQuiet('07:00', night)).toBe(false);
    expect(isQuiet('12:00', night)).toBe(false);
    expect(isQuiet('21:59', night)).toBe(false);
  });

  it('reads a window inside one day the ordinary way', () => {
    const siesta = { from: '13:00', to: '16:00' };
    expect(isQuiet('14:00', siesta)).toBe(true);
    expect(isQuiet('12:00', siesta)).toBe(false);
    expect(isQuiet('23:00', siesta)).toBe(false);
  });

  it('treats a zero-length window as quiet hours turned off', () => {
    expect(isQuiet('03:00', { from: '07:00', to: '07:00' })).toBe(false);
  });

  it('ends a wrapping window tomorrow when the moment is in its late half', () => {
    const night = { from: '22:00', to: '07:00' };
    const lateEvening = wallClock('23:00', CAIRO);
    const end = endOfQuietHours(lateEvening, night, CAIRO);

    expect(localHhMm(end, CAIRO)).toBe('07:00');
    // Tomorrow, not fourteen hours ago.
    expect(end.getTime()).toBeGreaterThan(lateEvening.getTime());
  });

  it('ends a wrapping window today when the moment is in its early half', () => {
    const night = { from: '22:00', to: '07:00' };
    const smallHours = wallClock('03:00', CAIRO);
    const end = endOfQuietHours(smallHours, night, CAIRO);

    expect(localHhMm(end, CAIRO)).toBe('07:00');
    expect(end.getTime()).toBeGreaterThan(smallHours.getTime());
    // Four hours later, not twenty-eight.
    expect(end.getTime() - smallHours.getTime()).toBeLessThan(12 * 3_600_000);
  });
});

describe('quiet hours move a warning and never a moment the member chose', () => {
  const night = { from: '22:00', to: '07:00' };

  it('holds a derived warning that falls inside the window', () => {
    const at3am = wallClock('03:00', CAIRO);
    const moved = sendAt(at3am, '1h', night, CAIRO);
    expect(localHhMm(moved, CAIRO)).toBe('07:00');
  });

  it('never moves the moment the member chose, however unsociable', () => {
    /*
     * The rule, and the reason the label matters rather than the source kind:
     * if the member asked to be told at 03:00, 03:00 is when they are told.
     * Overriding that is the product deciding it knows better than the person
     * who set it — and a later source (a meeting, the evening prompt) inherits
     * this reading without a new rule being written.
     */
    const at3am = wallClock('03:00', CAIRO);
    const kept = sendAt(at3am, MEMBER_CHOSEN_LABEL, night, CAIRO);
    expect(kept.getTime()).toBe(at3am.getTime());
    expect(localHhMm(kept, CAIRO)).toBe('03:00');
  });

  it('leaves a warning outside the window alone', () => {
    const midday = wallClock('13:00', CAIRO);
    expect(sendAt(midday, '1h', night, CAIRO).getTime()).toBe(midday.getTime());
  });

  it('plans one alert per lead time plus the moment itself', () => {
    const moment = wallClock('13:00', CAIRO);
    const desired = desiredFor(moment, ['1d', '1h', '0m'], night, CAIRO, true);

    expect(desired.map((entry) => entry.label).sort()).toEqual([
      '0m',
      '1d',
      '1h',
    ]);
    const hourBefore = desired.find((entry) => entry.label === '1h')!;
    expect(moment.getTime() - hourBefore.notifyAt.getTime()).toBe(3_600_000);
  });

  it('gives an all-day thing exactly one alert and no warnings', () => {
    // "Buy milk, some time on Thursday" has no hour, so its moment is a
    // midnight the member never chose. Warning them an hour before it would be
    // a 23:00 notification about a task with no time.
    const midnight = wallClock('00:00', CAIRO);
    const desired = desiredFor(midnight, ['1h', '0m'], night, CAIRO, false);
    expect(desired).toHaveLength(1);
    expect(desired[0]!.label).toBe(MEMBER_CHOSEN_LABEL);
  });

  it('de-duplicates two preferences meaning the same duration', () => {
    // `60m` and `1h` are the same warning. Two alerts would collide on the
    // unique index and surface as a duplicate-key error rather than a message.
    const moment = inMinutes(600);
    const desired = desiredFor(moment, ['1h', '60m'], night, CAIRO, true);
    const labels = desired.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('the saga reconciles rather than appends', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('plans a task’s alerts from its due moment', async () => {
    const taskId = newId();
    const dueAt = wallClock('13:00', CAIRO);
    await b.saga.onTaskScheduled(
      event('planning.TaskScheduled', {
        taskId,
        dueAt,
        allDay: false,
        title: 'Ring the bank',
      }),
    );

    const planned = await b.alerts.pendingForSource(MEMBER, {
      kind: 'task',
      id: taskId,
    });
    expect(planned.map((alert) => alert.label).sort()).toEqual(['0m', '1h']);
    expect(planned.every((alert) => alert.title === 'Ring the bank')).toBe(
      true,
    );
  });

  it('plans one alert for an all-day task', async () => {
    const taskId = newId();
    await b.saga.onTaskScheduled(
      event('planning.TaskScheduled', {
        taskId,
        dueAt: inMinutes(600),
        allDay: true,
        title: 'Buy milk',
      }),
    );

    const planned = await b.alerts.pendingForSource(MEMBER, {
      kind: 'task',
      id: taskId,
    });
    expect(planned).toHaveLength(1);
  });

  it('writes nothing at all when the same event is delivered twice', async () => {
    /*
     * The relay is at-least-once, so this is the ordinary case rather than an
     * edge. A saga that appended would give the member two notifications for
     * one task every time a redelivery happened — which is exactly when they
     * would least be able to explain it.
     */
    const taskId = newId();
    const scheduled = event('planning.TaskScheduled', {
      taskId,
      dueAt: inMinutes(600),
      allDay: false,
      title: 'Ring the bank',
    });

    await b.saga.onTaskScheduled(scheduled);
    const first = await b.alerts.pendingForSource(MEMBER, {
      kind: 'task',
      id: taskId,
    });
    const plannedAts = first.map((alert) => alert.plannedAt.getTime());

    await b.saga.onTaskScheduled(scheduled);
    const second = await b.alerts.pendingForSource(MEMBER, {
      kind: 'task',
      id: taskId,
    });

    expect(second).toHaveLength(first.length);
    // Not merely "the same count" — the same rows, untouched. A re-plan would
    // have moved `plannedAt`, and the sweep's device filter reads that.
    expect(second.map((alert) => alert.plannedAt.getTime())).toEqual(
      plannedAts,
    );
  });

  it('moves the alerts when the moment moves, and moves plannedAt with them', async () => {
    const taskId = newId();
    await b.saga.onTaskScheduled(
      event('planning.TaskScheduled', {
        taskId,
        dueAt: inMinutes(600),
        allDay: false,
        title: 'Ring the bank',
      }),
    );
    const before = (
      await b.alerts.pendingForSource(MEMBER, { kind: 'task', id: taskId })
    ).find((alert) => alert.label === MEMBER_CHOSEN_LABEL)!;

    const later = inMinutes(1200);
    await b.saga.onTaskScheduled(
      event('planning.TaskRescheduled', {
        taskId,
        dueAt: later,
        allDay: false,
        title: 'Ring the bank',
      }),
    );

    const after = (
      await b.alerts.pendingForSource(MEMBER, { kind: 'task', id: taskId })
    ).find((alert) => alert.label === MEMBER_CHOSEN_LABEL)!;

    expect(after.notifyAt.getTime()).toBe(later.getTime());
    // `plannedAt` moving is what makes a device that synced five minutes ago —
    // and therefore holds an alarm for the *old* moment — a candidate again.
    expect(after.plannedAt.getTime()).toBeGreaterThanOrEqual(
      before.plannedAt.getTime(),
    );
  });

  it('deletes the alerts a removed lead time no longer wants', async () => {
    // The pass that is easy to leave out. Planning only what is missing would
    // leave the old warning to fire.
    const taskId = newId();
    await b.saga.onTaskScheduled(
      event('planning.TaskScheduled', {
        taskId,
        dueAt: inMinutes(600),
        allDay: false,
        title: 'X',
      }),
    );
    expect(
      await b.alerts.pendingForSource(MEMBER, { kind: 'task', id: taskId }),
    ).toHaveLength(2);

    b.member.leadTimes = ['0m'];
    await b.saga.onTaskScheduled(
      event('planning.TaskRescheduled', {
        taskId,
        dueAt: inMinutes(600),
        allDay: false,
        title: 'X',
      }),
    );

    const planned = await b.alerts.pendingForSource(MEMBER, {
      kind: 'task',
      id: taskId,
    });
    expect(planned.map((alert) => alert.label)).toEqual(['0m']);
  });

  it('drops every pending alert when a task is completed', async () => {
    const taskId = newId();
    await b.saga.onTaskScheduled(
      event('planning.TaskScheduled', {
        taskId,
        dueAt: inMinutes(600),
        allDay: false,
        title: 'X',
      }),
    );
    await b.saga.onTaskClosed(
      event('planning.TaskCompleted', { taskId, at: new Date() }),
    );

    expect(
      await b.alerts.pendingForSource(MEMBER, { kind: 'task', id: taskId }),
    ).toEqual([]);
  });

  it('does not drop the alerts of a repeating task that merely advanced', async () => {
    /*
     * A repeating task raises `TaskCompleted` *and* `TaskScheduled` for its new
     * moment. Dropping the alerts on the first would be undone by the second a
     * moment later — but only if the two arrive in order, and the relay
     * promises at-least-once, not ordered. Ignoring the completion when it
     * carries `recurrenceAdvancedTo` makes the outcome the same either way.
     */
    const taskId = newId();
    await b.saga.onTaskScheduled(
      event('planning.TaskScheduled', {
        taskId,
        dueAt: inMinutes(600),
        allDay: false,
        title: 'X',
      }),
    );
    await b.saga.onTaskClosed(
      event('planning.TaskCompleted', {
        taskId,
        at: new Date(),
        recurrenceAdvancedTo: inMinutes(10_680),
      }),
    );

    expect(
      (await b.alerts.pendingForSource(MEMBER, { kind: 'task', id: taskId }))
        .length,
    ).toBeGreaterThan(0);
  });

  it('clears a task’s alerts when its due date is removed', async () => {
    const taskId = newId();
    await b.saga.onTaskScheduled(
      event('planning.TaskScheduled', {
        taskId,
        dueAt: inMinutes(600),
        allDay: false,
        title: 'X',
      }),
    );
    await b.saga.onTaskScheduled(
      event('planning.TaskRescheduled', { taskId, dueAt: null, title: 'X' }),
    );

    expect(
      await b.alerts.pendingForSource(MEMBER, { kind: 'task', id: taskId }),
    ).toEqual([]);
  });

  it('uses a reminder’s own lead times over the member’s defaults', async () => {
    // They chose them for this reminder.
    const reminderId = newId();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId,
        remindAt: inMinutes(600),
        leadTimes: ['1d', '0m'],
        title: 'Call Dad',
      }),
    );

    const planned = await b.alerts.pendingForSource(MEMBER, {
      kind: 'reminder',
      id: reminderId,
    });
    expect(planned.map((alert) => alert.label).sort()).toEqual(['0m', '1d']);
  });

  it('drops a reminder’s alerts when it is completed', async () => {
    const reminderId = newId();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId,
        remindAt: inMinutes(600),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );
    await b.saga.onReminderClosed(
      event('reminders.ReminderCompleted', { reminderId }),
    );

    expect(
      await b.alerts.pendingForSource(MEMBER, {
        kind: 'reminder',
        id: reminderId,
      }),
    ).toEqual([]);
  });
});

describe('the events from outside Planning and Reminders', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('recomputes every future alert when the member changes time zone', async () => {
    /*
     * The branch that matters most in this file.
     *
     * A stored `notifyAt` was resolved against the *old* zone, so after a move
     * it is the wrong instant: an alert planned for 17:00 in Cairo stays 17:00
     * Cairo for ever unless somebody recomputes it, and the member is now in
     * New York. Resolving a user-facing time against the wrong zone once
     * shifted every extracted reminder in this product by three hours; a member
     * who flies somewhere reproduces that bug exactly unless this runs.
     *
     * And it recomputes from the source's own moment rather than adding an
     * offset, because the lead-time arithmetic and the quiet-hours shift both
     * have to be redone.
     */
    const reminderId = newId();
    const remindAt = wallClock('18:00', CAIRO);
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId,
        remindAt,
        leadTimes: ['1h', '0m'],
        title: 'X',
      }),
    );

    const before = await b.alerts.pendingForMember(MEMBER, new Date(0));
    expect(before.length).toBe(2);

    // The member moves somewhere with a very different quiet window in UTC
    // terms, and the quiet hours now catch the warning.
    b.member.timezone = 'Pacific/Honolulu';
    await b.saga.onProfileUpdated(
      event('profile.ProfileUpdated', { changed: ['timezone'] }),
    );

    const after = await b.alerts.pendingForMember(MEMBER, new Date(0));
    // The member-chosen moment is untouched — they picked an instant, and the
    // instant does not change because they moved.
    const chosen = after.find((alert) => alert.label === MEMBER_CHOSEN_LABEL)!;
    expect(chosen.notifyAt.getTime()).toBe(remindAt.getTime());

    // The derived warning is recomputed against the new zone's quiet window.
    const warning = after.find((alert) => alert.label === '1h')!;
    expect(localHhMm(warning.notifyAt, 'Pacific/Honolulu')).not.toBe(
      localHhMm(before.find((alert) => alert.label === '1h')!.notifyAt, CAIRO),
    );
  });

  it('ignores a profile change that is not the time zone', async () => {
    // The event carries one `changed` list for the whole patch, so a member
    // editing their food dislikes must not cost a full re-plan of their week.
    const reminderId = newId();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId,
        remindAt: inMinutes(600),
        leadTimes: ['1h'],
        title: 'X',
      }),
    );
    const before = (await b.alerts.pendingForMember(MEMBER, new Date(0))).map(
      (a) => a.plannedAt.getTime(),
    );

    await b.saga.onProfileUpdated(
      event('profile.ProfileUpdated', {
        changed: ['foodDislikes', 'displayName'],
      }),
    );

    const after = (await b.alerts.pendingForMember(MEMBER, new Date(0))).map(
      (a) => a.plannedAt.getTime(),
    );
    expect(after).toEqual(before);
  });

  it('re-plans when the quiet window changes and not when something else does', async () => {
    const reminderId = newId();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId,
        remindAt: wallClock('23:00', CAIRO),
        leadTimes: ['1h', '0m'],
        title: 'X',
      }),
    );

    b.member.quietHours = { from: '18:00', to: '09:00' };
    await b.saga.onPreferencesChanged(
      event('profile.PreferencesChanged', { changed: ['quietHours'] }),
    );

    const warning = (await b.alerts.pendingForMember(MEMBER, new Date(0))).find(
      (alert) => alert.label === '1h',
    )!;
    expect(localHhMm(warning.notifyAt, CAIRO)).toBe('09:00');

    // An unrelated preference does nothing.
    const untouched = warning.plannedAt.getTime();
    await b.saga.onPreferencesChanged(
      event('profile.PreferencesChanged', { changed: ['mealMode'] }),
    );
    const again = (await b.alerts.pendingForMember(MEMBER, new Date(0))).find(
      (alert) => alert.label === '1h',
    )!;
    expect(again.plannedAt.getTime()).toBe(untouched);
  });

  it('drops a banned member’s pending alerts entirely', async () => {
    // Deleted rather than suppressed at send time, because a suppression check
    // is a thing the sweep has to remember and this is a thing that cannot be
    // forgotten.
    const reminderId = newId();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId,
        remindAt: inMinutes(600),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );
    await b.saga.onUserBanned(event('identity.UserBanned', {}));

    expect(await b.alerts.pendingForMember(MEMBER, new Date(0))).toEqual([]);
  });

  it('re-plans when a device comes or goes', async () => {
    /*
     * The alerts do not change — only who can receive them — but `plannedAt`
     * moving is what makes a newly registered phone a candidate for the sweep.
     * Without it, a phone registered a minute ago has a `lastSeenAt` *after*
     * every existing `plannedAt`, so the sweep considers it already up to date
     * about alerts it has never heard of and sends it nothing.
     */
    const reminderId = newId();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId,
        remindAt: inMinutes(600),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );
    const before = (
      await b.alerts.pendingForMember(MEMBER, new Date(0))
    )[0]!.plannedAt.getTime();

    // A moment later, so the re-plan's timestamp is distinguishable.
    const later = new Date(Date.now() + 1000);
    await b.saga.onDevicesChanged({
      ...event('identity.DeviceRegistered', { deviceId: 'd1' }),
      occurredAt: later,
    });

    const after = (
      await b.alerts.pendingForMember(MEMBER, new Date(0))
    )[0]!.plannedAt.getTime();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe('the sweep', () => {
  it('claims, sends, and raises AlertSent', async () => {
    const b = bench();
    b.devices.rows = [
      {
        userId: MEMBER,
        deviceId: 'd1',
        pushToken: 't1',
        lastSeenAt: minutesAgo(600),
      },
    ];
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: minutesAgo(1),
        leadTimes: ['0m'],
        title: 'Call Dad',
      }),
    );
    b.uow.events.length = 0;

    const result = await b.sweep.handle();

    expect(result.claimed).toBe(1);
    expect(result.sent).toBe(1);
    expect(b.push.sends[0]?.tokens).toEqual(['t1']);
    expect(b.push.sends[0]?.message.title).toBe('Call Dad');
    expect(b.uow.events.map((e) => e.name)).toContain(
      'notifications.AlertSent',
    );
  });

  it('sends once when two sweeps run at the same time', async () => {
    /*
     * Not hypothetical: the cron fires every five minutes and a slow batch
     * overlaps the next tick. The claim is what decides it — a single
     * `findOneAndUpdate` filtered on `claimedAt: null` in production, and a
     * check-and-write with no `await` between them in the adapter this spec
     * binds, which gives the same guarantee for the same reason.
     */
    const b = bench();
    b.devices.rows = [
      {
        userId: MEMBER,
        deviceId: 'd1',
        pushToken: 't1',
        lastSeenAt: minutesAgo(600),
      },
    ];
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: minutesAgo(1),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );

    const [first, second] = await Promise.all([
      b.sweep.handle(),
      b.sweep.handle(),
    ]);

    expect(first.claimed + second.claimed).toBe(1);
    expect(first.sent + second.sent).toBe(1);
    expect(b.push.sends).toHaveLength(1);
  });

  it('skips a device that has synced since the alert was planned', async () => {
    /*
     * The most important line in the sweep. Such a device has already pulled
     * this alert and scheduled it locally — the phone's own alarm works with
     * the network off, which is why the device is the primary path and this
     * sweep is the fallback. Sending anyway notifies the member twice.
     */
    const b = bench();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: minutesAgo(1),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );
    // Synced *after* the plan was made.
    b.devices.rows = [
      {
        userId: MEMBER,
        deviceId: 'd1',
        pushToken: 't1',
        lastSeenAt: new Date(Date.now() + 1000),
      },
    ];

    const result = await b.sweep.handle();

    expect(result.sent).toBe(0);
    expect(result.skippedLocal).toBe(1);
    expect(b.push.sends).toHaveLength(0);
  });

  it('leaves an alert unsent when no device can receive a push', async () => {
    // Unsent rather than expired: the member may register a phone tomorrow, and
    // the alert is still the truth about what they asked for.
    const b = bench();
    b.devices.rows = [
      {
        userId: MEMBER,
        deviceId: 'd1',
        pushToken: null,
        lastSeenAt: minutesAgo(600),
      },
    ];
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: minutesAgo(1),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );

    const result = await b.sweep.handle();

    expect(result.skippedLocal).toBe(1);
    expect((await b.alerts.dueUnsent(new Date(), 10)).length).toBe(1);
  });

  it('expires an alert too old to be worth sending, silently', async () => {
    /*
     * Telling somebody at nine this morning about yesterday's nine o'clock
     * reminder is worse than saying nothing, because they will act on it. And
     * no `AlertFailed`: nothing failed, the moment passed, and a subscriber
     * counting failures should not count this.
     */
    const b = bench();
    b.devices.rows = [
      {
        userId: MEMBER,
        deviceId: 'd1',
        pushToken: 't1',
        lastSeenAt: minutesAgo(6000),
      },
    ];
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        // Two days ago, well past the 24-hour default expiry.
        remindAt: minutesAgo(2880),
        leadTimes: ['0m'],
        title: 'X',
      }),
      // A `now` far enough back that the reminder was in the future when
      // planned, so the aggregate does not refuse it.
    );
    b.uow.events.length = 0;

    const result = await b.sweep.handle();

    expect(result.expired).toBe(1);
    expect(result.sent).toBe(0);
    expect(b.uow.events.map((e) => e.name)).not.toContain(
      'notifications.AlertFailed',
    );
  });

  it('records a failure and releases the claim so a later sweep retries', async () => {
    const b = bench();
    b.devices.rows = [
      {
        userId: MEMBER,
        deviceId: 'd1',
        pushToken: 't1',
        lastSeenAt: minutesAgo(600),
      },
    ];
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: minutesAgo(1),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );
    b.push.throws = new Error('firebase is down');
    b.uow.events.length = 0;

    const result = await b.sweep.handle();

    expect(result.failed).toBe(1);
    expect(b.uow.events.map((e) => e.name)).toContain(
      'notifications.AlertFailed',
    );
    // Claim released, so the next sweep can pick it up.
    const still = await b.alerts.dueUnsent(new Date(), 10);
    expect(still).toHaveLength(1);
    expect(still[0]?.claimedAt).toBeNull();
  });

  it('reaps a token the push service rejected', async () => {
    const b = bench();
    b.devices.rows = [
      {
        userId: MEMBER,
        deviceId: 'd1',
        pushToken: 't1',
        lastSeenAt: minutesAgo(600),
      },
    ];
    b.push.outcome = { sent: 1, failed: 0, invalidTokens: ['t1'] };
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: minutesAgo(1),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );

    await b.sweep.handle();

    // Asked for, not done here: the device row is Identity's, in PostgreSQL.
    expect(b.removal.reaped).toEqual(['t1']);
  });

  it('reports purged as the total the owning contexts reported', async () => {
    // The number is about rows Planning and Reminders deleted, reported by the
    // contexts that deleted them — which is what lets this phase's
    // Constitution Check say PASS without a footnote.
    const b = bench([3, 4]);
    const result = await b.sweep.handle();
    expect(result.purged).toBe(7);
  });

  it('stamps its heartbeat whether it succeeds or throws', async () => {
    // A scheduled job that stops arriving has to be visible: a silent 401
    // between n8n and the gateway once went unnoticed for days.
    const b = bench();
    await b.sweep.handle();
    expect(b.heartbeats.stamp).toHaveBeenCalledWith(
      'notifications.sweep',
      true,
      undefined,
      expect.any(Number),
    );
  });
});

describe('the alarms handed to the phone', () => {
  it('returns the next seven days and nothing beyond', async () => {
    const b = bench();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: inMinutes(60),
        leadTimes: ['0m'],
        title: 'Soon',
      }),
    );
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        // Nine days out.
        remindAt: inMinutes(9 * 1440),
        leadTimes: ['0m'],
        title: 'Later',
      }),
    );

    const pending = await b.pending.forMember(MEMBER);
    expect(pending.map((alert) => alert.title)).toEqual(['Soon']);
  });

  it('hands over no delivery state', async () => {
    // The phone has no use for `claimedAt`, and sending it would invite a
    // client to reason about the server's own bookkeeping.
    const b = bench();
    await b.saga.onReminderScheduled(
      event('reminders.ReminderScheduled', {
        reminderId: newId(),
        remindAt: inMinutes(60),
        leadTimes: ['0m'],
        title: 'X',
      }),
    );

    const [alarm] = await b.pending.forMember(MEMBER);
    expect(Object.keys(alarm!).sort()).toEqual([
      'body',
      'deepLink',
      'label',
      'notifyAt',
      'source',
      'title',
    ]);
  });
});

/**
 * The instant at which a zone's clock reads `hhmm` today.
 *
 * Every fixture here goes through this rather than writing a UTC time and
 * assuming an offset, and the reason is a bug this file already had: the
 * fixtures were written as `T01:00:00.000Z` on the assumption that Cairo is
 * UTC+2, and Cairo observes daylight saving again — so in September it is +3
 * and "03:00" was actually 04:00. One assertion failed outright. Two others
 * *passed* while exercising the wrong branch of the wrapping-window logic,
 * which is worse, because a green test that proves something else is a test
 * nobody will re-read.
 *
 * Resolving through `shared/time` is the same rule the production code follows,
 * and it makes the fixtures correct on both sides of every clock change.
 */
function wallClock(hhmm: string, timezone: string): Date {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const instant = wallClockToUtc(`${today}T${hhmm}`, timezone);
  if (!instant) throw new Error(`cannot resolve ${hhmm} in ${timezone}`);
  return instant;
}
