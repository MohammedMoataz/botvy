import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/cqrs/ids.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import {
  Conversation,
  ProtectedConversationError,
  type ConversationKind,
} from './domain/conversation.aggregate.js';
import { ConversationForbidden } from './domain/conversation-access.js';
import { Message } from './domain/message.aggregate.js';
import { ArchiveConversationHandler } from './features/archive/archive-conversation.handler.js';
import { ClearConversationHandler } from './features/clear/clear-conversation.handler.js';
import { ConversationsQueryHandler } from './features/conversations/conversations.query.js';
import { CreateConversationHandler } from './features/create-conversation/create-conversation.handler.js';
import { DeleteConversationHandler } from './features/delete/delete-conversation.handler.js';
import { MessagesQueryHandler } from './features/messages/messages.query.js';
import { PinConversationHandler } from './features/pin/pin-conversation.handler.js';
import { RenameConversationHandler } from './features/rename/rename-conversation.handler.js';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  InMemorySeq,
} from './infrastructure/in-memory-conversations.repositories.js';

const MEMBER = 'member-1';
const INTRUDER = 'member-2';

interface Bench {
  uow: InMemoryUnitOfWork;
  conversations: InMemoryConversationRepository;
  messages: InMemoryMessageRepository;
  seq: InMemorySeq;
  create: CreateConversationHandler;
  rename: RenameConversationHandler;
  pin: PinConversationHandler;
  archive: ArchiveConversationHandler;
  clear: ClearConversationHandler;
  remove: DeleteConversationHandler;
  list: ConversationsQueryHandler;
  transcript: MessagesQueryHandler;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const conversations = new InMemoryConversationRepository(uow);
  const messages = new InMemoryMessageRepository(uow);
  const seq = new InMemorySeq();

  return {
    uow,
    conversations,
    messages,
    seq,
    create: new CreateConversationHandler(uow, conversations),
    rename: new RenameConversationHandler(uow, conversations),
    pin: new PinConversationHandler(uow, conversations),
    archive: new ArchiveConversationHandler(uow, conversations),
    clear: new ClearConversationHandler(uow, conversations, seq),
    remove: new DeleteConversationHandler(uow, conversations),
    list: new ConversationsQueryHandler(conversations),
    transcript: new MessagesQueryHandler(conversations, messages),
  };
}

/** A chat straight into the store, bypassing the creation paths under test. */
async function seed(
  b: Bench,
  kind: ConversationKind,
  userId = MEMBER,
  title: string = kind,
): Promise<Conversation> {
  const conversation = Conversation.create({
    id: newId(),
    userId,
    kind,
    title,
    // Relative to now, never a pinned date: a fixture dated in the future
    // starts failing the day the clock reaches it.
    at: new Date(),
  });
  // Through the unit of work, because `Conversation.create` raises
  // `ConversationCreated` and the in-memory adapter refuses an event raised
  // outside a transaction — the aggregate and its outbox row commit together
  // or not at all.
  await b.uow.run(() => b.conversations.save(conversation));
  return conversation;
}

/** `count` messages in a chat, taking real sequence numbers from the counter. */
async function say(
  b: Bench,
  conversation: Conversation,
  count: number,
): Promise<number[]> {
  const issued: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const seq = await b.seq.next(conversation.userId);
    issued.push(seq);
    await b.uow.run(() =>
      b.messages.save(
        Message.write({
          id: b.messages.nextId(),
          userId: conversation.userId,
          conversationId: conversation.id,
          seq,
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: `message ${seq}`,
          at: new Date(),
        }),
      ),
    );
  }
  return issued;
}

