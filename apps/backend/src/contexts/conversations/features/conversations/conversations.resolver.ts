import { ForbiddenException } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Int,
  ObjectType,
  Query,
  Resolver,
  registerEnumType,
} from '@nestjs/graphql';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { DateTimeScalar, JSONScalar } from '../../../../graphql/scalars.js';
import { ConversationForbidden } from '../../domain/conversation-access.js';
import { MessagesQueryHandler } from '../messages/messages.query.js';
import { ConversationsQueryHandler } from './conversations.query.js';
import { QuickQuestionsQueryHandler } from '../quick-questions/quick-questions.query.js';

/**
 * The three kinds, as the schema's `ConversationKind`.
 *
 * A TypeScript enum rather than the domain's string union, because
 * `registerEnumType` needs a runtime object to read the members off and a union
 * type is erased. The values are identical to `ConversationKind`'s and a
 * mismatch would be caught by the mapping below failing to compile — the domain
 * stays the source of truth and this is its GraphQL spelling.
 */
export enum ConversationKindName {
  coach = 'coach',
  planner = 'planner',
  free = 'free',
}

registerEnumType(ConversationKindName, {
  name: 'ConversationKind',
  description:
    'The two chats an account comes with, and the ones a member starts.',
});

export enum MessageRoleName {
  user = 'user',
  assistant = 'assistant',
  system = 'system',
}

registerEnumType(MessageRoleName, { name: 'MessageRole' });

/**
 * A chat.
 *
 * **`unread` is not here**, and `conversations.query.ts` carries the argument
 * at length: nothing in this system holds a per-conversation read cursor, so
 * the field could only be answered with an invented number. The generated
 * schema is therefore one field short of
 * `contracts/graphql.schema.graphql`'s `Conversation`, deliberately and on the
 * record, until the phase that adds the cursor adds the field with it.
 */
@ObjectType('Conversation')
export class ConversationType {
  @Field(() => ID)
  id!: string;

  @Field(() => ConversationKindName)
  kind!: string;

  @Field(() => String)
  title!: string;

  @Field(() => Boolean)
  pinned!: boolean;

  @Field(() => Boolean)
  archived!: boolean;

  /**
   * The clear watermark, published rather than kept server-side.
   *
   * A client needs it: it holds its own copy of the transcript, and a clear
   * made on another device reaches it as a change to this number — which is how
   * FR-011 crosses devices. A client that only ever saw the filtered `messages`
   * page would have no way to drop the rows it is already holding.
   */
  @Field(() => Int)
  clearedUpToSeq!: number;

  @Field(() => DateTimeScalar, { nullable: true })
  lastMessageAt!: Date | null;

  @Field(() => DateTimeScalar)
  createdAt!: Date;

  @Field(() => DateTimeScalar)
  updatedAt!: Date;
}

@ObjectType('Message')
export class MessageType {
  @Field(() => Int)
  seq!: number;

  @Field(() => ID)
  conversationId!: string;

  @Field(() => MessageRoleName)
  role!: string;

  @Field(() => String)
  content!: string;

  @Field(() => String, { nullable: true })
  clientId!: string | null;

  /** When the member typed it, which is not when it arrived — FR-007. */
  @Field(() => DateTimeScalar, { nullable: true })
  composedAt!: Date | null;

  /**
   * What the turn was understood to be asking, or `{ cancelled: true }` for an
   * answer the member stopped. `JSON` because the shape belongs to `intent.ts`
   * and grows with every intent the planner learns; a typed field here would be
   * a second copy of that union, published on a transport where adding a
   * variant is a schema change.
   */
  @Field(() => JSONScalar, { nullable: true })
  intent!: Record<string, unknown> | null;

  @Field(() => DateTimeScalar)
  createdAt!: Date;
}

@ObjectType('MessageConnection')
export class MessageConnectionType {
  @Field(() => [MessageType])
  nodes!: MessageType[];

  @Field(() => String, { nullable: true })
  endCursor!: string | null;

  @Field(() => Boolean)
  hasNextPage!: boolean;
}

