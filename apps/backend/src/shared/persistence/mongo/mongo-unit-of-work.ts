import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { UnitOfWork } from '../ports/unit-of-work.js';

interface TransactionScope {
  session: ClientSession;
  commitCallbacks: Array<() => Promise<void>>;
}

/**
 * One Mongo transaction, carried on AsyncLocalStorage so a repository deep in a
 * handler can find the session without it being threaded through every call.
 * That is what lets `MongoRepositoryBase.save` write the document and append the
 * aggregate's events to the outbox in the *same* session: publishing straight to
 * the event bus after `save()` loses events on a crash.
 *
 * A nested `run` joins the outer transaction rather than opening a second one.
 */
@Injectable()
export class MongoUnitOfWork extends UnitOfWork {
  static readonly storage = new AsyncLocalStorage<TransactionScope>();

  constructor(@InjectConnection() private readonly connection: Connection) {
    super();
  }

  /** The session in force, or null outside a transaction. */
  static currentSession(): ClientSession | null {
    return MongoUnitOfWork.storage.getStore()?.session ?? null;
  }

  async run<R>(work: () => Promise<R>): Promise<R> {
    const existing = MongoUnitOfWork.storage.getStore();
    if (existing) return work();

    const session = await this.connection.startSession();
    const scope: TransactionScope = { session, commitCallbacks: [] };

    try {
      let result!: R;
      await session.withTransaction(async () => {
        result = await MongoUnitOfWork.storage.run(scope, work);
      });

      // Only after the transaction committed. A socket nudge for a row that was
      // never written is worse than a late one.
      for (const callback of scope.commitCallbacks) await callback();
      return result;
    } finally {
      await session.endSession();
    }
  }

  onCommit(callback: () => Promise<void>): void {
    const scope = MongoUnitOfWork.storage.getStore();
    if (!scope) {
      throw new Error('onCommit called outside a unit of work; there is no commit to hang it on.');
    }
    scope.commitCallbacks.push(callback);
  }
}
