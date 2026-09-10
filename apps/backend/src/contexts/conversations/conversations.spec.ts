import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { NudgeService } from '../../ws/nudge.service.js';
import { AppendMessageHandler } from './features/append-message/append-message.handler.js';
import { ConversationsBootstrapHandler } from './features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { CloseOnBannedHandler } from './features/close-on-banned/close-on-banned.handler.js';
import { ConversationsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  InMemorySeq,
} from './infrastructure/in-memory-conversations.repositories.js';
import { InMemoryQuickQuestionRepository } from './infrastructure/in-memory-quick-question.repository.js';

const MEMBER = 'member-1';

/**
 * A socket server that records rather than sends.
 *
 * `NudgeService` is used as-is rather than stubbed, because the thing worth
 * asserting is that a frame reaches the member's *room* — the emit goes to
 * `user:<id>`, not to a socket, precisely so that all of a member's devices
 * hear it. A fake of the service itself would let a handler emit to the wrong
 * room and the spec would still pass.
 */
class RecordingSockets {
  readonly frames: Array<{ room: string; event: string; payload: unknown }> = [];
  /** Rooms whose sockets were closed, for `close-on-banned`. */
  readonly closed: string[] = [];

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.frames.push({ room, event, payload });
      },
    };
  }

  /**
   * Socket.IO 4's `in(room).disconnectSockets()`, which is how a banned
   * member's live connections are actually cut. Implemented here rather than
   * left off so the handler's happy path is the one this spec exercises —
   * `NudgeService.disconnect` degrades to a log line when the broadcaster
   * lacks it, and a fake without it would let this spec pass over a service
   * that never closed anything. That degradation has its own test in
   * `ws/ws.spec.ts`.
   */
  in(room: string) {
    return {
      disconnectSockets: (_close?: boolean) => {
        this.closed.push(room);
      },
    };
  }
}

function event(name: string, userId: string | null = MEMBER): DomainEvent {
  return {
    eventId: newId(),
    name,
    context: name.split('.')[0]!,
    aggregate: { type: 'user', id: userId ?? 'x' },
    userId,
    // Relative to now, never a pinned date: a fixture dated in the future
    // starts failing the day the clock reaches it.
    occurredAt: new Date(),
    payload: { email: 'someone@example.org', locale: null, timezone: null },
    schemaVersion: 1,
  };
}

interface Bench {
  uow: InMemoryUnitOfWork;
  conversations: InMemoryConversationRepository;
  messages: InMemoryMessageRepository;
  seq: InMemorySeq;
  questions: InMemoryQuickQuestionRepository;
  sockets: RecordingSockets;
  bootstrap: ConversationsBootstrapHandler;
  append: AppendMessageHandler;
  purge: ConversationsPurgeOnDeletedHandler;
  closeOnBanned: CloseOnBannedHandler;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const conversations = new InMemoryConversationRepository(uow);
  const messages = new InMemoryMessageRepository(uow);
  const seq = new InMemorySeq();
  const questions = new InMemoryQuickQuestionRepository(uow);
  const sockets = new RecordingSockets();
  const nudges = new NudgeService();
  nudges.attach(sockets);

  return {
    uow,
    conversations,
    messages,
    seq,
    sockets,
    bootstrap: new ConversationsBootstrapHandler(uow, conversations),
    append: new AppendMessageHandler(uow, conversations, messages, seq, nudges, () =>
      messages.nextId(),
    ),
    questions,
    // The fourth collection this context owns. The purge was missing it, so a
    // deleted member's own quick questions outlived their account.
    purge: new ConversationsPurgeOnDeletedHandler(
      uow,
      conversations,
      messages,
      seq,
      questions,
    ),
    closeOnBanned: new CloseOnBannedHandler(nudges),
  };
}

describe('the chats an account comes with', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('creates the pinned coach and planner chats on registration', async () => {
    expect(await b.bootstrap.handle(event('identity.UserRegistered'))).toBe(
      'created',
    );

    const coach = await b.conversations.byKind(MEMBER, 'coach');
    const planner = await b.conversations.byKind(MEMBER, 'planner');

    expect(coach?.title).toBe('Coach');
    expect(planner?.title).toBe('Planner');
    // Pinned and protected, which is what stops P4 letting a member delete the
    // chat the rhythm writes into every evening.
    expect(coach?.pinned).toBe(true);
    expect(coach?.isProtected).toBe(true);
    expect(coach?.lastMessageAt).toBeNull();
  });

  it('creates nothing twice when the relay redelivers the same registration', async () => {
    /*
     * The bug this is here for. The relay delivers at least once, so the second
     * delivery must be a no-op — a handler that called `Conversation.create`
     * again would mint a fresh `newId()`, write a second `coach` row and raise a
     * second `ConversationCreated`, and the member would see two identical
     * pinned chats with their transcript split between them.
     */
    const registered = event('identity.UserRegistered');

    expect(await b.bootstrap.handle(registered)).toBe('created');
    const idsAfterFirst = [...b.conversations.rows.keys()].sort();

    expect(await b.bootstrap.handle(registered)).toBe('already-there');

    expect(b.conversations.rows.size).toBe(2);
    expect([...b.conversations.rows.keys()].sort()).toEqual(idsAfterFirst);
    expect(
      b.conversations.events.filter(
        (raised) => raised.name === 'conversations.ConversationCreated',
      ),
    ).toHaveLength(2);
  });

  it('finishes the job when a redelivery finds only one of the pair', async () => {
    // Idempotent per kind, not per pair. A handler that took its
    // "already-there" exit as soon as *anything* existed would leave a member
    // whose first write crashed halfway with one chat, forever.
    await b.bootstrap.handle(event('identity.UserRegistered'));
    const planner = await b.conversations.byKind(MEMBER, 'planner');
    b.conversations.rows.delete(planner!.id);

    expect(await b.bootstrap.handle(event('identity.UserRegistered'))).toBe(
      'created',
    );
    expect(await b.conversations.byKind(MEMBER, 'planner')).not.toBeNull();
    expect(b.conversations.rows.size).toBe(2);
  });

  it('does nothing for an event carrying no member', async () => {
    expect(
      await b.bootstrap.handle(event('identity.UserRegistered', null)),
    ).toBe('already-there');
    expect(b.conversations.rows.size).toBe(0);
  });
});

