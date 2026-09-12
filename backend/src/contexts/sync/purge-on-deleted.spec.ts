import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { NotificationsPurgeOnDeletedHandler } from '../notifications/features/purge-on-deleted/purge-on-deleted.handler.js';
import { InMemoryAlertRepository } from '../notifications/infrastructure/in-memory-alert.repository.js';
import { PlanningPurgeOnDeletedHandler } from '../planning/features/purge-on-deleted/purge-on-deleted.handler.js';
import {
  InMemoryLabelRepository,
  InMemoryTaskRepository,
} from '../planning/infrastructure/in-memory-planning.repositories.js';
import { Label } from '../planning/domain/label.aggregate.js';
import { Task } from '../planning/domain/task.aggregate.js';
import { RemindersPurgeOnDeletedHandler } from '../reminders/features/purge-on-deleted/purge-on-deleted.handler.js';
import { Reminder } from '../reminders/domain/reminder.aggregate.js';
import { InMemoryReminderRepository } from '../reminders/infrastructure/in-memory-reminder.repository.js';
import { Alert } from '../notifications/domain/alert.aggregate.js';

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';

function deleted(userId: string): DomainEvent {
  return {
    eventId: newId(),
    name: 'identity.UserDeleted',
    context: 'identity',
    aggregate: { type: 'user', id: userId },
    userId,
    occurredAt: new Date(),
    payload: {},
    schemaVersion: 1,
  };
}

/**
 * Every context that holds something about a member purges it when the account
 * goes, and every one of them is idempotent — because the relay delivers at
 * least once, so two deliveries have to collapse to one purge.
 *
 * Tested together rather than one spec per context, because the property that
 * matters is a property of the *set*: four handlers, one event, nothing left
 * behind. A context that forgets to join is invisible in its own spec file and
 * obvious here.
 */
