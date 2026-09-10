import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { newId } from '../../shared/cqrs/ids.js';
import { OutboxWriter } from '../../shared/outbox/outbox-writer.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import type { SyncOp } from '../../shared/persistence/ports/sync-change.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import {
  Conversation,
  type ConversationKind,
} from '../conversations/domain/conversation.aggregate.js';
import { Message } from '../conversations/domain/message.aggregate.js';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  InMemorySeq,
} from '../conversations/infrastructure/in-memory-conversations.repositories.js';
import { ConversationSyncAdapter } from '../conversations/infrastructure/conversations-sync.adapter.js';
import { MessageSyncAdapter } from '../conversations/infrastructure/messages-sync.adapter.js';
import {
  DeviceTouchPort,
  PendingAlertsPort,
} from './domain/syncable-entity.port.js';
import { SyncHandler } from './features/sync/sync.handler.js';

const MEMBER = 'member-1';
const INTRUDER = 'member-2';
const PHONE = 'install-phone';
const LAPTOP = 'install-laptop';
const ENTITIES = ['conversations', 'messages'];

class StubTouch extends DeviceTouchPort {
  async touch(): Promise<string | null> {
    return 'device-1';
  }
}

class StubAlerts extends PendingAlertsPort {
  async forMember(): Promise<unknown[]> {
    return [];
  }
}

class RecordingOutbox {
  readonly written: Array<{ name: string }> = [];

  async append(events: Array<{ name: string }>): Promise<void> {
    this.written.push(...events.map((event) => ({ name: event.name })));
  }
}

interface Bench {
  uow: InMemoryUnitOfWork;
  conversations: InMemoryConversationRepository;
  messages: InMemoryMessageRepository;
  seq: InMemorySeq;
  sync: SyncHandler;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const conversations = new InMemoryConversationRepository(uow);
  const messages = new InMemoryMessageRepository(uow);
  const seq = new InMemorySeq();
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new InMemoryAuditAdapter(),
  );

  return {
    uow,
    conversations,
    messages,
    seq,
    sync: new SyncHandler(
      [
        new ConversationSyncAdapter(uow, conversations),
        new MessageSyncAdapter(conversations, messages),
      ],
      [],
      new StubTouch(),
      new StubAlerts(),
      settings,
      new RecordingOutbox() as unknown as OutboxWriter,
    ),
  };
}

function change(
  op: SyncOp,
  id: string,
  data: Record<string, unknown> = {},
  overrides: { updatedAt?: Date; baseUpdatedAt?: Date | null } = {},
) {
  return {
    op,
    id,
    // Relative to now, never a pinned date.
    updatedAt: (overrides.updatedAt ?? new Date()).toISOString(),
    baseUpdatedAt: overrides.baseUpdatedAt?.toISOString() ?? null,
    data,
  };
}

async function seed(
  b: Bench,
  kind: ConversationKind,
  userId = MEMBER,
): Promise<Conversation> {
  const conversation = Conversation.create({
    id: newId(),
    userId,
    kind,
    title: kind,
    // A second in the past, so a push carrying `now` is not judged against a
    // row written in the same millisecond.
    at: new Date(Date.now() - 1_000),
  });
  // Through the unit of work, because `Conversation.create` raises
  // `ConversationCreated` and the in-memory adapter refuses an event raised
  // outside a transaction — the aggregate and its outbox row commit together
  // or not at all.
  await b.uow.run(() => b.conversations.save(conversation));
  return conversation;
}

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
          role: 'assistant',
          content: `message ${seq}`,
          at: new Date(),
        }),
      ),
    );
  }
  return issued;
}

const pulled = (result: { pull: Record<string, unknown> }) =>
  (result.pull.messages as Array<{ seq: number }>).map((row) => row.seq);