describe('starting a chat', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('creates a free chat with the id the client minted', async () => {
    const id = newId();
    const conversation = await b.create.handle(MEMBER, { id, title: 'Recipes' });

    expect(conversation.id).toBe(id);
    expect(conversation.kind).toBe('free');
    expect(conversation.pinned).toBe(false);
    expect(conversation.isProtected).toBe(false);
  });

  it('falls back to a placeholder rather than storing an empty title', async () => {
    const conversation = await b.create.handle(MEMBER, {
      id: newId(),
      title: '   ',
    });
    expect(conversation.title).toBe('New chat');
  });

  it('caps a pasted paragraph at the title limit', async () => {
    const conversation = await b.create.handle(MEMBER, {
      id: newId(),
      title: 'x'.repeat(500),
    });
    expect(conversation.title).toHaveLength(60);
  });

  it('returns the existing chat when the same create arrives twice', async () => {
    /*
     * The bug this is here for. The id comes from the client, so a create can
     * reach the handler twice — a request that committed and then timed out on
     * the wire, and its retry. A blind `Conversation.create` on the same id
     * would reset the title the member has since changed and, worse, put
     * `clearedUpToSeq` back to zero: FR-011 says a clear is not reversible,
     * and this is one of the two paths that could have reversed it.
     */
    const id = newId();
    await b.create.handle(MEMBER, { id, title: 'Recipes' });
    await b.rename.handle(MEMBER, id, 'Dinner ideas');
    await b.clear.handle(MEMBER, id);
    const cleared = (await b.conversations.findById(MEMBER, id))!
      .clearedUpToSeq;

    const again = await b.create.handle(MEMBER, { id, title: 'Recipes' });

    expect(again.title).toBe('Dinner ideas');
    expect(again.clearedUpToSeq).toBe(cleared);
    expect(b.conversations.rows.size).toBe(1);
  });
});

describe('the two chats that cannot be taken away', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  /*
   * Three refusals × two pinned kinds. FR-001 and User Story 3: `coach` and
   * `planner` "MUST NOT be deletable, unpinnable or archivable" — only
   * clearable — and each refusal has to name the operation so the message can
   * offer clearing instead.
   */
  for (const kind of ['coach', 'planner'] as const) {
    it(`refuses to delete the ${kind} chat, and offers clearing`, async () => {
      const conversation = await seed(b, kind);
      const error = await b.remove
        .handle(MEMBER, conversation.id)
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ProtectedConversationError);
      expect((error as ProtectedConversationError).operation).toBe('delete');
      expect((error as Error).message).toContain('clear it instead');
      // And nothing was written: the row is still there, still not a tombstone.
      expect(
        (await b.conversations.findById(MEMBER, conversation.id))?.deletedAt,
      ).toBeNull();
    });

    it(`refuses to unpin the ${kind} chat`, async () => {
      const conversation = await seed(b, kind);
      const error = await b.pin
        .handle(MEMBER, conversation.id, false)
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ProtectedConversationError);
      expect((error as ProtectedConversationError).operation).toBe('unpin');
      expect(
        (await b.conversations.findById(MEMBER, conversation.id))?.pinned,
      ).toBe(true);
    });

    it(`refuses to archive the ${kind} chat`, async () => {
      const conversation = await seed(b, kind);
      const error = await b.archive
        .handle(MEMBER, conversation.id, true)
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ProtectedConversationError);
      expect((error as ProtectedConversationError).operation).toBe('archive');
      expect(
        (await b.conversations.findById(MEMBER, conversation.id))?.archived,
      ).toBe(false);
    });
  }

  it('lets the coach chat be renamed, which is not one of the three', async () => {
    const conversation = await seed(b, 'coach', MEMBER, 'Coach');
    const renamed = await b.rename.handle(MEMBER, conversation.id, 'My coach');
    expect(renamed.title).toBe('My coach');
  });

  it('deletes a free chat, as a tombstone that keeps the row', async () => {
    const conversation = await seed(b, 'free');
    const deleted = await b.remove.handle(MEMBER, conversation.id);

    expect(deleted.deletedAt).not.toBeNull();
    // The row stays: a delta pull is the only way a deletion reaches the
    // member's other devices, and a row that is gone reaches nobody.
    expect(b.conversations.rows.has(conversation.id)).toBe(true);
  });
});