/**
 * Conversations' read surface — the other half of principle X for this context.
 *
 * It exists in the same change as the two query handlers on purpose. In P3 a
 * resolver was forgotten while its query handler was written and specced, so
 * the reads were unreachable over the transport the constitution designates for
 * them and the handler's spec passed throughout: a query with no resolver is a
 * function nobody can call. Both halves land together, like both halves of an
 * event.
 *
 * One resolver for both queries rather than one per slice, because they are one
 * screen's two reads and the second needs the first's row anyway — and because
 * `MessageConnection` has to be registered exactly once, wherever it lives.
 *
 * Registration in `graphql/graphql.module.ts` is deliberately not done here;
 * that file is the edge's own list.
 */

/** A tappable chip, as the schema's `QuickQuestion`. */
@ObjectType('QuickQuestion')
export class QuickQuestionType {
  @Field(() => ID)
  id!: string;

  @Field(() => ConversationKindName)
  scope!: ConversationKindName;

  /**
   * Already resolved to the member's locale by the query handler.
   *
   * One string rather than the row's `{ en, ar }` pair, deliberately: the
   * client renders what it is given and has no business choosing a language
   * the server already knows from the profile. Publishing both halves would
   * invite a client to pick, and a client that picked differently from the
   * coach's own sentences would be the inconsistency `enhancements/E-012`
   * describes.
   */
  @Field()
  text!: string;

  @Field()
  mood!: string;

  /** True for the member's own, so the client can offer to remove it. */
  @Field()
  isMine!: boolean;
}

@Resolver()
@UsersOnly()
export class ConversationsResolver {
  constructor(
    private readonly conversations: ConversationsQueryHandler,
    private readonly messages: MessagesQueryHandler,
    private readonly questions: QuickQuestionsQueryHandler,
  ) {}

  /**
   * The chips one chat offers, in the order they should appear.
   *
   * The order moves with the member's last check-in — a low mood lifts the
   * lighter questions to the front (FR-010) — and the query handler does that,
   * reading the mood through a port bound to Rhythm's own `checkins` query
   * rather than from Rhythm's collection.
   *
   * `locale` comes from the principal's profile inside the handler and is not
   * an argument. A client-supplied locale would let one member ask for
   * another's language, which is harmless, and would also be a second place
   * that decides what language Botvy speaks to somebody — which is not.
   */
  @Query(() => [QuickQuestionType], { name: 'quickQuestions' })
  async quickQuestions(
    @CurrentPrincipal() principal: Principal,
    @Args('scope', { type: () => ConversationKindName })
    scope: ConversationKindName,
  ): Promise<QuickQuestionType[]> {
    const rows = await this.questions.handle(principal.id, scope);
    return rows as unknown as QuickQuestionType[];
  }


  @Query(() => [ConversationType], { name: 'conversations' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Args('includeArchived', {
      type: () => Boolean,
      nullable: true,
      defaultValue: false,
    })
    includeArchived?: boolean,
  ): Promise<ConversationType[]> {
    const rows = await this.conversations.list(
      principal.id,
      includeArchived ?? false,
    );
    return rows as unknown as ConversationType[];
  }

  /**
   * One chat's transcript from a cursor — starting at
   * `max(afterSeq, clearedUpToSeq)`, which the query handler applies.
   *
   * The refusal is translated here rather than left to bubble: `formatError`
   * reads the HTTP status off the original error to pick the client-facing
   * code, so a bare `ConversationForbidden` would reach the client as an
   * unlabelled internal error and a client branching on `forbidden` would show
   * "something went wrong" for a conversation that simply is not theirs.
   */
  @Query(() => MessageConnectionType, { name: 'messages' })
  async page(
    @CurrentPrincipal() principal: Principal,
    @Args('conversationId', { type: () => ID }) conversationId: string,
    @Args('afterSeq', { type: () => Int, nullable: true }) afterSeq?: number,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 50 })
    first?: number,
  ): Promise<MessageConnectionType> {
    try {
      const page = await this.messages.page(principal.id, {
        conversationId,
        afterSeq,
        first,
      });
      return page as unknown as MessageConnectionType;
    } catch (error) {
      if (error instanceof ConversationForbidden) {
        throw new ForbiddenException({
          code: 'forbidden',
          message: error.message,
        });
      }
      throw error;
    }
  }
}
