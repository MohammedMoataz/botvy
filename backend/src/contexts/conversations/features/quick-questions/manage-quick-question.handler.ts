import { Injectable } from '@nestjs/common';
import { isUuid } from '../../../../shared/cqrs/ids.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { ConversationKind } from '../../domain/conversation.aggregate.js';
import {
  QuickQuestionRepository,
  type QuickQuestion,
} from '../../domain/quick-question.repository.js';

export class InvalidQuickQuestion extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidQuickQuestion';
  }
}

export class QuickQuestionNotYours extends Error {
  constructor(id: string) {
    super(`No quick question ${id} of yours.`);
    this.name = 'QuickQuestionNotYours';
  }
}

/** Where a member's own question sits: after every seeded one. */
export const MEMBER_ORDER_BASE = 1_000;

/**
 * A member's own quick question, added and removed.
 *
 * ## Two rules, and the second is enforced by the port rather than by this file
 *
 * **A member's own question appears for them only** (FR-010). The list query
 * filters it; this handler stamps `userId` and never accepts one from the
 * caller, so there is no shape of request that adds a question to somebody
 * else's chat.
 *
 * **A member cannot remove a seeded one.** That is not a check here — it is
 * `QuickQuestionRepository.findOwn`, which returns only rows with this
 * member's id and excludes the globals on purpose. There is no way to *load* a
 * seeded question through this handler, so "a member deletes the Owner's
 * question for everybody" is not a rule anybody has to remember; it is a
 * capability that does not exist. A `findById` plus an `if` would have been the
 * same behaviour and one forgotten `if` away from the opposite.
 *
 * ## Both languages, from a member who wrote one
 *
 * The row carries `en` and `ar`, and a member types one sentence. Storing
 * their text in both is the honest answer: it is what they wrote, in whatever
 * language they wrote it, and it is *theirs* — nobody else will ever read it,
 * so there is nothing to translate for. Copying rather than leaving the other
 * blank keeps every reader of the row simple, and the alternative — a nullable
 * half — would mean the list query needed a fallback that could produce an
 * empty chip.
 */
@Injectable()
export class ManageQuickQuestionHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly questions: QuickQuestionRepository,
  ) {}

  async add(input: {
    userId: string;
    /** Client-minted, so a retried add writes the same row over itself. */
    id: string;
    scope: ConversationKind;
    text: string;
    at?: Date;
  }): Promise<QuickQuestion> {
    if (!isUuid(input.id)) {
      throw new InvalidQuickQuestion('A quick question needs a UUID id.');
    }

    const text = input.text.trim();
    if (text.length === 0) {
      throw new InvalidQuickQuestion('A quick question cannot be empty.');
    }
    if (text.length > MAX_QUESTION) {
      throw new InvalidQuickQuestion(
        `A quick question has to fit on a chip — ${MAX_QUESTION} characters at most.`,
      );
    }

    const at = input.at ?? new Date();
    const question: QuickQuestion = {
      id: input.id,
      scope: input.scope,
      text: { en: text, ar: text },
      /*
       * `any`, always, and a member cannot set it.
       *
       * `mood` decides which questions are lifted for somebody having a bad
       * day, and that is a curation decision the Owner makes over the seeded
       * set. A member's own question is one they wrote because they ask it
       * often; letting them tag it `low` would let them push it above the
       * Owner's gentler options on exactly the day those exist for.
       */
      mood: 'any',
      order: MEMBER_ORDER_BASE,
      userId: input.userId,
      enabled: true,
      createdAt: at,
      updatedAt: at,
    };

    await this.uow.run(() => this.questions.save(question));
    return question;
  }

  async remove(userId: string, id: string): Promise<void> {
    const question = await this.questions.findOwn(userId, id);
    // Not theirs, not there, or seeded — all three answer the same way, and
    // that is deliberate. A distinct "that one is the Owner's" would tell a
    // member which ids exist globally, and there is nothing they could do with
    // the answer.
    if (!question) throw new QuickQuestionNotYours(id);
    await this.uow.run(() => this.questions.remove(question));
  }
}

/** A chip, not a paragraph. */
export const MAX_QUESTION = 120;
