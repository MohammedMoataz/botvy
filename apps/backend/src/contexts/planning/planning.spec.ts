import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, localHhMm } from '../../shared/time/time.js';
import { TaskRuleError } from './domain/task.aggregate.js';
import { CancelTaskHandler } from './features/cancel-task/cancel-task.handler.js';
import { CompleteTaskHandler } from './features/complete-task/complete-task.handler.js';
import {
  CreateLabelHandler,
  DuplicateLabelName,
} from './features/create-label/create-label.handler.js';
import {
  CreateTaskHandler,
  InvalidTaskId,
} from './features/create-task/create-task.handler.js';
import { DeferTaskHandler } from './features/defer-task/defer-task.handler.js';
import { DeleteLabelHandler } from './features/delete-label/delete-label.handler.js';
import { DeleteTaskHandler } from './features/delete-task/delete-task.handler.js';
import { LabelSnapshotHandler } from './features/label-snapshot/label-snapshot.handler.js';
import { PurgeTaskHandler } from './features/purge-task/purge-task.handler.js';
import { ReopenTaskHandler } from './features/reopen-task/reopen-task.handler.js';
import { RestoreTaskHandler } from './features/restore-task/restore-task.handler.js';
import { RolloverHandler } from './features/rollover/rollover.handler.js';
import { SkipOccurrenceHandler } from './features/skip-occurrence/skip-occurrence.handler.js';
import { TasksDueQueryHandler } from './features/tasks-due-query/tasks-due.query.js';
import { TasksQueryHandler } from './features/tasks-query/tasks.query.js';
import { UpdateLabelHandler } from './features/update-label/update-label.handler.js';
import { UpdateTaskHandler } from './features/update-task/update-task.handler.js';
import {
  InMemoryLabelRepository,
  InMemoryTaskReadRepository,
  InMemoryTaskRepository,
} from './infrastructure/in-memory-planning.repositories.js';

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';

/**
 * The shared scheduling facts, stubbed.
 *
 * Every spec here runs in Cairo, because that is where "today" being the
 * member's day rather than the server's actually shows: at 23:00 UTC it is
 * already tomorrow in Cairo, so a test that ran in UTC would agree with a
 * broken implementation for most of the day.
 */
class StubMemberContext extends MemberContextPort {
  constructor(private readonly timezone = CAIRO) {
    super();
  }

  async clock(): Promise<MemberClock> {
    return { timezone: this.timezone };
  }

  async alertPreferences(): Promise<MemberAlertPreferences> {
    return {
      leadTimes: ['1h', '0m'],
      quietHours: { from: '22:00', to: '07:00' },
    };
  }
}

interface Bench {
  uow: InMemoryUnitOfWork;
  tasks: InMemoryTaskRepository;
  labels: InMemoryLabelRepository;
  reads: InMemoryTaskReadRepository;
  settings: SettingsService;
  member: StubMemberContext;
  create: CreateTaskHandler;
  update: UpdateTaskHandler;
  complete: CompleteTaskHandler;
  reopen: ReopenTaskHandler;
  cancel: CancelTaskHandler;
  defer: DeferTaskHandler;
  remove: DeleteTaskHandler;
  restore: RestoreTaskHandler;
  purge: PurgeTaskHandler;
  skip: SkipOccurrenceHandler;
  rollover: RolloverHandler;
  createLabel: CreateLabelHandler;
  updateLabel: UpdateLabelHandler;
  deleteLabel: DeleteLabelHandler;
  snapshots: LabelSnapshotHandler;
  query: TasksQueryHandler;
  crossContext: TasksDueQueryHandler;
}

function bench(timezone = CAIRO): Bench {
  const uow = new InMemoryUnitOfWork();
  const tasks = new InMemoryTaskRepository(uow);
  const labels = new InMemoryLabelRepository(uow);
  const reads = new InMemoryTaskReadRepository(tasks, labels);
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );
  const member = new StubMemberContext(timezone);

  return {
    uow,
    tasks,
    labels,
    reads,
    settings,
    member,
    create: new CreateTaskHandler(uow, tasks, labels, member),
    update: new UpdateTaskHandler(uow, tasks, labels, member),
    complete: new CompleteTaskHandler(uow, tasks, member),
    reopen: new ReopenTaskHandler(uow, tasks),
    cancel: new CancelTaskHandler(uow, tasks),
    defer: new DeferTaskHandler(uow, tasks),
    remove: new DeleteTaskHandler(uow, tasks),
    restore: new RestoreTaskHandler(uow, tasks),
    purge: new PurgeTaskHandler(uow, tasks, labels),
    skip: new SkipOccurrenceHandler(uow, tasks, member),
    rollover: new RolloverHandler(uow, tasks),
    createLabel: new CreateLabelHandler(uow, labels, settings),
    updateLabel: new UpdateLabelHandler(uow, labels),
    deleteLabel: new DeleteLabelHandler(uow, labels),
    snapshots: new LabelSnapshotHandler(uow, tasks),
    query: new TasksQueryHandler(reads, member),
    crossContext: new TasksDueQueryHandler(reads, member),
  };
}