describe('the transcript on a round trip', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('pulls by sequence rather than by the date cursor', async () => {
    /*
     * The mismatch this phase had to resolve. `SyncableEntity.pull` takes a
     * date, and messages have no `updatedAt` to compare it against — they are
     * immutable, which is exactly what makes the cursor one integer. So the
     * port hands every adapter both cursors and each reads the one its
     * collection has; a `since` of "now" changes nothing here, and only
     * `lastSeq` moves the window.
     */
    const coach = await seed(b, 'coach');
    const issued = await say(b, coach, 3);

    const all = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: new Date(),
      lastSeq: 0,
      entities: ENTITIES,
    });
    expect(pulled(all)).toEqual(issued);

    const rest = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      lastSeq: issued[1]!,
      entities: ENTITIES,
    });
    expect(pulled(rest)).toEqual([issued[2]]);
  });

  it('treats a missing cursor as everything, not as the latest', async () => {
    // A fresh install, or one that threw its local database away. Reading an
    // absent cursor as "the newest" would leave it with an empty chat and no
    // way to ask again — the rows are immutable and appear in no later delta.
    const coach = await seed(b, 'coach');
    const issued = await say(b, coach, 2);

    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
    });

    expect(pulled(result)).toEqual(issued);
  });

  it('queries the messages before the conversations that carry them', async () => {
    /*
     * `contracts/sync.md` step 5. A message must never name a thread the
     * response does not carry, and reading the parent first leaves a window
     * where a chat created between the two reads is absent from the response
     * while its first message is in it.
     *
     * Asserted through the key order of the `pull` object, which is the order
     * the facade filled it in — the only observable trace the sequencing
     * leaves. The facade sorts by the reverse of `applyOrder`, so this holds
     * however the module happens to list its providers.
     */
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
    });

    expect(Object.keys(result.pull).slice(0, 2)).toEqual([
      'messages',
      'conversations',
    ]);
  });

  it('refuses a pushed message, because the sequence is not the client’s to choose', async () => {
    const coach = await seed(b, 'coach');
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        messages: [
          change('create', newId(), {
            conversationId: coach.id,
            seq: 1,
            content: 'mine',
          }),
        ],
      },
    });

    // `invalid`, never `stale`: retrying unchanged will fail again, and a stale
    // verdict tells the phone to overwrite and retry for ever.
    expect(result.rejections.map((one) => one.reason)).toEqual(['invalid']);
    expect(result.accepted.messages).toBeUndefined();
  });
});

describe('a clear made on one device', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  it('empties the chat on a second device’s next pull, and does not come back on the one after', async () => {
    /*
     * FR-011's two halves, which a delete could not both satisfy — and the
     * reason the watermark travels on the conversation row instead.
     *
     * The phone clears; the laptop, which has never seen any of it, pulls from
     * zero and gets nothing. Then it pulls *again* with the cursor it now
     * holds and still gets nothing: "nothing cleared may reappear in the
     * history a screen shows, or reach a device that catches up afterwards".
     */
    const coach = await seed(b, 'coach');
    const issued = await say(b, coach, 3);

    const cleared = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      lastSeq: issued[2]!,
      entities: ENTITIES,
      push: {
        conversations: [
          change('clear', coach.id, { clearedUpToSeq: issued[2] }),
        ],
      },
    });
    expect(cleared.accepted.conversations).toEqual([coach.id]);
    expect(cleared.rejections).toEqual([]);

    const first = await b.sync.handle(MEMBER, {
      installId: LAPTOP,
      since: null,
      lastSeq: 0,
      entities: ENTITIES,
    });
    expect(pulled(first)).toEqual([]);
    // The watermark itself does reach the laptop, which is how it knows to drop
    // the rows it may already be holding.
    expect(
      (first.pull.conversations as Array<{ clearedUpToSeq: number }>)[0]
        ?.clearedUpToSeq,
    ).toBe(issued[2]);

    const second = await b.sync.handle(MEMBER, {
      installId: LAPTOP,
      since: first.now,
      lastSeq: 0,
      entities: ENTITIES,
    });
    expect(pulled(second)).toEqual([]);
  });

  it('still delivers what is said after the clear', async () => {
    const coach = await seed(b, 'coach');
    const before = await say(b, coach, 2);

    await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        conversations: [
          change('clear', coach.id, { clearedUpToSeq: before[1] }),
        ],
      },
    });
    const after = await say(b, coach, 1);

    const result = await b.sync.handle(MEMBER, {
      installId: LAPTOP,
      since: null,
      lastSeq: 0,
      entities: ENTITIES,
    });
    expect(pulled(result)).toEqual(after);
  });

  it('never lowers a watermark that has already been raised', async () => {
    // A device whose cursor is behind pushes a clear from the past. FR-011: a
    // clear is not reversible, so the floor must not move down and the
    // messages must not come back.
    const coach = await seed(b, 'coach');
    const issued = await say(b, coach, 4);
    await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        conversations: [change('clear', coach.id, { clearedUpToSeq: 4 })],
      },
    });

    const late = await b.sync.handle(MEMBER, {
      installId: LAPTOP,
      since: null,
      lastSeq: 0,
      entities: ENTITIES,
      push: {
        conversations: [change('clear', coach.id, { clearedUpToSeq: 1 })],
      },
    });

    expect(pulled(late)).toEqual([]);
    expect(
      (await b.conversations.findById(MEMBER, coach.id))?.clearedUpToSeq,
    ).toBe(issued[3]);
  });

  it('refuses a clear with no watermark rather than guessing one', async () => {
    /*
     * The server cannot substitute its own counter here: that would clear
     * messages the pushing device has never seen, so a member clearing a chat
     * on a phone three days behind would lose three days of coach messages
     * they had not read. A push with no number is a client bug.
     */
    const coach = await seed(b, 'coach');
    await say(b, coach, 2);

    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: { conversations: [change('clear', coach.id)] },
    });

    expect(result.rejections[0]?.reason).toBe('invalid');
    expect(
      (await b.conversations.findById(MEMBER, coach.id))?.clearedUpToSeq,
    ).toBe(0);
  });
});

