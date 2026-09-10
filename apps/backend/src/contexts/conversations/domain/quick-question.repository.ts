import type { ConversationKind } from './conversation.aggregate.js';

/**
 * The tappable question, in both languages.
 *
 * Both are required by the schema and both are stored on one row rather than
 * one row per language, because a question is one thing the Owner seeded and a
 * member picks — a pair of rows joined by a key would let the Arabic half of a
 * question be deleted on its own, which is a state no screen can render.
 */
export interface QuickQuestionText {
  en: string;
  ar: string;
}

/**
 * Which state the question suits, read against the member's latest check-in
 * mood so that a member who reported a bad day is offered a lighter option.
 *
 * `any` is the default and is what a question with no opinion carries. The
 * three values are the schema's; they are spelled here as a union rather than
 * left as `string` so that a seed file with a typo fails to compile instead of
 * seeding a question that matches no mood and is therefore offered to nobody.
 */
export type QuickQuestionMood = 'any' | 'low' | 'ok';

/**
 * One quick question.
 *
 * ## Why this is a row and not an `AggregateRoot`
 *
 * Every other write model in this context extends `AggregateRoot` and is saved
 * through `MongoRepositoryBase`, and this one deliberately does not. Two
 * reasons, and the first is the one that would have forced the shape anyway:
 *
 * 1. **`AggregateRoot` declares `userId: string`, and a seeded global question
 *    has no owner.** `userId: null` is the schema's way of saying "this one
 *    belongs to everybody", which is not a member id and must not be faked as
 *    one. Satisfying the base would mean carrying the ownership twice — an
 *    empty-string `userId` beside an `isGlobal` flag — and two fields for one
 *    fact is two fields that can disagree. The event helper on the base reads
 *    `this.userId` for every event it raises, so the fake would also travel.
 * 2. **It raises no events and has no invariant to protect.** The base exists
 *    for the transactional outbox and the optimistic `updatedAt` filter, and
 *    this collection needs neither: nothing reacts to a quick question being
 *    added, and there is no lost update to guard against because the only edits
 *    are an insert of the member's own question and a delete of it. A
 *    repository taking an outbox model it never writes to would suggest the
 *    collection publishes something.
 *
 * So the mongo adapter here is written against the driver directly rather than
 * inherited from the base. It keeps the base's *shape* — a `Doc` interface, a
 * `Mapper`, one adapter per store — because that is what makes the two
 * implementations comparable; what it does not keep is machinery for events
 * that do not exist.
 */
export interface QuickQuestion {
  /** A client-minted uuidv7 for a member's own; the seed's own key for a global. */
  id: string;
  scope: ConversationKind;
  text: QuickQuestionText;
  mood: QuickQuestionMood;
  /** Ascending. The seed leaves gaps so a later question can sit between two. */
  order: number;
  /** **Null for a seeded global. A member id for their own, and theirs alone.** */
  userId: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The quick questions a chat offers.
 *
 * ## The one rule this port exists to make unbreakable
 *
 * **A member sees the globals plus their own, and nobody else's.** That is the
 * whole of FR-010's second half ("a member's own quick question appears for
 * them only"), and it is expressed as a filter inside the adapter rather than
 * as a `list()` the caller narrows afterwards, because a caller that forgets to
 * narrow leaks one member's questions to every other member and no test of the
 * caller would notice — the leak looks like a longer list.
 *
 * `findById` is scoped the same way and returns **only the member's own**, with
 * globals excluded on purpose. It is what `remove-quick-question` loads
 * through, so "a member deletes a seeded question for everybody" is not a rule
 * the handler has to remember: there is no way to load one.
 */
export abstract class QuickQuestionRepository {
  /**
   * The seeded globals and this member's own, for one chat kind, in `order`.
   *
   * Disabled questions are excluded — `enabled: false` is how the Owner retires
   * a seeded question without deleting rows that members' screens may still be
   * holding a copy of.
   */
  abstract forMember(
    userId: string,
    scope: ConversationKind,
  ): Promise<QuickQuestion[]>;

  /** This member's own question by id. Never a global — see the class comment. */
  abstract findOwn(userId: string, id: string): Promise<QuickQuestion | null>;

  /**
   * Insert or replace by id.
   *
   * An upsert rather than an insert because the id is minted by the client:
   * a retried add is the same question written twice over itself, which is a
   * no-op, where an insert would answer a duplicate-key error to a member whose
   * question is already saved.
   */
  abstract save(question: QuickQuestion): Promise<void>;

  abstract remove(question: QuickQuestion): Promise<void>;

  /**
   * Every question this member added, gone with their account.
   *
   * On the port because `purge-on-deleted` needs it, and it was missing — a
   * deleted member's own quick questions would have outlived them, which is
   * both a privacy leak and a row referencing a `userId` nothing can resolve.
   * Returns the count, so the purge handler's log line is a number somebody
   * can check against the member's screen rather than an assurance.
   *
   * The seeded globals are untouched: `userId: null` is not this member's id,
   * so the filter cannot reach them. That is the same property that stops a
   * member deleting the Owner's questions one at a time, arrived at the same
   * way — by the shape of the query rather than by a guard somebody has to
   * remember.
   */
  abstract removeAllFor(userId: string): Promise<number>;
}