/** Names raised, for the assertions that care about the event and not the payload. */
const names = (b: Bench) => b.uow.events.map((event) => event.name);

function labelEvent(b: Bench, name: string): DomainEvent {
  const raised = b.labels.events.find((event) => event.name === name);
  if (!raised) throw new Error(`no ${name} was raised`);
  return raised;
}

describe('creating a task', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('accepts the id the client minted and raises TaskScheduled', async () => {
    const id = newId();
    const result = await b.create.handle(MEMBER, { id, title: 'Buy milk' });

    expect(result.id).toBe(id);
    expect(result.replayed).toBe(false);
    expect(names(b)).toEqual(['planning.TaskScheduled']);
  });

  it('answers a replayed create as the create that already happened', async () => {
    // The whole reason the client mints the id. A retried push after a dropped
    // connection is indistinguishable from a second create unless the id
    // decides it — so this is what makes "sync without duplicates" a property
    // of the protocol rather than a matter of luck.
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    b.uow.events.length = 0;

    const replay = await b.create.handle(MEMBER, { id, title: 'Buy milk' });

    expect(replay.replayed).toBe(true);
    expect(b.tasks.rows.size).toBe(1);
    // One task, and — the half that is easy to miss — no second event. A
    // duplicate `TaskScheduled` would have the alert saga reconcile a set it
    // had already reconciled.
    expect(names(b)).toEqual([]);
  });

  it('refuses an id that is not a UUID', async () => {
    await expect(
      b.create.handle(MEMBER, { id: 'task-1', title: 'Buy milk' }),
    ).rejects.toThrow(InvalidTaskId);
  });

  it('refuses a title that is only whitespace', async () => {
    await expect(
      b.create.handle(MEMBER, { id: newId(), title: '   ' }),
    ).rejects.toThrow(TaskRuleError);
  });

  it('snapshots the label’s current name rather than the client’s copy', async () => {
    // The phone may have been offline while the label was renamed. Writing its
    // stale copy would show the old name until something else touched the row.
    const labelId = newId();
    await b.createLabel.handle(MEMBER, {
      id: labelId,
      name: 'Work',
      color: '#0f766e',
    });
    await b.updateLabel.handle(MEMBER, labelId, { name: 'Deep work' });

    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Write the memo', labelId });

    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.label).toEqual({ name: 'Deep work', color: '#0f766e' });
  });

  it('drops a label id whose label has been deleted', async () => {
    // A task pointing at nothing renders as a blank chip and offers a by-label
    // group that cannot be opened.
    const labelId = newId();
    await b.createLabel.handle(MEMBER, { id: labelId, name: 'Work' });
    await b.deleteLabel.handle(MEMBER, labelId);

    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Write the memo', labelId });

    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.labelId).toBeNull();
    expect(task?.label).toBeNull();
  });

  it('refuses a repeat rule it cannot read, at the write', async () => {
    // Accepting it would leave a task that throws when the member tries to
    // complete it — days later, with no clue why.
    await expect(
      b.create.handle(MEMBER, {
        id: newId(),
        title: 'Water the plants',
        recurrence: {
          dtstart: new Date(),
          rrule: 'FREQ=NONSENSE',
          mode: 'schedule',
          exdates: [],
        },
      }),
    ).rejects.toThrow(TaskRuleError);
  });
});

describe('editing a task', () => {
  let b: Bench;
  let id: string;
  beforeEach(async () => {
    b = bench();
    id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk', priority: 3 });
    b.uow.events.length = 0;
  });

  it('raises nothing when nothing moved', async () => {
    // A client that re-sends the form on every keystroke should not cost a
    // write per keystroke, nor wake the alert saga.
    const result = await b.update.handle(MEMBER, id, {
      title: 'Buy milk',
      priority: 3,
    });

    expect(result.changed).toEqual([]);
    expect(names(b)).toEqual([]);
  });

  it('raises TaskRescheduled when the moment moves', async () => {
    await b.update.handle(MEMBER, id, {
      dueAt: new Date(Date.now() + 86_400_000),
    });
    expect(names(b)).toEqual(['planning.TaskRescheduled']);
  });

  it('does not raise TaskRescheduled for a field no alert is built from', async () => {
    // Notifications has no use for a note or a priority, and raising for them
    // would re-plan an identical set every time the member typed.
    const result = await b.update.handle(MEMBER, id, {
      notes: 'the blue carton',
      priority: 1,
    });

    expect(result.changed).toEqual(['notes', 'priority']);
    expect(names(b)).toEqual([]);
  });

  it('raises once for a patch that moves several alert fields', async () => {
    const result = await b.update.handle(MEMBER, id, {
      title: 'Buy oat milk',
      dueAt: new Date(Date.now() + 3_600_000),
      allDay: false,
    });

    expect(result.changed).toEqual(['title', 'dueAt', 'allDay']);
    expect(names(b)).toEqual(['planning.TaskRescheduled']);
  });
});

