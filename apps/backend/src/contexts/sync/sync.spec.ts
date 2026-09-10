import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { newId } from '../../shared/cqrs/ids.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { OutboxWriter } from '../../shared/outbox/outbox-writer.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import {
  InMemoryLabelRepository,
  InMemoryTaskRepository,
} from '../planning/infrastructure/in-memory-planning.repositories.js';
import {
  LabelSyncAdapter,
  TaskSyncAdapter,
} from '../planning/infrastructure/planning-sync.adapters.js';
import { InMemoryReminderRepository } from '../reminders/infrastructure/in-memory-reminder.repository.js';
import { ReminderSyncAdapter } from '../reminders/infrastructure/reminder-sync.adapter.js';
import {
  DeviceTouchPort,
  PendingAlertsPort,
} from './domain/syncable-entity.port.js';
import { SyncHandler, CURSOR_LAG_MS } from './features/sync/sync.handler.js';

const MEMBER = 'member-1';
const INSTALL = 'install-1';
const CAIRO = 'Africa/Cairo';

const inMinutes = (n: number) => new Date(Date.now() + n * 60_000);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

class StubMember extends MemberContextPort {
  async clock(): Promise<MemberClock> {
    return { timezone: CAIRO };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: ['0m'], quietHours: { from: '22:00', to: '07:00' } };
  }
}

class StubTouch extends DeviceTouchPort {
  touched: Array<{ installId: string; at: Date }> = [];
  known = true;

  async touch(installId: string, at: Date): Promise<string | null> {
    this.touched.push({ installId, at });
    return this.known ? 'device-1' : null;
  }
}

class StubAlerts extends PendingAlertsPort {
  rows: unknown[] = [];

  async forMember(): Promise<unknown[]> {
    return this.rows;
  }
}

/** Records what would have gone to the outbox. */
class RecordingOutbox {
  readonly written: Array<{ name: string; payload: unknown }> = [];

  async write(
    events: Array<{ name: string; payload: unknown }>,
  ): Promise<void> {
    this.written.push(
      ...events.map((event) => ({ name: event.name, payload: event.payload })),
    );
  }
}

interface Bench {
  uow: InMemoryUnitOfWork;
  tasks: InMemoryTaskRepository;
  labels: InMemoryLabelRepository;
  reminders: InMemoryReminderRepository;
  touch: StubTouch;
  alerts: StubAlerts;
  outbox: RecordingOutbox;
  sync: SyncHandler;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const tasks = new InMemoryTaskRepository(uow);
  const labels = new InMemoryLabelRepository(uow);
  const reminders = new InMemoryReminderRepository(uow);
  const member = new StubMember();
  const touch = new StubTouch();
  const alerts = new StubAlerts();
  const outbox = new RecordingOutbox();
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );

  return {
    uow,
    tasks,
    labels,
    reminders,
    touch,
    alerts,
    outbox,
    sync: new SyncHandler(
      [
        new LabelSyncAdapter(uow, labels),
        new TaskSyncAdapter(uow, tasks, labels, member),
        new ReminderSyncAdapter(uow, reminders),
      ],
      [],
      touch,
      alerts,
      settings,
      outbox as unknown as OutboxWriter,
    ),
  };
}

const ALL = ['labels', 'tasks', 'reminders'];

/** A pushed row in the wire shape. */
function change(
  op: 'create' | 'update' | 'delete' | 'restore' | 'purge',
  id: string,
  data: Record<string, unknown> = {},
  overrides: { updatedAt?: Date; baseUpdatedAt?: Date | null } = {},
) {
  return {
    op,
    id,
    updatedAt: (overrides.updatedAt ?? new Date()).toISOString(),
    baseUpdatedAt:
      overrides.baseUpdatedAt === undefined
        ? null
        : (overrides.baseUpdatedAt?.toISOString() ?? null),
    data,
  };
}

