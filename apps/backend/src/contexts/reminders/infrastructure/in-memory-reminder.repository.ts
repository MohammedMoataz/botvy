import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import { StaleWriteError } from '../../../shared/persistence/ports/errors.js';
import { Reminder, type ReminderState } from '../domain/reminder.aggregate.js';
import {
  ReminderRepository,
  type ReminderListFilter,
  type ReminderPage,
  type ReminderReadRepository,
  type ReminderView,
} from '../domain/reminder.repository.js';

/**
 * The adapter every Reminders handler spec binds. Same three promises as the
 * Planning ones: events pulled on save, `StaleWriteError` on an older copy, and
 * the read predicates written to match the Mongo adapter's exactly — including
 * the two-branch effective-moment filter, because a view whose definition
 * differs between the two is a view whose spec proves nothing.
 */
@Injectable()
export class InMemoryReminderRepository extends ReminderRepository {
  readonly rows = new Map<string, ReminderState>();
  readonly events: DomainEvent[] = [];

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async findById(userId: string, id: string): Promise<Reminder | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Reminder.rehydrate(structuredClone(row));
  }

  async save(reminder: Reminder): Promise<void> {
    const existing = this.rows.get(reminder.id);
    if (existing && existing.updatedAt > reminder.updatedAt) {
      throw new StaleWriteError(reminder.id);
    }
    this.#raise(reminder.pullEvents());
    this.rows.set(reminder.id, {
      id: reminder.id,
      userId: reminder.userId,
      title: reminder.title,
      remindAt: reminder.remindAt,
      leadTimes: reminder.leadTimes,
      status: reminder.status,
      snoozedUntil: reminder.snoozedUntil,
      source: reminder.source,
      createdAt: reminder.createdAt,
      updatedAt: reminder.updatedAt,
      deletedAt: reminder.deletedAt,
    });
  }

  async remove(reminder: Reminder): Promise<void> {
    this.#raise(reminder.pullEvents());
    this.rows.delete(reminder.id);
  }

  /**
   * To the unit of work, which is what a handler spec asserts against, and to
   * this adapter's own list, which is what a spec needs when it wants the
   * events one aggregate raised rather than everything the transaction did.
   */
  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }

  async pullSince(userId: string, since: Date | null): Promise<Reminder[]> {
    return [...this.rows.values()]
      .filter(
        (row) => row.userId === userId && (!since || row.updatedAt > since),
      )
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => Reminder.rehydrate(structuredClone(row)));
  }

  async purgeTombstonesBefore(before: Date, userId?: string): Promise<number> {
    let purged = 0;
    for (const [id, row] of this.rows) {
      if (userId && row.userId !== userId) continue;
      if (row.deletedAt && row.deletedAt < before) {
        this.rows.delete(id);
        purged += 1;
      }
    }
    return purged;
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

@Injectable()
export class InMemoryReminderReadRepository implements ReminderReadRepository {
  constructor(private readonly store: InMemoryReminderRepository) {}

  async page(
    userId: string,
    filter: ReminderListFilter,
  ): Promise<ReminderPage> {
    const mine = [...this.store.rows.values()].filter(
      (row) => row.userId === userId,
    );

    const matches = mine.filter((row) => {
      const effective = row.snoozedUntil ?? row.remindAt;
      switch (filter.view) {
        case 'upcoming':
          return (
            row.deletedAt === null &&
            row.status === 'active' &&
            effective >= filter.now
          );
        case 'overdue':
          return (
            row.deletedAt === null &&
            row.status === 'active' &&
            effective < filter.now
          );
        case 'done':
          return (
            row.deletedAt === null &&
            (row.status === 'done' || row.status === 'cancelled')
          );
        case 'deleted':
          return row.deletedAt !== null;
      }
    });

    const sorted = matches.sort((a, b) => {
      if (filter.view === 'done')
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (filter.view === 'deleted') {
        return (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0);
      }
      return a.remindAt.getTime() - b.remindAt.getTime();
    });

    const after = filter.cursor
      ? Number(Buffer.from(filter.cursor, 'base64url').toString('utf8'))
      : null;
    const paged =
      after === null
        ? sorted
        : sorted.filter((row) => row.updatedAt.getTime() > after);

    const hasMore = paged.length > filter.limit;
    const nodes = (hasMore ? paged.slice(0, filter.limit) : paged).map(viewOf);

    return {
      nodes,
      nextCursor: hasMore
        ? Buffer.from(
            String(nodes[nodes.length - 1]!.updatedAt.getTime()),
            'utf8',
          ).toString('base64url')
        : null,
    };
  }

  async byId(userId: string, id: string): Promise<ReminderView | null> {
    const row = this.store.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return viewOf(row);
  }
}

function viewOf(row: ReminderState): ReminderView {
  return {
    id: row.id,
    title: row.title,
    remindAt: row.remindAt,
    effectiveAt: row.snoozedUntil ?? row.remindAt,
    leadTimes: row.leadTimes,
    status: row.status,
    snoozedUntil: row.snoozedUntil,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