describe('completing a task', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('finishes a one-off task', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    b.uow.events.length = 0;

    const result = await b.complete.handle(MEMBER, id);

    expect(result.recurrenceAdvancedTo).toBeNull();
    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.status).toBe('completed');
    expect(names(b)).toEqual(['planning.TaskCompleted']);
  });

  it('re-arms a repeating task on the same row, and says where it went', async () => {
    // One row per series. Completing an occurrence closes it and moves `dueAt`.
    const id = newId();
    const dueAt = new Date(Date.now() + 3_600_000);
    await b.create.handle(MEMBER, {
      id,
      title: 'Water the plants',
      dueAt,
      allDay: false,
      recurrence: {
        dtstart: dueAt,
        rrule: 'FREQ=WEEKLY',
        mode: 'schedule',
        exdates: [],
      },
    });
    b.uow.events.length = 0;

    const result = await b.complete.handle(MEMBER, id);

    expect(result.recurrenceAdvancedTo).not.toBeNull();
    const task = await b.tasks.findById(MEMBER, id);
    // Still open, still one row, moved on a week.
    expect(task?.status).toBe('open');
    expect(b.tasks.rows.size).toBe(1);
    expect(task?.dueAt?.getTime()).toBe(result.recurrenceAdvancedTo!.getTime());
    // Completed *and* re-scheduled: a consumer can tell "finished for now"
    // from "finished for ever" without re-deriving the rule.
    expect(names(b)).toEqual([
      'planning.TaskCompleted',
      'planning.TaskScheduled',
    ]);
  });

  it('keeps the member’s chosen hour when a completion-mode series advances', async () => {
    const id = newId();
    // 09:00 in Cairo, whatever that is in UTC today.
    const nineAm = new Date(Date.now() + 3_600_000);
    await b.create.handle(MEMBER, {
      id,
      title: 'Change the sheets',
      dueAt: nineAm,
      allDay: false,
      recurrence: {
        dtstart: nineAm,
        rrule: 'FREQ=WEEKLY;INTERVAL=2',
        mode: 'completion',
        exdates: [],
      },
    });

    // Ticked off at a wildly different hour from the one it was set for.
    const lateAtNight = new Date(nineAm.getTime() + 13 * 3_600_000);
    const result = await b.complete.handle(MEMBER, id, lateAtNight);

    // The series keeps its own time of day rather than drifting to whenever
    // the member happened to tick it off.
    expect(localHhMm(result.recurrenceAdvancedTo!, CAIRO)).toBe(
      localHhMm(nineAm, CAIRO),
    );
  });

  it('reopening a completed task raises TaskScheduled so its alerts are planned again', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    await b.complete.handle(MEMBER, id);
    b.uow.events.length = 0;

    await b.reopen.handle(MEMBER, id);

    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.status).toBe('open');
    expect(task?.completedAt).toBeNull();
    expect(names(b)).toEqual(['planning.TaskScheduled']);
  });

  it('refuses to reopen a task that is already open', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    await expect(b.reopen.handle(MEMBER, id)).rejects.toThrow(TaskRuleError);
  });
});

