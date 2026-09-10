import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { SeqPort } from '../domain/conversations.repositories.js';

/** The stored counter. One document per member, `_id` carrying the member's id. */
export interface CounterDoc {
  _id: string;
  value: number;
}

/**
 * `"<userId>:messages"`, the counter document's id.
 *
 * Namespaced rather than the bare user id, because `counters` is a general
 * collection and P4 onwards will want a second sequence for something else. A
 * row keyed on the user alone would have to be migrated to make room for it,
 * and migrations only go forward.
 */
export const messageCounterId = (userId: string): string =>
  `${userId}:messages`;

/**
 * Where a `seq` comes from.
 *
 * ## Why this is a store operation and not an aggregate one
 *
 * Because two writers must never receive the same number, and an aggregate
 * cannot promise that. An aggregate holding `nextSeq` would be loaded, read,
 * incremented and saved — four steps with three `await` boundaries between the
 * read and the write. A member with a phone and an open browser tab appending
 * at the same moment loads the same value into both, both compute `seq + 1`,
 * and both write it. The optimistic filter on `updatedAt` does not save it
 * either: the two saves are the same millisecond and each one's copy is "not
 * older than" the stored row, so both are accepted. Two messages then share a
 * sequence number, and because the phone pulls `seq > lastSeq` and messages are
 * immutable, one of them is invisible on that device forever — there is no
 * `updatedAt` to change and no tombstone to send that would make it re-appear.
 *
 * `findOneAndUpdate` with `$inc` is one round trip that both reads and writes,
 * so the server serialises the two callers and each gets a distinct number.
 * That is the same shape of guarantee, for the same reason, as the alert
 * sweep's atomic claim.
 *
 * ## Why it deliberately does not join the caller's transaction
 *
 * None of these calls pass `MongoUnitOfWork.currentSession()`, and that is the
 * decision, not an omission. An `$inc` inside an uncommitted transaction is
 * invisible to every other writer until commit, which puts back exactly the
 * race above: both devices would read the same value inside their own
 * transactions. Issuing outside means a transaction that later rolls back
 * leaves its number unused — a gap in the sequence — and a gap costs nothing,
 * because the cursor is `seq > lastSeq` and not `lastSeq + 1`. A duplicate
 * would cost a lost message; a gap costs an integer.
 */
@Injectable()
export class MongoSeq extends SeqPort {
  constructor(private readonly model: Model<CounterDoc>) {
    super();
  }

  async next(userId: string): Promise<number> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: messageCounterId(userId) },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<CounterDoc>()
      .exec();
    /*
     * `returnDocument: 'after'` on an upsert returns the inserted document, so
     * the null branch is unreachable in practice. It is written as `?? 1`
     * rather than a throw because the first number a member is ever issued is
     * 1: the schema defaults `value` to 0 and the `$inc` runs on the upserted
     * document, so falling back to anything else — 0 especially — would hand
     * out a number the next call also hands out.
     */
    return doc?.value ?? 1;
  }

  async current(userId: string): Promise<number> {
    const doc = await this.model
      .findOne({ _id: messageCounterId(userId) })
      .lean<CounterDoc>()
      .exec();
    // A member who has never been written to has issued nothing, and a cursor
    // of 0 means "send me everything from the start" — which is correct for
    // them and stays correct after their first message.
    return doc?.value ?? 0;
  }

  async reset(userId: string): Promise<void> {
    await this.model.deleteOne({ _id: messageCounterId(userId) }).exec();
  }
}
