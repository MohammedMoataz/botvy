import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../cqrs/domain-event.js';
import { UnitOfWork } from '../ports/unit-of-work.js';
import type { PrismaService, PrismaTransaction } from './prisma.service.js';

interface TransactionScope {
  tx: PrismaTransaction;
  commitCallbacks: Array<() => Promise<void>>;
}

/**
 * Identity's transaction. Its repositories cannot append to the Mongo outbox —
 * that would be a second store in the same logical write — so instead they
 * write the aggregate's events to the PostgreSQL `identity_outbox` table
 * **inside this transaction**, and the worker's forwarder copies them across.
 *
 * The alternative, writing to Mongo after the Postgres commit, is at-most-once:
 * a crash between the two loses the event with no trace that it was ever owed.
 * The table makes the hop at-least-once, which is what every consumer is built
 * to tolerate.
 */
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  static readonly storage = new AsyncLocalStorage<TransactionScope>();

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** The transaction client in force, or the base client outside one. */
  static currentTx(): PrismaTransaction | null {
    return PrismaUnitOfWork.storage.getStore()?.tx ?? null;
  }

  async run<R>(work: () => Promise<R>): Promise<R> {
    const existing = PrismaUnitOfWork.storage.getStore();
    if (existing) return work();

    let commitCallbacks: Array<() => Promise<void>> = [];

    const result = await this.prisma.$transaction(async (tx: PrismaTransaction) => {
      const scope: TransactionScope = { tx, commitCallbacks: [] };
      const value = await PrismaUnitOfWork.storage.run(scope, work);
      commitCallbacks = scope.commitCallbacks;
      return value;
    });

    for (const callback of commitCallbacks) await callback();
    return result as R;
  }

  onCommit(callback: () => Promise<void>): void {
    const scope = PrismaUnitOfWork.storage.getStore();
    if (!scope) {
      throw new Error('onCommit called outside a unit of work; there is no commit to hang it on.');
    }
    scope.commitCallbacks.push(callback);
  }
}

/**
 * The rows the forwarder later picks up. Shaped from the envelope, minus
 * `context`: the table has no such column and needs none, because every name is
 * `<context>.<Event>` and the forwarder splits it on the dot. One source for a
 * value cannot drift from itself; two columns holding the same fact can.
 */
export function toIdentityOutboxRow(event: DomainEvent): {
  id: string;
  name: string;
  aggregate: unknown;
  userId: string | null;
  payload: unknown;
  schemaVersion: number;
  occurredAt: Date;
} {
  return {
    id: event.eventId,
    name: event.name,
    aggregate: event.aggregate,
    userId: event.userId,
    payload: event.payload,
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt,
  };
}