describe('deleting a task never touches its status', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  /**
   * The rule this phase is most likely to lose to a tidy-up, so it is asserted
   * for all three statuses rather than for one. The status is the only record
   * of whether the thing was completed, cancelled or never dealt with, and the
   * Deleted view exists to show exactly that.
   */
  it('leaves a completed task completed, and reports it in the Deleted view', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    await b.complete.handle(MEMBER, id);
    await b.remove.handle(MEMBER, id);

    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.status).toBe('completed');
    expect(task?.completedAt).not.toBeNull();
    expect(task?.isDeleted).toBe(true);

    const deleted = await b.query.page(MEMBER, { view: 'deleted' });
    expect(deleted.nodes).toHaveLength(1);
    expect(deleted.nodes[0]?.status).toBe('completed');
  });

  it('leaves a cancelled task cancelled, and reports it in the Deleted view', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Ring the dentist' });
    await b.cancel.handle(MEMBER, id);
    await b.remove.handle(MEMBER, id);

    const deleted = await b.query.page(MEMBER, { view: 'deleted' });
    expect(deleted.nodes[0]?.status).toBe('cancelled');
  });

  it('leaves an untouched task open, and reports it in the Deleted view', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Learn the oboe' });
    await b.remove.handle(MEMBER, id);

    const deleted = await b.query.page(MEMBER, { view: 'deleted' });
    expect(deleted.nodes[0]?.status).toBe('open');
  });

  it('restores with the status it had, rather than reopening it', async () => {
    // A restore that reopened everything would make the Deleted view a trap:
    // recovering something you had finished would put it back on your list.
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    await b.complete.handle(MEMBER, id);
    await b.remove.handle(MEMBER, id);
    await b.restore.handle(MEMBER, id);

    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.isDeleted).toBe(false);
    expect(task?.status).toBe('completed');
  });

  it('does not move the deletion time when a retrying client deletes twice', async () => {
    // The purge horizon is measured from `deletedAt`. A repeated delete that
    // pushed it forward would keep a tombstone alive indefinitely.
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    const first = await b.remove.handle(MEMBER, id);
    const second = await b.remove.handle(MEMBER, id);

    expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());
  });

  it('refuses to erase a task that is not a tombstone', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });

    await expect(b.purge.handle(MEMBER, id)).rejects.toMatchObject({
      code: 'not_deleted',
    });
    expect(b.tasks.rows.size).toBe(1);
  });

  it('refuses a delete dated before the stored row, rather than rewriting history', async () => {
    // The optimistic check is what makes this fail, and it is right to: a write
    // whose `updatedAt` is older than the stored row is a lost update, and
    // accepting a backdated delete would also let a client move the purge
    // horizon into the past and have the row erased on the next sweep.
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });

    await expect(
      b.remove.handle(MEMBER, id, new Date(Date.now() - 40 * 86_400_000)),
    ).rejects.toThrow(/stale write/i);
  });

  it('purges tombstones past the horizon in both collections', async () => {
    const taskId = newId();
    const labelId = newId();
    await b.create.handle(MEMBER, { id: taskId, title: 'Buy milk' });
    await b.createLabel.handle(MEMBER, { id: labelId, name: 'Errands' });
    await b.remove.handle(MEMBER, taskId);
    await b.deleteLabel.handle(MEMBER, labelId);

    // Forty days pass. Simulated in the store rather than by backdating the
    // delete, because the test above is what happens if you try that — and
    // because the horizon is a fact about `deletedAt`, not about how the row
    // came to be deleted.
    const longAgo = new Date(Date.now() - 40 * 86_400_000);
    b.tasks.rows.get(taskId)!.deletedAt = longAgo;
    b.labels.rows.get(labelId)!.deletedAt = longAgo;

    const purged = await b.purge.purgeTombstones(
      new Date(Date.now() - 30 * 86_400_000),
    );

    // One task and one label — the count the sweep reports as `purged` is about
    // rows this context deleted, reported by the context that deleted them.
    expect(purged).toBe(2);
    expect(b.tasks.rows.size).toBe(0);
    expect(b.labels.rows.size).toBe(0);
  });

  it('leaves a tombstone that has not reached the horizon', async () => {
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });
    await b.remove.handle(MEMBER, id);

    const purged = await b.purge.purgeTombstones(
      new Date(Date.now() - 30 * 86_400_000),
    );

    // Deleted a moment ago. A sweep that erased it would take the row away
    // before every device had heard the deletion, and the phone's own copy
    // would then survive the next full snapshot for ever.
    expect(purged).toBe(0);
    expect(b.tasks.rows.size).toBe(1);
  });
});