describe('a pushed chat row', () => {
  let b: Bench;
  beforeEach(() => {
    b = bench();
  });

  /*
   * The three refusals, over the sync transport this time, and all three must
   * be `protected` — never `stale`. A stale verdict tells the phone to take the
   * server's copy and retry, and against a row it will never be allowed to
   * change it would retry for ever.
   */
  for (const kind of ['coach', 'planner'] as const) {
    it(`refuses to delete the ${kind} chat as protected`, async () => {
      const conversation = await seed(b, kind);
      const result = await b.sync.handle(MEMBER, {
        installId: PHONE,
        since: null,
        entities: ENTITIES,
        push: { conversations: [change('delete', conversation.id)] },
      });

      expect(result.rejections).toHaveLength(1);
      expect(result.rejections[0]?.reason).toBe('protected');
      expect(result.rejections[0]?.entity).toBe('conversations');
      expect(
        (await b.conversations.findById(MEMBER, conversation.id))?.deletedAt,
      ).toBeNull();
    });

    it(`refuses to unpin the ${kind} chat as protected`, async () => {
      const conversation = await seed(b, kind);
      const result = await b.sync.handle(MEMBER, {
        installId: PHONE,
        since: null,
        entities: ENTITIES,
        push: {
          conversations: [
            change('upsert', conversation.id, { pinned: false }),
          ],
        },
      });

      expect(result.rejections[0]?.reason).toBe('protected');
      expect(
        (await b.conversations.findById(MEMBER, conversation.id))?.pinned,
      ).toBe(true);
    });

    it(`refuses to archive the ${kind} chat as protected`, async () => {
      const conversation = await seed(b, kind);
      const result = await b.sync.handle(MEMBER, {
        installId: PHONE,
        since: null,
        entities: ENTITIES,
        push: {
          conversations: [change('upsert', conversation.id, { archived: true })],
        },
      });

      expect(result.rejections[0]?.reason).toBe('protected');
      expect(
        (await b.conversations.findById(MEMBER, conversation.id))?.archived,
      ).toBe(false);
    });
  }

  it('refuses a protected delete even when the client’s copy is stale', async () => {
    /*
     * The order of the refusals, which is the contract's. `protected` is
     * checked *before* the conflict rule, so a phone with an out-of-date copy
     * of the coach chat is told the truth — that this row may not be deleted —
     * rather than being sent away to refresh and try again for ever.
     */
    const coach = await seed(b, 'coach');
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        conversations: [
          change(
            'delete',
            coach.id,
            {},
            {
              updatedAt: new Date(Date.now() - 60_000),
              baseUpdatedAt: new Date(Date.now() - 60_000),
            },
          ),
        ],
      },
    });

    expect(result.rejections[0]?.reason).toBe('protected');
  });

  it('takes an upsert of a chat created offline', async () => {
    const id = newId();
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        conversations: [change('upsert', id, { title: 'Recipes' })],
      },
    });

    expect(result.accepted.conversations).toEqual([id]);
    const stored = await b.conversations.findById(MEMBER, id);
    expect(stored?.kind).toBe('free');
    expect(stored?.title).toBe('Recipes');
  });

  it('refuses a pushed create that claims to be a pinned kind', async () => {
    // `coach` and `planner` are singletons created from
    // `identity.UserRegistered`. A client that could mint one would race the
    // partial unique index; refusing loudly beats silently downgrading it to a
    // free chat, which would leave the phone holding a row that never
    // reconciles.
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        conversations: [change('upsert', newId(), { kind: 'coach' })],
      },
    });

    expect(result.rejections[0]?.reason).toBe('invalid');
    expect(b.conversations.rows.size).toBe(0);
  });

  it('renames and archives a free chat', async () => {
    const free = await seed(b, 'free');
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        conversations: [
          change('upsert', free.id, { title: 'Dinner ideas', archived: true }),
        ],
      },
    });

    expect(result.accepted.conversations).toEqual([free.id]);
    const stored = await b.conversations.findById(MEMBER, free.id);
    expect(stored?.title).toBe('Dinner ideas');
    expect(stored?.archived).toBe(true);
  });

  it('tombstones a free chat and carries the tombstone in the pull', async () => {
    const free = await seed(b, 'free');
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: { conversations: [change('delete', free.id)] },
    });

    expect(result.accepted.conversations).toEqual([free.id]);
    const rows = result.pull.conversations as Array<{
      id: string;
      deletedAt: Date | null;
    }>;
    // The tombstone is how the deletion reaches the member's other devices: a
    // delta cannot carry the absence of a row.
    expect(rows.find((row) => row.id === free.id)?.deletedAt).not.toBeNull();
  });

  it('refuses a push naming another member’s chat as gone, revealing nothing', async () => {
    /*
     * FR-020 on this transport. The repository read is scoped by `userId`, so a
     * foreign id and an id that never existed are the same null and get the
     * same word — `gone`, which is what tells the phone to drop its local row
     * and stop pushing. Neither answer says whether the conversation exists.
     *
     * `delete` rather than `upsert`, because an upsert of an id this member
     * does not own is a *create*, and the create path is a platform-wide
     * hazard rather than this adapter's: see the test below.
     */
    const theirs = await seed(b, 'free', INTRUDER);

    const foreign = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: { conversations: [change('delete', theirs.id)] },
    });
    const missing = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: { conversations: [change('delete', newId())] },
    });

    expect(foreign.rejections[0]?.reason).toBe('gone');
    expect(missing.rejections[0]?.reason).toBe('gone');
    expect(
      (await b.conversations.findById(INTRUDER, theirs.id))?.deletedAt,
    ).toBeNull();
  });

  it('treats an upsert of an id it cannot see as a create for the caller', async () => {
    /*
     * Documented rather than asserted as correct, because it is neither
     * this adapter's decision nor safe in one specific way.
     *
     * The scoped read cannot see another member's row, so an `upsert` naming
     * one is indistinguishable from an offline create and is applied as one —
     * which is the same behaviour every client-minted-id entity has had since
     * P2 (a pushed `create` for a task id belonging to somebody else is
     * accepted the same way). In memory the two rows simply coexist under one
     * id, and the caller reads their own.
     *
     * Against Mongo they do not coexist: `MongoRepositoryBase.save` upserts on
     * `{ _id, updatedAt }` and **does not filter on `userId`**, so this write
     * would overwrite the other member's row, including its `userId`. That is a
     * cross-member write reachable from a public surface, it predates this
     * phase, and the fix belongs where the filter is — a `userId` in that
     * filter turns the write into a duplicate-key error, which the facade
     * already reports as `invalid`. It is reported rather than changed here
     * because that one line is on the write path of every aggregate in the
     * platform.
     *
     * What keeps it out of reach today is that ids are UUIDv7 and a member has
     * to name one exactly. That is not a permission check.
     */
    const theirs = await seed(b, 'free', INTRUDER);

    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
      push: {
        conversations: [change('upsert', theirs.id, { title: 'Mine now' })],
      },
    });

    expect(result.accepted.conversations).toEqual([theirs.id]);
    expect((await b.conversations.findById(MEMBER, theirs.id))?.title).toBe(
      'Mine now',
    );
  });

  it('pulls nothing of another member’s chats or messages', async () => {
    const theirs = await seed(b, 'coach', INTRUDER);
    await say(b, theirs, 2);

    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ENTITIES,
    });

    expect(result.pull.conversations).toEqual([]);
    expect(pulled(result)).toEqual([]);
  });
});

describe('paging the transcript', () => {
  it('reports moreMessages only while a full page came back', async () => {
    /*
     * The flag the phone loops on. A page short of the limit means there is
     * nothing after it; a full page means ask again. Getting this stuck at
     * false would leave the rest of a member's history unreachable — messages
     * are the one entity a later `full` snapshot cannot repair, because the
     * snapshot decision is about `updatedAt` and these rows have none.
     */
    const b = bench();
    const coach = await seed(b, 'coach');
    await say(b, coach, 3);

    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      lastSeq: 0,
      entities: ENTITIES,
    });

    expect(result.pull.moreMessages).toBe(false);
  });

  it('says nothing about messages when the client did not ask for them', async () => {
    // The extension's subset. A `moreMessages` key on a response with no
    // `messages` array would be a flag about nothing, and a client that pages
    // while it is set would loop.
    const b = bench();
    const result = await b.sync.handle(MEMBER, {
      installId: PHONE,
      since: null,
      entities: ['conversations'],
    });

    expect('moreMessages' in result.pull).toBe(false);
  });
});