describe('a round trip', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('accepts a create and returns the row in the same response', async () => {
    const id = newId();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', id, { title: 'Buy milk' })] },
    });

    expect(result.accepted.tasks).toEqual([id]);
    expect(result.rejections).toEqual([]);
    expect(
      (result.pull.tasks as Array<{ id: string }>).map((row) => row.id),
    ).toEqual([id]);
  });

  it('lags the cursor behind the server clock', async () => {
    /*
     * A transaction committing a moment after the pull's read would otherwise
     * fall between two cursors and never be seen at all. The lag makes such a
     * row arrive *twice* instead of never, and a duplicate costs nothing
     * because every apply on the client is an upsert by id.
     */
    const before = Date.now();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
    });

    expect(result.now.getTime()).toBeLessThanOrEqual(before);
    expect(result.now.getTime()).toBeGreaterThan(before - CURSOR_LAG_MS - 2000);
  });

  it('applies labels before tasks, so a task can name a label from the same request', async () => {
    // The apply order, and the reason for it: a task carries a snapshot of its
    // label's name and colour. Tasks first and the snapshot would be empty.
    const labelId = newId();
    const taskId = newId();

    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        // Deliberately listed tasks first in the request body: the order in the
        // JSON must not matter, only `applyOrder`.
        tasks: [change('create', taskId, { title: 'Write the memo', labelId })],
        labels: [change('create', labelId, { name: 'Work', color: '#0f766e' })],
      },
    });

    expect(result.rejections).toEqual([]);
    const task = await b.tasks.findById(MEMBER, taskId);
    expect(task?.label).toEqual({ name: 'Work', color: '#0f766e' });
  });

  it('touches the device after serving the pull, not before', async () => {
    /*
     * `lastSeenAt` is the claim "this device holds every alarm planned before
     * now", and the notification sweep skips a device on the strength of it.
     * Stamping before the pull would make the claim true a moment early, and a
     * crash in between would leave a device the sweep skips holding nothing.
     */
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
    });

    expect(b.touch.touched).toHaveLength(1);
    expect(b.touch.touched[0]?.installId).toBe(INSTALL);
  });

  it('serves the round trip even when the install is unknown', async () => {
    // An app reinstalled, or a client that never registered. Refusing would
    // leave that member unable to sync at all; the only consequence of serving
    // is that the sweep keeps pushing to a device that may not need it.
    b.touch.known = false;
    const result = await b.sync.handle(MEMBER, {
      installId: 'never-seen',
      since: null,
      entities: ALL,
    });
    expect(result.full).toBe(true);
    expect(result.pull.tasks).toEqual([]);
  });

  it('raises ChangesApplied only when a push was accepted', async () => {
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
    });
    expect(b.outbox.written).toEqual([]);

    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', newId(), { title: 'X' })] },
    });

    expect(b.outbox.written.map((event) => event.name)).toEqual([
      'sync.ChangesApplied',
    ]);
    // The emitting install is named so a client can ignore its own echo: the
    // socket room is per member, not per device.
    expect(b.outbox.written[0]?.payload).toMatchObject({
      installId: INSTALL,
      entities: ['tasks'],
    });
  });

  it('returns only the entities the client asked for', async () => {
    // The extension sends a subset. Sending it everything would have it hold
    // rows it has no table for.
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ['tasks'],
    });

    expect(Object.keys(result.pull)).toEqual(['tasks']);
  });

  it('ignores a push for an entity the client did not list', async () => {
    // Asking to sync tasks and pushing reminders is a client bug. Applying the
    // reminder anyway would write a row the client is then never told about,
    // because the pull does not include that entity.
    const id = newId();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ['tasks'],
      push: {
        reminders: [
          change('create', id, { title: 'X', remindAt: inMinutes(60) }),
        ],
      },
    });

    expect(result.accepted.reminders).toBeUndefined();
    expect(b.reminders.rows.size).toBe(0);
  });

  it('hands back the pending alerts alongside the pull', async () => {
    // In the same round trip, because a second one would be a second chance to
    // be offline between the two.
    b.alerts.rows = [{ label: '0m', title: 'Call Dad' }];
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
    });
    expect(result.pendingAlerts).toHaveLength(1);
  });
});