describe('appending a message', () => {
  let b: Bench;
  beforeEach(async () => {
    b = bench();
    await b.bootstrap.handle(event('identity.UserRegistered'));
  });

  it('gives two appends consecutive sequence numbers', async () => {
    /*
     * The counter is per member, not per conversation, because the phone's
     * cursor is one number for the whole transcript. So an append to the coach
     * chat and an append to the planner chat take 1 and 2 — not 1 and 1, which
     * is what a per-conversation sequence would give and which would make the
     * second message invisible to any device that had already pulled past 1.
     */
    const first = await b.append.handle({
      userId: MEMBER,
      kind: 'coach',
      role: 'assistant',
      content: 'What does tomorrow look like?',
      at: new Date(),
    });
    const second = await b.append.handle({
      userId: MEMBER,
      kind: 'planner',
      role: 'assistant',
      content: 'Here is the draft.',
      at: new Date(),
    });

    expect(first).toEqual({ seq: 1 });
    expect(second).toEqual({ seq: 2 });
    expect(await b.seq.current(MEMBER)).toBe(2);

    const pulled = await b.messages.afterSeq(MEMBER, 0, 10);
    expect(pulled.map((message) => message.seq)).toEqual([1, 2]);
  });

  it('pushes exactly one chat.message frame to the member’s room', async () => {
    await b.append.handle({
      userId: MEMBER,
      kind: 'coach',
      role: 'assistant',
      content: 'Good morning.',
      at: new Date(),
    });

    expect(b.sockets.frames).toHaveLength(1);
    const [frame] = b.sockets.frames;
    // The room, not a socket: a member has several devices and a frame that
    // reached only the first to connect would leave the others stale.
    expect(frame!.room).toBe(`user:${MEMBER}`);
    expect(frame!.event).toBe('chat.message');
    expect(frame!.payload).toMatchObject({
      seq: 1,
      role: 'assistant',
      content: 'Good morning.',
    });
  });

  it('writes the row down as well as pushing it, and moves the chat’s order', async () => {
    // v1's defect: the notification was the only copy of the question, so a
    // member who opened the app was asked to answer something that was nowhere
    // on screen.
    const at = new Date();
    await b.append.handle({
      userId: MEMBER,
      kind: 'coach',
      role: 'assistant',
      content: 'How did today go?',
      at,
    });

    const coach = await b.conversations.byKind(MEMBER, 'coach');
    expect(coach?.lastMessageAt).toEqual(at);
    const transcript = await b.messages.inConversation(
      MEMBER,
      coach!.id,
      0,
      10,
    );
    expect(transcript.map((message) => message.content)).toEqual([
      'How did today go?',
    ]);
    expect(
      b.messages.events.map((raised) => raised.name),
    ).toEqual(['conversations.MessageSent']);
  });

  it('returns null without throwing when the member has no chat of that kind', async () => {
    /*
     * The caller is a five-minute cron walking every member. A throw here would
     * abort the tick partway through the roster: the member it stopped on is
     * the only one whose touch is ever retried, everybody after them loses the
     * day, and the claim date the tick already wrote means tomorrow's pass will
     * not try again. So the touch that cannot be written is skipped, not fatal.
     */
    const result = await b.append.handle({
      userId: 'a-member-who-never-registered',
      kind: 'coach',
      role: 'assistant',
      content: 'Nobody to tell.',
      at: new Date(),
    });

    expect(result).toBeNull();
    expect(b.sockets.frames).toHaveLength(0);
    expect(b.messages.rows.size).toBe(0);
    // And no sequence number consumed, because the resolve happens first.
    expect(await b.seq.current('a-member-who-never-registered')).toBe(0);
  });

  it('refuses a chat the member deleted rather than writing into a tombstone', async () => {
    // The pinned two cannot be deleted, so this is P4's free chats arriving
    // early — a caller holding an id from before the deletion. `byKind` filters
    // tombstones out in both adapters; the id path needs its own guard, and
    // without it a touch would land in something the member threw away and be
    // pulled back down to their phone.
    const coach = (await b.conversations.byKind(MEMBER, 'coach'))!;
    b.conversations.rows.set(coach.id, {
      ...b.conversations.rows.get(coach.id)!,
      deletedAt: new Date(),
    });

    expect(
      await b.append.handle({
        userId: MEMBER,
        conversationId: coach.id,
        role: 'assistant',
        content: 'Into the void.',
        at: new Date(),
      }),
    ).toBeNull();
    expect(
      await b.append.handle({
        userId: MEMBER,
        conversationId: 'no-such-conversation',
        role: 'assistant',
        content: 'Into the void.',
        at: new Date(),
      }),
    ).toBeNull();
    expect(b.messages.rows.size).toBe(0);
  });
});