describe('a conversation that is not yours', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  /*
   * FR-020, and the reason it is one error and not two: the difference between
   * "not found" and "forbidden" is exactly the bit that tells somebody walking
   * a list of ids which ones exist. Every one of these must be the same
   * refusal for the same reason — the repository read is scoped by `userId`, so
   * a foreign id and an id that never existed are the same null.
   */
  const cases: Array<[string, (b: Bench, id: string) => Promise<unknown>]> = [
    ['rename', (bench_, id) => bench_.rename.handle(MEMBER, id, 'Mine now')],
    ['pin', (bench_, id) => bench_.pin.handle(MEMBER, id, true)],
    ['archive', (bench_, id) => bench_.archive.handle(MEMBER, id, true)],
    ['clear', (bench_, id) => bench_.clear.handle(MEMBER, id)],
    ['delete', (bench_, id) => bench_.remove.handle(MEMBER, id)],
    [
      'read the messages of',
      (bench_, id) => bench_.transcript.page(MEMBER, { conversationId: id }),
    ],
  ];

  for (const [what, act] of cases) {
    it(`refuses to ${what} another member's chat, as forbidden`, async () => {
      const theirs = await seed(b, 'free', INTRUDER);
      const error = await act(b, theirs.id).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(ConversationForbidden);
      // Nothing about the conversation, not even its id, is in the message.
      expect((error as Error).message).toBe('No such conversation.');
    });

    it(`gives an id that never existed the same answer when asked to ${what} it`, async () => {
      const error = await act(b, newId()).catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(ConversationForbidden);
      expect((error as Error).message).toBe('No such conversation.');
    });
  }

  it('gives a chat the member deleted the same answer as one that was never theirs', async () => {
    const conversation = await seed(b, 'free');
    await b.remove.handle(MEMBER, conversation.id);

    await expect(
      b.rename.handle(MEMBER, conversation.id, 'Back again'),
    ).rejects.toBeInstanceOf(ConversationForbidden);
  });
});

describe('clearing a chat', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('sets the watermark to the member’s highest issued sequence', async () => {
    const coach = await seed(b, 'coach');
    const issued = await say(b, coach, 4);

    const cleared = await b.clear.handle(MEMBER, coach.id);

    expect(cleared.clearedUpToSeq).toBe(issued[issued.length - 1]);
  });

  it('consumes no sequence number, so the next message is above the floor', async () => {
    /*
     * `SeqPort.current`, never `next`. A floor set to a number the counter has
     * not handed out yet would be a floor the *next* message is born below —
     * cleared before anybody read it.
     */
    const coach = await seed(b, 'coach');
    await say(b, coach, 2);

    const cleared = await b.clear.handle(MEMBER, coach.id);
    const [next] = await say(b, coach, 1);

    expect(next!).toBeGreaterThan(cleared.clearedUpToSeq);
    const page = await b.transcript.page(MEMBER, { conversationId: coach.id });
    expect(page.nodes.map((node) => node.seq)).toEqual([next]);
  });

  it('never lowers the watermark, so a late clear cannot un-clear anything', async () => {
    /*
     * FR-011: a clear is not reversible. A device whose cursor or clock is
     * behind must not be able to put the floor back — the aggregate's
     * `clearUpTo` is monotonic, and this is the handler side of it: a second
     * clear issued when the counter has not moved changes nothing, and a
     * hand-rolled lower value is refused outright.
     */
    const coach = await seed(b, 'coach');
    await say(b, coach, 5);
    const high = (await b.clear.handle(MEMBER, coach.id)).clearedUpToSeq;

    const stored = (await b.conversations.findById(MEMBER, coach.id))!;
    expect(stored.clearUpTo(2, new Date())).toBe(false);
    expect(stored.clearedUpToSeq).toBe(high);

    // And a repeated clear with nothing said in between is a no-op.
    expect((await b.clear.handle(MEMBER, coach.id)).clearedUpToSeq).toBe(high);
  });

  it('empties the history for a caller that asks from zero', async () => {
    /*
     * The requirement, in one assertion: a fresh install, or a tab that has
     * never opened the chat, passes `afterSeq: 0` — and a cleared chat is
     * empty for it. The read starts at `max(afterSeq, clearedUpToSeq)`, so the
     * floor overrides the cursor rather than being combined with it somewhere
     * in a client.
     */
    const coach = await seed(b, 'coach');
    await say(b, coach, 3);
    await b.clear.handle(MEMBER, coach.id);

    const page = await b.transcript.page(MEMBER, {
      conversationId: coach.id,
      afterSeq: 0,
    });

    expect(page.nodes).toEqual([]);
    expect(page.endCursor).toBeNull();
    expect(page.hasNextPage).toBe(false);
    // The rows are all still there — clearing is a watermark, never a delete.
    expect(b.messages.rows.size).toBe(3);
  });

  it('leaves another chat’s history alone', async () => {
    // The counter is per member, so the watermark is a member-wide number —
    // and it is only ever read against the conversation that carries it.
    const coach = await seed(b, 'coach');
    const free = await seed(b, 'free');
    await say(b, coach, 2);
    const elsewhere = await say(b, free, 2);

    await b.clear.handle(MEMBER, coach.id);

    const page = await b.transcript.page(MEMBER, { conversationId: free.id });
    expect(page.nodes.map((node) => node.seq)).toEqual(elsewhere);
  });
});