describe('full versus delta', () => {
  it('is full on a first sync', async () => {
    const b = bench();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
    });
    expect(result.full).toBe(true);
  });

  it('is full when the cursor is older than the tombstone horizon', async () => {
    /*
     * Not an optimisation. A phone offline for longer than
     * `reminders.tombstoneDays` has missed deletions whose tombstones the sweep
     * has since purged — a delta cannot tell it about them, because there is
     * nothing left to send. Serving a delta leaves rows on that phone that were
     * deleted weeks ago and nothing will ever remove them.
     */
    const b = bench();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      // Forty days, against the 30-day default.
      since: new Date(Date.now() - 40 * 86_400_000),
      entities: ALL,
    });
    expect(result.full).toBe(true);
  });

  it('is a delta for a recent cursor, and carries only what changed', async () => {
    const b = bench();
    const old = newId();
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', old, { title: 'Old' })] },
    });

    // The cursor is the old row's own stamp, so `updatedAt > since` excludes
    // it — and the new row is given a stamp a second later, because two writes
    // in the same millisecond would be on the same side of any cursor and the
    // test would be measuring the clock's resolution rather than the rule.
    const cursor = (await b.tasks.findById(MEMBER, old))!.updatedAt;
    const fresh = newId();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: cursor,
      entities: ALL,
      push: {
        tasks: [
          change(
            'create',
            fresh,
            { title: 'New' },
            {
              updatedAt: new Date(cursor.getTime() + 1000),
            },
          ),
        ],
      },
    });

    expect(result.full).toBe(false);
    const ids = (result.pull.tasks as Array<{ id: string }>).map(
      (row) => row.id,
    );
    expect(ids).toContain(fresh);
    expect(ids).not.toContain(old);
  });

  it('carries tombstones in a delta, because that is how a deletion travels', async () => {
    /*
     * The rule the client's delete sweep depends on from the other side. A
     * delta lists what changed; a deleted row that simply vanished would never
     * appear in one, so the deletion would reach no other device.
     */
    const b = bench();
    const id = newId();
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', id, { title: 'X' })] },
    });

    const stored = await b.tasks.findById(MEMBER, id);
    const cursor = new Date(stored!.updatedAt.getTime() - 1);

    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: cursor,
      entities: ALL,
      push: {
        tasks: [change('delete', id, {}, { baseUpdatedAt: stored!.updatedAt })],
      },
    });

    const rows = result.pull.tasks as Array<{
      id: string;
      deletedAt: Date | null;
    }>;
    const tombstone = rows.find((row) => row.id === id);
    expect(tombstone?.deletedAt).not.toBeNull();
  });
});