describe('purging a deleted member', () => {
  it('removes a member’s tasks and labels, tombstones included', async () => {
    const uow = new InMemoryUnitOfWork();
    const tasks = new InMemoryTaskRepository(uow);
    const labels = new InMemoryLabelRepository(uow);
    const handler = new PlanningPurgeOnDeletedHandler(uow, tasks, labels);

    await uow.run(async () => {
      const live = Task.schedule({
        id: newId(),
        userId: MEMBER,
        title: 'Live',
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
      const gone = Task.schedule({
        ...spread(live),
        id: newId(),
        title: 'Deleted',
      });
      gone.tombstone();
      await tasks.save(live);
      await tasks.save(gone);
      await labels.save(
        Label.create({
          id: newId(),
          userId: MEMBER,
          name: 'Work',
          color: '#0f766e',
          sortOrder: 0,
          createdAt: new Date(),
        }),
      );
    });

    expect(await handler.handle(deleted(MEMBER))).toBe('purged');
    expect(tasks.rows.size).toBe(0);
    expect(labels.rows.size).toBe(0);
  });

  it('leaves another member’s rows alone', async () => {
    const uow = new InMemoryUnitOfWork();
    const tasks = new InMemoryTaskRepository(uow);
    const labels = new InMemoryLabelRepository(uow);
    const handler = new PlanningPurgeOnDeletedHandler(uow, tasks, labels);

    await uow.run(async () => {
      for (const owner of [MEMBER, OTHER]) {
        await tasks.save(
          Task.schedule({
            id: newId(),
            userId: owner,
            title: owner,
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
          }),
        );
      }
    });

    await handler.handle(deleted(MEMBER));

    expect(tasks.rows.size).toBe(1);
    expect([...tasks.rows.values()][0]?.userId).toBe(OTHER);
  });

  it('is a no-op on a second delivery', async () => {
    // The relay is at-least-once, so this is the ordinary case rather than an
    // edge. The second delivery must report nothing rather than fail.
    const uow = new InMemoryUnitOfWork();
    const tasks = new InMemoryTaskRepository(uow);
    const labels = new InMemoryLabelRepository(uow);
    const handler = new PlanningPurgeOnDeletedHandler(uow, tasks, labels);

    await uow.run(async () => {
      await tasks.save(
        Task.schedule({
          id: newId(),
          userId: MEMBER,
          title: 'X',
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
        }),
      );
    });

    expect(await handler.handle(deleted(MEMBER))).toBe('purged');
    expect(await handler.handle(deleted(MEMBER))).toBe('nothing-to-do');
  });

  it('removes a member’s reminders', async () => {
    const uow = new InMemoryUnitOfWork();
    const reminders = new InMemoryReminderRepository(uow);
    const handler = new RemindersPurgeOnDeletedHandler(uow, reminders);

    await uow.run(async () => {
      await reminders.save(
        Reminder.schedule({
          id: newId(),
          userId: MEMBER,
          title: 'Call Dad',
          remindAt: new Date(Date.now() + 3_600_000),
          leadTimes: ['0m'],
          source: 'app',
          createdAt: new Date(),
        }),
      );
    });

    expect(await handler.handle(deleted(MEMBER))).toBe('purged');
    expect(reminders.rows.size).toBe(0);
    expect(await handler.handle(deleted(MEMBER))).toBe('nothing-to-do');
  });

  it('removes a member’s alerts, which is the purge that would otherwise *do* something', async () => {
    /*
     * The most urgent of the four. An alert that survives the account is an
     * alert the sweep will happily deliver — so a member who deleted their
     * account would keep hearing from it. In practice the push token goes with
     * the account and the send would fail, but relying on a failure elsewhere
     * to prevent a notification is a coincidence, not a design.
     */
    const uow = new InMemoryUnitOfWork();
    const alerts = new InMemoryAlertRepository(uow);
    const handler = new NotificationsPurgeOnDeletedHandler(uow, alerts);

    await uow.run(async () => {
      await alerts.save(
        Alert.plan({
          id: alerts.nextId(),
          userId: MEMBER,
          source: { kind: 'reminder', id: newId(), occurrenceAt: new Date() },
          label: '0m',
          notifyAt: new Date(Date.now() + 3_600_000),
          title: 'Call Dad',
          body: '',
          deepLink: '',
          plannedAt: new Date(),
        }),
      );
      // A sent alert too, and it goes as well: it is a record *about* a member
      // who has asked to be forgotten.
      const sent = Alert.plan({
        id: alerts.nextId(),
        userId: MEMBER,
        source: { kind: 'task', id: newId(), occurrenceAt: new Date() },
        label: '0m',
        notifyAt: new Date(Date.now() - 3_600_000),
        title: 'Done',
        body: '',
        deepLink: '',
        plannedAt: new Date(Date.now() - 7_200_000),
      });
      sent.markSent(['device-1']);
      await alerts.save(sent);
    });

    expect(await handler.handle(deleted(MEMBER))).toBe('purged');
    expect(alerts.rows.size).toBe(0);
  });

  it('reports nothing to do when the event carries no member', async () => {
    // A malformed event must not throw and stall the relay behind it.
    const uow = new InMemoryUnitOfWork();
    const reminders = new InMemoryReminderRepository(uow);
    const handler = new RemindersPurgeOnDeletedHandler(uow, reminders);

    const event = { ...deleted(MEMBER), userId: null };
    expect(await handler.handle(event)).toBe('nothing-to-do');
  });
});

/** The scheduling arguments of an existing task, for building a sibling. */
function spread(task: Task) {
  return {
    userId: task.userId,
    title: task.title,
    notes: task.notes,
    dueAt: task.dueAt,
    allDay: task.allDay,
    priority: task.priority,
    labelId: task.labelId,
    label: task.label,
    recurrence: task.recurrence,
    estimatedMinutes: task.estimatedMinutes,
    source: task.source,
    createdAt: task.createdAt,
    timezone: CAIRO,
  };
}