describe('reading a chat', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('pages by sequence and reports the cursor and the next page', async () => {
    const free = await seed(b, 'free');
    const issued = await say(b, free, 5);

    const first = await b.transcript.page(MEMBER, {
      conversationId: free.id,
      first: 2,
    });
    expect(first.nodes.map((node) => node.seq)).toEqual(issued.slice(0, 2));
    expect(first.endCursor).toBe(String(issued[1]));
    expect(first.hasNextPage).toBe(true);

    const last = await b.transcript.page(MEMBER, {
      conversationId: free.id,
      afterSeq: Number(first.endCursor),
      first: 10,
    });
    expect(last.nodes.map((node) => node.seq)).toEqual(issued.slice(2));
    // The page came back short of the limit, so there is nothing after it —
    // the over-fetch by one is what answers this exactly rather than promising
    // a page that turns out to be empty.
    expect(last.hasNextPage).toBe(false);
  });

  it('reads nothing of another member’s messages in a chat of the same id', async () => {
    // Belt as well as braces: the conversation lookup is scoped, and the
    // message read is scoped too, so a bug in the first cannot widen into
    // somebody else's transcript.
    const free = await seed(b, 'free');
    await say(b, free, 1);
    await b.uow.run(() =>
      b.messages.save(
        Message.write({
          id: b.messages.nextId(),
          userId: INTRUDER,
          conversationId: free.id,
          seq: 1,
          role: 'user',
          content: 'not yours',
          at: new Date(),
        }),
      ),
    );

    const page = await b.transcript.page(MEMBER, { conversationId: free.id });
    expect(page.nodes.map((node) => node.content)).not.toContain('not yours');
  });
});

describe('the chat list', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('hides archived chats unless they are asked for', async () => {
    const free = await seed(b, 'free', MEMBER, 'Recipes');
    await seed(b, 'coach');
    await b.archive.handle(MEMBER, free.id, true);

    expect((await b.list.list(MEMBER)).map((row) => row.title)).toEqual([
      'coach',
    ]);
    expect(
      (await b.list.list(MEMBER, true)).map((row) => row.title).sort(),
    ).toEqual(['Recipes', 'coach']);
  });

  it('hides a deleted chat from both', async () => {
    const free = await seed(b, 'free');
    await b.remove.handle(MEMBER, free.id);

    expect(await b.list.list(MEMBER)).toEqual([]);
    expect(await b.list.list(MEMBER, true)).toEqual([]);
  });

  it('lists nobody else’s chats', async () => {
    await seed(b, 'coach', INTRUDER);
    expect(await b.list.list(MEMBER, true)).toEqual([]);
  });

  it('publishes the clear watermark, which is how a clear crosses devices', async () => {
    const coach = await seed(b, 'coach');
    await say(b, coach, 2);
    await b.clear.handle(MEMBER, coach.id);

    const [row] = await b.list.list(MEMBER);
    expect(row!.clearedUpToSeq).toBe(2);
  });
});
