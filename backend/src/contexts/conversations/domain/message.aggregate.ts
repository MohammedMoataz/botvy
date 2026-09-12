import { AggregateRoot } from '../../../shared/persistence/ports/aggregate-root.js';

export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * What a turn cost, as the model reported it.
 *
 * Stored on the row *and* carried on the event, which is not duplication: the
 * row is what an operator reads beside the message, and the event is the only
 * way Operations learns of it. Conversations never opens `usage_log` and
 * Operations never opens `messages` — the event is the whole of the crossing,
 * and the daily allowance is summed back through a query. Without that loop the
 * allowance sums an empty collection and every member sits permanently at zero
 * used, which is a limit that silently does not exist.
 */
export interface MessageUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

export interface MessageState {
  id: string;
  userId: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  content: string;
  clientId: string | null;
  composedAt: Date | null;
  usage: MessageUsage | null;
  /**
   * What the turn was understood to be asking, or `{ cancelled: true }` for a
   * partial answer the member stopped.
   *
   * Loosely typed on purpose: the shape belongs to `intent.ts` and this
   * aggregate has no business knowing it. A message is a message whether the
   * turn that produced it parsed an intent or not.
   */
  intent: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * One message. Immutable, and that immutability is load-bearing.
 *
 * Messages are pulled by `seq > lastSeq` against a per-user counter. There is
 * no `updatedAt` and no tombstone, which is exactly why the cursor is one
 * number and one index — and exactly why a column backfilled onto existing rows
 * can never reach a device that already holds them. The answer to a shape
 * change here is to bump the cache marker and re-pull, never to edit rows in
 * place.
 *
 * So this aggregate has no mutators at all. `updatedAt` is inherited from the
 * base and set once to `createdAt`, because the repository's optimistic filter
 * reads it; nothing ever moves it, and a method that did would break the
 * contract above.
 */
export class Message extends AggregateRoot<string> {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly seq: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly clientId: string | null;
  readonly composedAt: Date | null;
  readonly usage: MessageUsage | null;
  readonly intent: Record<string, unknown> | null;
  readonly createdAt: Date;

  private constructor(state: MessageState) {
    super();
    this.id = state.id;
    this.userId = state.userId;
    this.conversationId = state.conversationId;
    this.seq = state.seq;
    this.role = state.role;
    this.content = state.content;
    this.clientId = state.clientId;
    this.composedAt = state.composedAt;
    this.usage = state.usage;
    this.intent = state.intent;
    this.createdAt = state.createdAt;
    this.updatedAt = state.createdAt;
  }

  static rehydrate(state: MessageState): Message {
    return new Message(state);
  }

  /**
   * `seq` is issued by the counter before this is called, not generated here.
   *
   * A monotonic per-member number cannot come from an aggregate — it is a
   * `findOneAndUpdate $inc` against a shared document, which is a store
   * operation. Passing it in keeps the aggregate constructible in a spec and
   * keeps the one place that hands out sequence numbers visible.
   */
  static write(input: {
    id: string;
    userId: string;
    conversationId: string;
    seq: number;
    role: MessageRole;
    content: string;
    clientId?: string | null;
    composedAt?: Date | null;
    usage?: MessageUsage | null;
    intent?: Record<string, unknown> | null;
    at: Date;
  }): Message {
    const message = new Message({
      id: input.id,
      userId: input.userId,
      conversationId: input.conversationId,
      seq: input.seq,
      role: input.role,
      content: input.content,
      clientId: input.clientId ?? null,
      composedAt: input.composedAt ?? null,
      usage: input.usage ?? null,
      intent: input.intent ?? null,
      createdAt: input.at,
    });
    message.raise(
      'conversations.MessageSent',
      'message',
      {
        conversationId: input.conversationId,
        seq: input.seq,
        role: input.role,
        // Null for the member's own turn, which costs nothing. Operations
        // writes no row for one: a usage log carrying zero-token entries is a
        // log whose row count means nothing.
        usage: input.usage ?? null,
      },
      input.at,
    );
    return message;
  }
}