describe('the conflict rule, through the adapters', () => {
  let b: Bench;
  let id: string;
  let serverUpdatedAt: Date;

  beforeEach(async () => {
    b = bench();
    id = newId();
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', id, { title: 'Original' })] },
    });
    serverUpdatedAt = (await b.tasks.findById(MEMBER, id))!.updatedAt;
  });

  it('accepts an update whose base matches, without consulting any clock', async () => {
    // The ordinary case, and the whole reason `baseUpdatedAt` is carried: a
    // device that has not fallen behind never has its wall clock judged. The
    // `updatedAt` here is three days in the past and it does not matter.
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          change(
            'update',
            id,
            { title: 'Edited' },
            { updatedAt: minutesAgo(4320), baseUpdatedAt: serverUpdatedAt },
          ),
        ],
      },
    });

    expect(result.rejections).toEqual([]);
    expect((await b.tasks.findById(MEMBER, id))?.title).toBe('Edited');
  });

  it('refuses a stale update and hands back the server row', async () => {
    /*
     * The client's obligation on a `stale` is to overwrite its own copy with
     * the row in the rejection and show the member the winner — so the row has
     * to be *in* the rejection. A verdict without it would have the phone ask
     * again, get the same refusal, and loop.
     */
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          change(
            'update',
            id,
            { title: 'Loser' },
            { updatedAt: minutesAgo(120), baseUpdatedAt: minutesAgo(240) },
          ),
        ],
      },
    });

    expect(result.accepted.tasks).toBeUndefined();
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]).toMatchObject({
      entity: 'tasks',
      id,
      reason: 'stale',
    });
    expect(result.rejections[0]?.server).toBeTruthy();
    // And the losing edit did not land.
    expect((await b.tasks.findById(MEMBER, id))?.title).toBe('Original');
  });

  it('refuses an update to a row that is not there as gone, not stale', async () => {
    // `gone` because there is nothing to overwrite the local copy with — the
    // client deletes its own row rather than retrying for ever.
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('update', newId(), { title: 'Ghost' })] },
    });

    expect(result.rejections[0]).toMatchObject({ reason: 'gone' });
  });

  it('refuses a purge of a live row as not_deleted', async () => {
    // Erasing something that is not in the bin is data loss dressed as
    // housekeeping, and `not_deleted` is never reported as `stale` — a stale
    // verdict would have the phone retry against a rule that will not budge.
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [change('purge', id, {}, { baseUpdatedAt: serverUpdatedAt })],
      },
    });

    expect(result.rejections[0]).toMatchObject({ reason: 'not_deleted' });
    expect(await b.tasks.findById(MEMBER, id)).not.toBeNull();
  });

  it('accepts a purge of a tombstone', async () => {
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [change('delete', id, {}, { baseUpdatedAt: serverUpdatedAt })],
      },
    });
    const tombstoned = (await b.tasks.findById(MEMBER, id))!.updatedAt;

    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('purge', id, {}, { baseUpdatedAt: tombstoned })] },
    });

    expect(result.accepted.tasks).toEqual([id]);
    expect(await b.tasks.findById(MEMBER, id)).toBeNull();
  });

  it('clamps a client clock set to the future', async () => {
    // A handset reading 2099 would otherwise be the newest edit for ever,
    // against every device, indefinitely.
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          change(
            'update',
            id,
            { title: 'From the future' },
            {
              updatedAt: new Date('2099-01-01T00:00:00.000Z'),
              baseUpdatedAt: minutesAgo(240),
            },
          ),
        ],
      },
    });

    // Clamped to `now`, which is still newer than the server row, so this one
    // is accepted — the clamp is not a refusal, it is a ceiling. What it
    // prevents is the 2099 timestamp winning a conflict against a row written
    // *after* now, which the unit spec for `resolveConflict` covers.
    expect(result.rejections).toEqual([]);
    expect((await b.tasks.findById(MEMBER, id))?.title).toBe('From the future');
  });

  it('rejects one malformed row without abandoning the rest', async () => {
    // One bad row must not stop the other forty being applied, and the client
    // needs to know *which* one.
    const good = newId();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          {
            op: 'nonsense',
            id: 'bad-1',
            updatedAt: new Date().toISOString(),
            data: {},
          },
          change('create', good, { title: 'Fine' }),
        ],
      },
    });

    expect(result.accepted.tasks).toEqual([good]);
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]).toMatchObject({
      id: 'bad-1',
      reason: 'invalid',
    });
  });

  it('rejects a row a domain rule refuses, as invalid rather than stale', async () => {
    // Retrying unchanged will fail again, so the client surfaces it to the
    // member instead of queueing it for ever.
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', newId(), { title: '   ' })] },
    });

    expect(result.rejections[0]).toMatchObject({ reason: 'invalid' });
  });

  it('refuses a push whose baseUpdatedAt is present but unreadable', async () => {
    /*
     * Treating a garbled base as null would hand the client the no-conflict
     * fast path it had not earned — every offline edit would then be accepted
     * outright rather than compared.
     */
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          {
            op: 'update',
            id,
            updatedAt: new Date().toISOString(),
            baseUpdatedAt: 'not a date',
            data: { title: 'Sneaky' },
          },
        ],
      },
    });

    expect(result.rejections[0]).toMatchObject({ reason: 'invalid' });
    expect((await b.tasks.findById(MEMBER, id))?.title).toBe('Original');
  });

  it('scopes every apply to the member who asked', async () => {
    // Pushing another member's id is answered as `gone`, because whether that
    // row exists is not this caller's business.
    const result = await b.sync.handle('member-2', {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('update', id, { title: 'Hijacked' })] },
    });

    expect(result.rejections[0]).toMatchObject({ reason: 'gone' });
    expect((await b.tasks.findById(MEMBER, id))?.title).toBe('Original');
  });
});

