import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import {
  Alert,
  type AlertSource,
  type AlertState,
} from '../domain/alert.aggregate.js';
import { AlertRepository } from '../domain/alert.repository.js';

/**
 * The adapter every Notifications spec binds.
 *
 * `claim` is the method that has to be right here, because it is the one whose
 * real implementation is a store primitive. The Mongo adapter claims with a
 * single `findOneAndUpdate` filtered on `claimedAt: null`; this one checks and
 * writes in the same synchronous turn, which gives the same guarantee for the
 * same reason — nothing can interleave between the check and the write.
 *
 * That is what lets a spec assert "two concurrent sweeps send once" and have
 * the assertion mean something. An adapter that loaded, awaited, then wrote
 * would let both sweeps win and the spec would be testing the adapter's own
 * bug rather than the sweep's correctness.
 */
@Injectable()
export class InMemoryAlertRepository extends AlertRepository {
  readonly rows = new Map<string, AlertState>();
  readonly events: DomainEvent[] = [];

  #sequence = 0;

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  /** Stands in for an ObjectId. Monotonic, so insertion order is recoverable. */
  nextId(): string {
    this.#sequence += 1;
    return `alert-${String(this.#sequence).padStart(8, '0')}`;
  }

  async findById(userId: string, id: string): Promise<Alert | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return Alert.rehydrate(structuredClone(row));
  }

  async save(alert: Alert): Promise<void> {
    this.#raise(alert.pullEvents());
    this.rows.set(alert.id, stateOf(alert));
  }

  async remove(alert: Alert): Promise<void> {
    this.#raise(alert.pullEvents());
    this.rows.delete(alert.id);
  }

  async pendingForSource(
    userId: string,
    source: Pick<AlertSource, 'kind' | 'id'>,
  ): Promise<Alert[]> {
    return this.#all()
      .filter(
        (row) =>
          row.userId === userId &&
          row.source.kind === source.kind &&
          row.source.id === source.id &&
          row.sentAt === null,
      )
      .map((row) => Alert.rehydrate(structuredClone(row)));
  }

  async deletePendingForSource(
    userId: string,
    source: Pick<AlertSource, 'kind' | 'id'>,
  ): Promise<number> {
    let deleted = 0;
    for (const [id, row] of this.rows) {
      if (
        row.userId === userId &&
        row.source.kind === source.kind &&
        row.source.id === source.id &&
        row.sentAt === null
      ) {
        this.rows.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  async dueUnsent(now: Date, limit: number): Promise<Alert[]> {
    return this.#all()
      .filter((row) => row.sentAt === null && row.notifyAt <= now)
      .sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime())
      .slice(0, limit)
      .map((row) => Alert.rehydrate(structuredClone(row)));
  }

  async pendingForMember(userId: string, from: Date): Promise<Alert[]> {
    return this.#all()
      .filter(
        (row) =>
          row.userId === userId && row.sentAt === null && row.notifyAt >= from,
      )
      .sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime())
      .map((row) => Alert.rehydrate(structuredClone(row)));
  }

  async upcomingForMember(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<Alert[]> {
    return this.#all()
      .filter(
        (row) =>
          row.userId === userId &&
          row.sentAt === null &&
          row.notifyAt >= from &&
          row.notifyAt < to,
      )
      .sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime())
      .map((row) => Alert.rehydrate(structuredClone(row)));
  }

  /**
   * Check and write with no `await` between them, which is what makes this
   * exclusive in a single-threaded runtime — the same guarantee the store's
   * `findOneAndUpdate` gives, by a different mechanism.
   */
  async claim(id: string, at: Date): Promise<Alert | null> {
    const row = this.rows.get(id);
    if (!row || row.claimedAt !== null || row.sentAt !== null) return null;
    row.claimedAt = at;
    row.updatedAt = at;
    return Alert.rehydrate(structuredClone(row));
  }

  async expiredUnsent(before: Date, limit: number): Promise<Alert[]> {
    return this.#all()
      .filter((row) => row.sentAt === null && row.notifyAt < before)
      .sort((a, b) => a.notifyAt.getTime() - b.notifyAt.getTime())
      .slice(0, limit)
      .map((row) => Alert.rehydrate(structuredClone(row)));
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

  #all(): AlertState[] {
    return [...this.rows.values()];
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

function stateOf(alert: Alert): AlertState {
  return {
    id: alert.id,
    userId: alert.userId,
    source: alert.source,
    label: alert.label,
    notifyAt: alert.notifyAt,
    title: alert.title,
    body: alert.body,
    deepLink: alert.deepLink,
    plannedAt: alert.plannedAt,
    claimedAt: alert.claimedAt,
    sentAt: alert.sentAt,
    failedAt: alert.failedAt,
    error: alert.error,
    updatedAt: alert.updatedAt,
  };
}
