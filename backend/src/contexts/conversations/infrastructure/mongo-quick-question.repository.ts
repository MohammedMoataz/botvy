import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import type { ConversationKind } from '../domain/conversation.aggregate.js';
import {
  QuickQuestionRepository,
  type QuickQuestion,
} from '../domain/quick-question.repository.js';

/**
 * The stored quick question.
 *
 * `_id` is a string and stays one: `QuickQuestionSchema` declares
 * `_id: { type: String }` with `_id: false` on the options, so unlike
 * `messages` there is no ObjectId round trip to undo in the mapper. That is
 * deliberate on the schema's part — a member's own question is a row the phone
 * could create offline, so its id is a client-minted uuidv7, and the seeded
 * globals carry the seed's own readable keys.
 */
export interface QuickQuestionDoc {
  _id: string;
  scope: ConversationKind;
  text: { en: string; ar: string };
  mood: string;
  order: number;
  userId: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  schemaVersion: number;
}

const mapper: Mapper<QuickQuestion, QuickQuestionDoc> = {
  toDomain(doc) {
    return {
      id: doc._id,
      scope: doc.scope,
      text: { en: doc.text.en, ar: doc.text.ar },
      /*
       * Narrowed rather than cast, and defaulted to `any` on anything else.
       *
       * The schema types `mood` as a bare string with a default, so a seed file
       * or a future migration can put any word in it. A row whose mood is a
       * typo would otherwise be a `QuickQuestionMood` at the type level and
       * match no branch at runtime — which for this collection means a question
       * that is offered to nobody, silently, for as long as the typo lives.
       * Reading it as `any` shows the question to everybody instead, which is
       * the failure a member can see and report.
       */
      mood: doc.mood === 'low' || doc.mood === 'ok' ? doc.mood : 'any',
      order: doc.order,
      userId: doc.userId ?? null,
      enabled: doc.enabled,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  },
  toPersistence(question) {
    return {
      _id: question.id,
      scope: question.scope,
      text: question.text,
      mood: question.mood,
      order: question.order,
      // Written as an explicit null for a global rather than omitted. The
      // uniqueness rule over this collection is not the problem here — the
      // *query* is: `forMember` asks for `{ userId: null }`, which in Mongo
      // matches a missing field as well as an explicit null, and a row that
      // relied on that would break the moment somebody tightened the filter to
      // `{ userId: { $type: 'null' } }`. The document says what it means.
      userId: question.userId,
      enabled: question.enabled,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      schemaVersion: 1,
    };
  },
};

/**
 * `quick_questions` against Mongo.
 *
 * Written against the model directly rather than through `MongoRepositoryBase`
 * — `quick-question.repository.ts` carries the argument at length: there are no
 * events to put through the outbox and no lost update to refuse, and the base's
 * `userId: string` cannot express a global question's absent owner.
 *
 * Every read joins `MongoUnitOfWork.currentSession()` all the same, so a
 * handler that reads a question inside a transaction sees that transaction's
 * own writes. An adapter that skipped the session would read around it, which
 * is the sort of difference that shows up once, under load, in the one code
 * path nobody wrote a spec for.
 */
@Injectable()
export class MongoQuickQuestionRepository extends QuickQuestionRepository {
  constructor(private readonly model: Model<QuickQuestionDoc>) {
    super();
  }

  /**
   * The globals plus this member's own, in `order` then `createdAt`.
   *
   * `$or` rather than `userId: { $in: [null, userId] }` — the two are the same
   * query to Mongo, and the `$or` is written out because it is the *rule*: two
   * disjoint sets, one shared and one private. A reader who has to decide
   * whether `$in` with a null is doing something clever has to go and check.
   *
   * `createdAt` breaks the tie because the seed hands several questions the
   * same `order` on purpose (they are alternatives at the same rank), and an
   * unbroken tie means the list comes back in whichever order the index walk
   * happened to produce — which is a screen whose chips move between two loads
   * for no reason the member can see.
   */
  async forMember(
    userId: string,
    scope: ConversationKind,
  ): Promise<QuickQuestion[]> {
    const docs = await this.model
      .find({
        scope,
        enabled: true,
        $or: [{ userId: null }, { userId }],
      })
      .sort({ order: 1, createdAt: 1 })
      .session(MongoUnitOfWork.currentSession())
      .lean<QuickQuestionDoc[]>()
      .exec();
    return docs.map((doc) => mapper.toDomain(doc));
  }

  /**
   * The member's own by id.
   *
   * `userId` is in the filter and a global's null never matches a member id, so
   * "remove somebody else's question" and "remove a seeded one" are both
   * answered by the same empty result — and the caller cannot tell them apart
   * from "no such question", which is the same reasoning FR-020 applies to
   * conversations: a distinguishable answer is an oracle for what exists.
   */
  async findOwn(userId: string, id: string): Promise<QuickQuestion | null> {
    const doc = await this.model
      .findOne({ _id: id, userId })
      .session(MongoUnitOfWork.currentSession())
      .lean<QuickQuestionDoc>()
      .exec();
    return doc ? mapper.toDomain(doc) : null;
  }

  async save(question: QuickQuestion): Promise<void> {
    const doc = mapper.toPersistence(question);
    await this.model
      .updateOne({ _id: question.id }, { $set: doc }, {
        upsert: true,
        session: MongoUnitOfWork.currentSession() ?? undefined,
      })
      .exec();
  }

  async remove(question: QuickQuestion): Promise<void> {
    // Filtered on the owner as well as the id, so a caller that loaded through
    // something other than `findOwn` still cannot delete a global.
    await this.model
      .deleteOne({ _id: question.id, userId: question.userId })
      .session(MongoUnitOfWork.currentSession())
      .exec();
  }

  async removeAllFor(userId: string): Promise<number> {
    // `userId: userId` and never `$or` with null: the seeded globals carry
    // null, and a filter that could reach them would empty every member's
    // chips the first time one account was deleted.
    const result = await this.model
      .deleteMany({ userId })
      .session(MongoUnitOfWork.currentSession())
      .exec();
    return result.deletedCount ?? 0;
  }
}