describe('deferring', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('counts the deferral and records where the task came from', async () => {
    const id = newId();
    const wasDue = new Date(Date.now() + 3_600_000);
    await b.create.handle(MEMBER, { id, title: 'Buy milk', dueAt: wasDue });
    b.uow.events.length = 0;

    const tomorrow = new Date(wasDue.getTime() + 86_400_000);
    const result = await b.defer.handle(MEMBER, id, tomorrow);

    expect(result.deferCount).toBe(1);
    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.dueAt?.getTime()).toBe(tomorrow.getTime());
    expect(task?.deferredFrom?.getTime()).toBe(wasDue.getTime());

    const event = b.uow.events.find((e) => e.name === 'planning.TaskDeferred');
    expect(event?.payload).toMatchObject({ taskId: id, deferCount: 1 });
  });

  it('the rollover counts identically to the member’s own swipe', async () => {
    // The count is a property of deferring, not of the nightly job. A rollover
    // that wrote `dueAt` directly would leave the evening prompt unable to say
    // "carried over ×3" about the very tasks it had been carrying over.
    const byHand = newId();
    const byRhythm = newId();
    const wasDue = new Date(Date.now() + 3_600_000);
    await b.create.handle(MEMBER, { id: byHand, title: 'A', dueAt: wasDue });
    await b.create.handle(MEMBER, { id: byRhythm, title: 'B', dueAt: wasDue });

    const tomorrow = new Date(wasDue.getTime() + 86_400_000);
    await b.defer.handle(MEMBER, byHand, tomorrow);
    await b.rollover.handle(MEMBER, [byRhythm], tomorrow);

    const one = await b.tasks.findById(MEMBER, byHand);
    const two = await b.tasks.findById(MEMBER, byRhythm);
    expect(two?.deferCount).toBe(one?.deferCount);
    expect(two?.deferredFrom?.getTime()).toBe(one?.deferredFrom?.getTime());

    // And the same event, so a consumer cannot tell them apart either.
    const deferrals = b.uow.events.filter(
      (e) => e.name === 'planning.TaskDeferred',
    );
    expect(deferrals).toHaveLength(2);
  });

  it('skips an id that is no longer open rather than abandoning the rest', async () => {
    // The rhythm builds its list from a draft that may be an hour old.
    const done = newId();
    const open = newId();
    await b.create.handle(MEMBER, { id: done, title: 'A', dueAt: new Date() });
    await b.create.handle(MEMBER, { id: open, title: 'B', dueAt: new Date() });
    await b.complete.handle(MEMBER, done);

    const result = await b.rollover.handle(
      MEMBER,
      [done, open],
      new Date(Date.now() + 86_400_000),
    );

    expect(result.moved).toEqual([open]);
    expect(result.skipped).toEqual([done]);
  });
});

describe('skipping an occurrence', () => {
  it('adds an exception and moves the series, leaving the rule intact', async () => {
    const b = bench();
    const id = newId();
    const dueAt = new Date(Date.now() + 3_600_000);
    await b.create.handle(MEMBER, {
      id,
      title: 'Water the plants',
      dueAt,
      allDay: false,
      recurrence: {
        dtstart: dueAt,
        rrule: 'FREQ=DAILY',
        mode: 'schedule',
        exdates: [],
      },
    });
    b.uow.events.length = 0;

    const result = await b.skip.handle(MEMBER, id, dueAt);

    const task = await b.tasks.findById(MEMBER, id);
    // The rule still says "every day" — a member who skips one day still has a
    // daily task.
    expect(task?.recurrence?.rrule).toBe('FREQ=DAILY');
    expect(task?.recurrence?.exdates).toHaveLength(1);
    expect(result.dueAt!.getTime()).toBeGreaterThan(dueAt.getTime());
    expect(names(b)).toEqual(['planning.TaskRescheduled']);
  });

  it('refuses to skip on a task that does not repeat', async () => {
    const b = bench();
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Buy milk' });

    await expect(b.skip.handle(MEMBER, id, new Date())).rejects.toMatchObject({
      code: 'bad_recurrence',
    });
  });
});