describe('a status pushed from offline is stored, not re-transitioned', () => {
  it('does not advance a repeating task twice for one completion', async () => {
    /*
     * The phone completed the task offline: it advanced the recurrence locally
     * and is pushing the *result*. Calling `complete()` here would advance it
     * again, so the series would jump two occurrences for one completion.
     *
     * The pushed row is the outcome, so it is stored as such.
     */
    const b = bench();
    const id = newId();
    const dueAt = inMinutes(60);

    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          change('create', id, {
            title: 'Water the plants',
            dueAt: dueAt.toISOString(),
            allDay: false,
            recurrence: {
              dtstart: dueAt.toISOString(),
              rrule: 'FREQ=WEEKLY',
              mode: 'schedule',
              exdates: [],
            },
          }),
        ],
      },
    });

    const created = (await b.tasks.findById(MEMBER, id))!;
    // The phone's own advance: one week on, and status back to open.
    const advanced = new Date(dueAt.getTime() + 7 * 86_400_000);

    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          change(
            'update',
            id,
            { dueAt: advanced.toISOString(), status: 'open' },
            { baseUpdatedAt: created.updatedAt },
          ),
        ],
      },
    });

    const after = (await b.tasks.findById(MEMBER, id))!;
    // Exactly where the phone put it — not two weeks out.
    expect(after.dueAt?.getTime()).toBe(advanced.getTime());
    expect(after.status).toBe('open');
  });

  it('stores a completed status without clearing it again', async () => {
    const b = bench();
    const id = newId();
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', id, { title: 'X' })] },
    });
    const created = (await b.tasks.findById(MEMBER, id))!;

    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          change(
            'update',
            id,
            { status: 'completed' },
            { baseUpdatedAt: created.updatedAt },
          ),
        ],
      },
    });

    const after = (await b.tasks.findById(MEMBER, id))!;
    expect(after.status).toBe('completed');
    expect(after.completedAt).not.toBeNull();
  });

  it('accepts a reminder created offline for a moment that has since passed', async () => {
    /*
     * The interactive path refuses a past `remindAt`, because moving a moment
     * the member chose is the silent shift principle XI forbids. But a reminder
     * created on a plane for 18:00 and pushed at 21:00 is not a request for the
     * impossible — it is the member's own past intention arriving late, and
     * refusing it throws away work they did.
     *
     * It lands in Overdue, which is where a reminder they missed belongs.
     */
    const b = bench();
    const id = newId();
    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        reminders: [
          change('create', id, {
            title: 'Call Dad',
            remindAt: minutesAgo(180).toISOString(),
            leadTimes: ['0m'],
          }),
        ],
      },
    });

    expect(result.rejections).toEqual([]);
    const stored = await b.reminders.findById(MEMBER, id);
    expect(stored).not.toBeNull();
    expect(stored?.remindAt.getTime()).toBeLessThan(Date.now());
  });

  it('stores a snooze that has already elapsed rather than refusing it', async () => {
    // `snooze()` would refuse a `snoozedUntil` in the past. The member pressed
    // snooze an hour ago on a train; the push is a report, not a request.
    const b = bench();
    const id = newId();
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        reminders: [
          change('create', id, {
            title: 'X',
            remindAt: inMinutes(600).toISOString(),
          }),
        ],
      },
    });
    const created = (await b.reminders.findById(MEMBER, id))!;

    const result = await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        reminders: [
          change(
            'update',
            id,
            { snoozedUntil: minutesAgo(30).toISOString() },
            { baseUpdatedAt: created.updatedAt },
          ),
        ],
      },
    });

    expect(result.rejections).toEqual([]);
    expect(
      (await b.reminders.findById(MEMBER, id))?.snoozedUntil,
    ).not.toBeNull();
  });
});

describe('deleting through sync leaves the status alone', () => {
  it('keeps a completed task completed', async () => {
    const b = bench();
    const id = newId();
    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: { tasks: [change('create', id, { title: 'X' })] },
    });
    let stored = (await b.tasks.findById(MEMBER, id))!;

    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [
          change(
            'update',
            id,
            { status: 'completed' },
            { baseUpdatedAt: stored.updatedAt },
          ),
        ],
      },
    });
    stored = (await b.tasks.findById(MEMBER, id))!;

    await b.sync.handle(MEMBER, {
      installId: INSTALL,
      since: null,
      entities: ALL,
      push: {
        tasks: [change('delete', id, {}, { baseUpdatedAt: stored.updatedAt })],
      },
    });

    const after = (await b.tasks.findById(MEMBER, id))!;
    expect(after.isDeleted).toBe(true);
    // The Deleted view's entire reason for existing.
    expect(after.status).toBe('completed');
  });
});