describe('when the account goes away', () => {
  let b: Bench;
  beforeEach(async () => {
    b = bench();
    await b.bootstrap.handle(event('identity.UserRegistered'));
    await b.append.handle({
      userId: MEMBER,
      kind: 'coach',
      role: 'assistant',
      content: 'Something worth forgetting.',
      at: new Date(),
    });
  });

  it('removes the chats, the messages and the counter', async () => {
    expect(await b.purge.handle(event('identity.UserDeleted'))).toBe(
      'purged',
    );

    expect(b.conversations.rows.size).toBe(0);
    expect(b.messages.rows.size).toBe(0);
    // The counter is the one that is easy to forget, and it is the sequence's
    // memory rather than member content — so its absence is asserted directly.
    expect(b.seq.values.has(MEMBER)).toBe(false);
    expect(await b.seq.current(MEMBER)).toBe(0);
  });

  it('is a no-op on redelivery', async () => {
    await b.purge.handle(event('identity.UserDeleted'));
    expect(await b.purge.handle(event('identity.UserDeleted'))).toBe(
      'nothing-to-do',
    );
  });

  it('leaves another member’s chats and counter alone', async () => {
    const other = 'member-2';
    await b.bootstrap.handle(event('identity.UserRegistered', other));
    await b.append.handle({
      userId: other,
      kind: 'coach',
      role: 'assistant',
      content: 'Still here.',
      at: new Date(),
    });

    await b.purge.handle(event('identity.UserDeleted'));

    expect(await b.conversations.byKind(other, 'coach')).not.toBeNull();
    expect(await b.seq.current(other)).toBe(1);
    expect(await b.messages.afterSeq(other, 0, 10)).toHaveLength(1);
  });
});

describe('when access is withdrawn', () => {
  let b: Bench;
  beforeEach(async () => {
    b = bench();
    await b.bootstrap.handle(event('identity.UserRegistered'));
  });

  /**
   * FR-022: a banned member's live connections are closed, and nothing further
   * is answered.
   *
   * This exists because of a property of the design rather than an oversight.
   * **The socket authenticates in the handshake** — that is what makes it cheap,
   * no per-message verification — and it means a socket outlives any decision
   * made after it opened. A JWT cannot be revoked mid-flight either, so without
   * this handler a banned member keeps a working chat until their access token
   * expires: up to fifteen minutes of the coach answering somebody who has been
   * shut out.
   *
   * A `principal.banned` check at the top of `chat.send` was the cheaper-looking
   * option and it is worse twice over. It is a check somebody has to remember to
   * add to the *next* socket message, and it leaves the connection open — so the
   * member sits watching a chat that silently stops answering, which reads as a
   * broken app rather than as a decision. Both halves are asserted: the frame
   * that tells their client to sign out, and the close itself.
   */
  it('closes every socket the banned member has open, after telling them why', async () => {
    await b.closeOnBanned.handle(event('identity.UserBanned'));

    expect(b.sockets.frames).toEqual([
      { room: `user:${MEMBER}`, event: 'auth.revoked', payload: { code: 'banned' } },
    ]);
    expect(b.sockets.closed).toEqual([`user:${MEMBER}`]);
  });

  /**
   * An event carrying no member does nothing at all.
   *
   * Not a defensive nicety: `DomainEvent.userId` is nullable, the relay delivers
   * whatever the outbox holds, and `roomForUser(undefined)` is the perfectly
   * valid room name `user:undefined`. A handler without the guard would emit
   * `auth.revoked` into that room and call `disconnectSockets` on it — which
   * today reaches nobody, and would reach *everybody* the moment anything else
   * ever joined a room built from an absent id.
   */
  it('does nothing for an event carrying no member', async () => {
    await b.closeOnBanned.handle(event('identity.UserBanned', null));

    expect(b.sockets.frames).toEqual([]);
    expect(b.sockets.closed).toEqual([]);
  });

  /** One member's ban is not another's. The room is the whole of the scoping. */
  it('leaves another member’s connections alone', async () => {
    await b.closeOnBanned.handle(event('identity.UserBanned', 'member-2'));

    expect(b.sockets.closed).toEqual(['user:member-2']);
  });
});