describe('labels', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('takes its colour from the registry rather than a literal', async () => {
    // A hard-coded default is a bug by constitution XII. The picker on every
    // surface offers what `labels.palette` holds, and so does this.
    const palette = await b.settings.get('labels.palette');
    const id = newId();
    await b.createLabel.handle(MEMBER, { id, name: 'Work' });

    const label = await b.labels.findById(MEMBER, id);
    expect(palette).toContain(label?.color);
    expect(label?.color).toBe(palette[0]);
  });

  it('gives each new label the next unused palette colour', async () => {
    const palette = await b.settings.get('labels.palette');
    await b.createLabel.handle(MEMBER, { id: newId(), name: 'Work' });
    await b.createLabel.handle(MEMBER, { id: newId(), name: 'Home' });

    const colours = (await b.labels.findAll(MEMBER)).map(
      (label) => label.color,
    );
    expect(colours).toEqual([palette[0], palette[1]]);
  });

  it('refuses a duplicate name, case-insensitively', async () => {
    await b.createLabel.handle(MEMBER, { id: newId(), name: 'Work' });

    await expect(
      b.createLabel.handle(MEMBER, { id: newId(), name: 'work' }),
    ).rejects.toThrow(DuplicateLabelName);
  });

  it('lets another member use the same name', async () => {
    // The uniqueness is per member, which is what the index's leading `userId`
    // is for. A rule that were global would have the first member to say "Work"
    // take the word from everybody.
    await b.createLabel.handle(MEMBER, { id: newId(), name: 'Work' });
    await expect(
      b.createLabel.handle(OTHER, { id: newId(), name: 'Work' }),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('frees the name when a label is deleted, and two tombstones do not collide', async () => {
    // The aggregate unsets `nameLower` on delete and the unique index is
    // partial on that field existing. Two tombstones both lacking it must not
    // collide — Mongo treats a missing field and a null as one value, which is
    // the trap this design avoids and which this asserts.
    const first = newId();
    await b.createLabel.handle(MEMBER, { id: first, name: 'Work' });
    await b.deleteLabel.handle(MEMBER, first);

    const second = newId();
    await b.createLabel.handle(MEMBER, { id: second, name: 'Work' });
    await b.deleteLabel.handle(MEMBER, second);

    // Both tombstones exist side by side, and the name is free a third time.
    expect(b.labels.rows.size).toBe(2);
    await expect(
      b.createLabel.handle(MEMBER, { id: newId(), name: 'Work' }),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('reports nameLower as undefined once tombstoned, which is what unsets it', async () => {
    /*
     * The domain half of a rule the store depends on, and the half that can be
     * checked here.
     *
     * The unique index is partial on `nameLower` *existing*, so a tombstone has
     * to make the field genuinely absent. `undefined` is how the aggregate says
     * so, and `MongoRepositoryBase` turns an undefined value into `$unset`.
     *
     * Getting this wrong was a live defect: the mapper used to *omit* the key
     * instead, and `$set` leaves fields it is not given alone — so the old
     * value stayed in the document, the index kept holding the name, and
     * deleting a label then recreating it was refused as a duplicate. Every
     * spec here passed, because there is no `$set` in memory. The P2 gate
     * caught it against a real Mongo.
     */
    const id = newId();
    await b.createLabel.handle(MEMBER, { id, name: 'Work' });

    const live = await b.labels.findById(MEMBER, id);
    expect(live?.nameLower).toBe('work');

    live!.tombstone();
    expect(live!.nameLower).toBeUndefined();
  });

  it('lets a label keep its own name when the editor is saved unchanged', async () => {
    // Without the id comparison in the handler, renaming a label to what it is
    // already called would refuse — a clash with itself.
    const id = newId();
    await b.createLabel.handle(MEMBER, { id, name: 'Work' });
    await expect(
      b.updateLabel.handle(MEMBER, id, { name: 'Work' }),
    ).resolves.toMatchObject({
      changed: [],
    });
  });

  it('answers a replayed label create as the create that already happened', async () => {
    const id = newId();
    await b.createLabel.handle(MEMBER, { id, name: 'Work' });
    const replay = await b.createLabel.handle(MEMBER, { id, name: 'Work' });

    expect(replay.replayed).toBe(true);
    expect(b.labels.rows.size).toBe(1);
  });

  it('refuses a colour that is not a hex triplet', async () => {
    await expect(
      b.createLabel.handle(MEMBER, {
        id: newId(),
        name: 'Work',
        color: 'teal',
      }),
    ).rejects.toMatchObject({ code: 'bad_color' });
  });
});

describe('the label snapshot on tasks', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('shows the new name on every task after a rename', async () => {
    const labelId = newId();
    await b.createLabel.handle(MEMBER, {
      id: labelId,
      name: 'Work',
      color: '#0f766e',
    });
    const one = newId();
    const two = newId();
    await b.create.handle(MEMBER, { id: one, title: 'A', labelId });
    await b.create.handle(MEMBER, { id: two, title: 'B', labelId });

    await b.updateLabel.handle(MEMBER, labelId, { name: 'Deep work' });
    await b.snapshots.onUpdated(labelEvent(b, 'planning.LabelUpdated'));

    for (const id of [one, two]) {
      const task = await b.tasks.findById(MEMBER, id);
      expect(task?.label?.name).toBe('Deep work');
    }
  });

  it('moves updatedAt, or the rename never reaches the phone', async () => {
    // The phone pulls by cursor. A refresh that left `updatedAt` alone would
    // rename the label on the server and nowhere else.
    const labelId = newId();
    await b.createLabel.handle(MEMBER, { id: labelId, name: 'Work' });
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'A', labelId });
    const before = (await b.tasks.findById(MEMBER, id))!.updatedAt;

    await b.updateLabel.handle(MEMBER, labelId, { name: 'Deep work' });
    await b.snapshots.onUpdated(labelEvent(b, 'planning.LabelUpdated'));

    const after = (await b.tasks.findById(MEMBER, id))!.updatedAt;
    expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('raises no event per task, however many tasks carry the label', async () => {
    // Recolouring one label must not wake the alert saga once per task.
    const labelId = newId();
    await b.createLabel.handle(MEMBER, { id: labelId, name: 'Work' });
    for (let i = 0; i < 5; i += 1) {
      await b.create.handle(MEMBER, { id: newId(), title: `T${i}`, labelId });
    }
    await b.updateLabel.handle(MEMBER, labelId, { color: '#b91c1c' });
    b.uow.events.length = 0;

    await b.snapshots.onUpdated(labelEvent(b, 'planning.LabelUpdated'));

    expect(names(b)).toEqual([]);
  });

  it('clears the chip and the id when the label is deleted', async () => {
    // A task pointing at a label that no longer exists is a dangling reference.
    const labelId = newId();
    await b.createLabel.handle(MEMBER, { id: labelId, name: 'Work' });
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'A', labelId });

    await b.deleteLabel.handle(MEMBER, labelId);
    await b.snapshots.onDeleted(labelEvent(b, 'planning.LabelDeleted'));

    const task = await b.tasks.findById(MEMBER, id);
    expect(task?.label).toBeNull();
    expect(task?.labelId).toBeNull();
    // And the task itself is untouched — a label going away is not a task
    // being finished.
    expect(task?.status).toBe('open');
    expect(task?.isDeleted).toBe(false);
  });

  it('does not touch another member’s tasks', async () => {
    const mine = newId();
    const theirs = newId();
    await b.createLabel.handle(MEMBER, { id: mine, name: 'Work' });
    await b.createLabel.handle(OTHER, { id: theirs, name: 'Work' });
    const myTask = newId();
    const theirTask = newId();
    await b.create.handle(MEMBER, { id: myTask, title: 'A', labelId: mine });
    await b.create.handle(OTHER, {
      id: theirTask,
      title: 'B',
      labelId: theirs,
    });

    await b.updateLabel.handle(MEMBER, mine, { name: 'Deep work' });
    await b.snapshots.onUpdated(labelEvent(b, 'planning.LabelUpdated'));

    expect((await b.tasks.findById(OTHER, theirTask))?.label?.name).toBe(
      'Work',
    );
  });
});

describe('the views, and whose day they are', () => {
  it('puts an overdue task in Today, because a list that hides it loses it', async () => {
    const b = bench();
    const overdue = newId();
    const later = newId();
    await b.create.handle(MEMBER, {
      id: overdue,
      title: 'Yesterday’s thing',
      dueAt: new Date(Date.now() - 2 * 86_400_000),
    });
    await b.create.handle(MEMBER, {
      id: later,
      title: 'Next week',
      dueAt: new Date(Date.now() + 7 * 86_400_000),
    });

    const today = await b.query.page(MEMBER, { view: 'today' });
    expect(today.nodes.map((task) => task.id)).toEqual([overdue]);

    const upcoming = await b.query.page(MEMBER, { view: 'upcoming' });
    expect(upcoming.nodes.map((task) => task.id)).toEqual([later]);
  });

  it('computes the day in the member’s zone, not the server’s', async () => {
    // The assertion that would pass against a broken implementation for most
    // of the day if it ran in UTC: two members, one instant, two different
    // ideas of what day it is.
    const cairo = bench('Africa/Cairo');
    const honolulu = bench('Pacific/Honolulu');

    // A task due at 22:00 UTC. In Cairo that is midnight or 01:00 — already
    // tomorrow. In Honolulu it is midday, still today.
    const at = new Date(`${localDate(new Date(), 'UTC')}T22:00:00.000Z`);
    await cairo.create.handle(MEMBER, {
      id: newId(),
      title: 'Late',
      dueAt: at,
      allDay: false,
    });
    await honolulu.create.handle(MEMBER, {
      id: newId(),
      title: 'Late',
      dueAt: at,
      allDay: false,
    });

    const inCairo = await cairo.query.page(
      MEMBER,
      { view: 'today' },
      new Date(`${localDate(new Date(), 'UTC')}T12:00:00.000Z`),
    );
    const inHonolulu = await honolulu.query.page(
      MEMBER,
      { view: 'today' },
      new Date(`${localDate(new Date(), 'UTC')}T12:00:00.000Z`),
    );

    // The same task, the same instant, on Today for one member and not the
    // other. Which is correct, and is not what the server's own date says.
    expect(inCairo.nodes).toHaveLength(0);
    expect(inHonolulu.nodes).toHaveLength(1);
  });

  it('scopes every view to the member who asked', async () => {
    const b = bench();
    await b.create.handle(MEMBER, {
      id: newId(),
      title: 'Mine',
      dueAt: new Date(),
    });
    await b.create.handle(OTHER, {
      id: newId(),
      title: 'Theirs',
      dueAt: new Date(),
    });

    const mine = await b.query.page(MEMBER, { view: 'today' });
    expect(mine.nodes).toHaveLength(1);
    expect(mine.nodes[0]?.title).toBe('Mine');
  });

  it('counts open tasks per label, and stops counting a completed one', async () => {
    const b = bench();
    const labelId = newId();
    await b.createLabel.handle(MEMBER, { id: labelId, name: 'Work' });
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'A', labelId });

    expect((await b.query.labels(MEMBER))[0]?.openTaskCount).toBe(1);
    await b.complete.handle(MEMBER, id);
    expect((await b.query.labels(MEMBER))[0]?.openTaskCount).toBe(0);
  });

  it('pages with an opaque cursor rather than a skip', async () => {
    const b = bench();
    for (let i = 0; i < 5; i += 1) {
      await b.create.handle(MEMBER, {
        id: newId(),
        title: `T${i}`,
        dueAt: new Date(Date.now() - (5 - i) * 3_600_000),
      });
    }

    const first = await b.query.page(MEMBER, { view: 'today', limit: 2 });
    expect(first.nodes).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await b.query.page(MEMBER, {
      view: 'today',
      limit: 2,
      cursor: first.nextCursor!,
    });
    // No overlap: a skip would have re-read what the first page already showed.
    const ids = new Set(
      [...first.nodes, ...second.nodes].map((task) => task.id),
    );
    expect(ids.size).toBe(first.nodes.length + second.nodes.length);
  });
});

describe('the published surface other contexts read tasks through', () => {
  it('answers what is due on a date, in the member’s zone', async () => {
    const b = bench();
    const today = localDate(new Date(), CAIRO);
    const id = newId();
    // Midday in Cairo today, which is unambiguously today wherever the server is.
    await b.create.handle(MEMBER, {
      id,
      title: 'Lunch thing',
      dueAt: new Date(`${today}T09:00:00.000Z`),
      allDay: false,
    });

    const due = await b.crossContext.dueOn(MEMBER, today);
    expect(due.map((task) => task.id)).toEqual([id]);
  });

  it('answers what is still open before a moment, for the rollover', async () => {
    const b = bench();
    const id = newId();
    await b.create.handle(MEMBER, {
      id,
      title: 'Unfinished',
      dueAt: new Date(Date.now() - 3_600_000),
    });
    const done = newId();
    await b.create.handle(MEMBER, {
      id: done,
      title: 'Finished',
      dueAt: new Date(Date.now() - 3_600_000),
    });
    await b.complete.handle(MEMBER, done);

    const open = await b.crossContext.openBefore(MEMBER, new Date());
    expect(open.map((task) => task.id)).toEqual([id]);
  });

  it('excludes all-day tasks from the agenda window', async () => {
    // An agenda is an hour grid, and "buy milk, some time today" has no hour
    // to sit at. It belongs in the day's task list, a different part of the
    // same screen.
    const b = bench();
    const timed = newId();
    const allDay = newId();
    const soon = new Date(Date.now() + 3_600_000);
    await b.create.handle(MEMBER, {
      id: timed,
      title: 'Timed',
      dueAt: soon,
      allDay: false,
    });
    await b.create.handle(MEMBER, {
      id: allDay,
      title: 'All day',
      dueAt: soon,
      allDay: true,
    });

    const agenda = await b.crossContext.timedBetween(
      MEMBER,
      new Date(Date.now() - 3_600_000),
      new Date(Date.now() + 2 * 3_600_000),
    );
    expect(agenda.map((task) => task.id)).toEqual([timed]);
  });

  it('scopes to the member, whoever is asking', async () => {
    const b = bench();
    const today = localDate(new Date(), CAIRO);
    await b.create.handle(OTHER, {
      id: newId(),
      title: 'Theirs',
      dueAt: new Date(`${today}T09:00:00.000Z`),
      allDay: false,
    });

    expect(await b.crossContext.dueOn(MEMBER, today)).toEqual([]);
  });
});

describe('the unit of work', () => {
  it('refuses a write that raises events outside a transaction', async () => {
    // The aggregate and its outbox entry have to commit together. The
    // in-memory unit of work enforces the same rule the Mongo one does, so a
    // handler that forgot `uow.run` fails here rather than losing events in
    // production.
    const b = bench();
    const tasks = b.tasks;
    const { Task } = await import('./domain/task.aggregate.js');
    const task = Task.schedule({
      id: newId(),
      userId: MEMBER,
      title: 'Unwrapped',
      notes: null,
      dueAt: null,
      allDay: true,
      priority: 4,
      labelId: null,
      label: null,
      recurrence: null,
      estimatedMinutes: null,
      source: 'app',
      createdAt: new Date(),
      timezone: CAIRO,
    });

    await expect(tasks.save(task)).rejects.toThrow(/outside a unit of work/);
  });
});
