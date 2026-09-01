import { describe, expect, it, vi } from 'vitest';
import { ChatService } from '../src/chat/chat.service.js';
import { COACHING_CLIENT_ID } from '../src/chat/conversations.service.js';

/**
 * Named chats, from the chat service's side.
 *
 * The test that matters most here is the check-in gate. Before conversations,
 * an open nightly check-in swallowed *any* message the user sent, and the
 * classifier matches whole words including "rest", "not" and "did" — so
 * "does this need rest time?" typed in a recipe chat at 22:00 recorded a missed
 * day, zeroed the streak, and answered with coaching copy in the wrong thread.
 * The gate is now conditional on the coaching chat, and these tests are what
 * keep it that way.
 */
const COACHING = { id: 'conv-coaching', clientId: COACHING_CLIENT_ID };
const OTHER = { id: 'conv-work', clientId: null };

function makeService(opts: { awaiting?: boolean; history?: unknown[] } = {}) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    message: {
      findMany: vi.fn().mockResolvedValue(opts.history ?? []),
      create: vi.fn().mockImplementation(({ data }) => {
        created.push(data);
        return Promise.resolve({ id: created.length, ...data });
      }),
    },
  };

  async function* tokens() {
    yield 'Sure.';
  }
  const llm = {
    modelName: 'test-model',
    extract: vi.fn().mockResolvedValue(null),
    chat: vi.fn().mockReturnValue({
      stream: tokens(),
      usage: Promise.resolve({ promptTokens: 1, completionTokens: 1 }),
    }),
  };
  const usage = { record: vi.fn().mockResolvedValue({}) };
  const reminders = { list: vi.fn().mockResolvedValue([]), create: vi.fn() };
  const coaching = {
    userTimezone: vi.fn().mockResolvedValue('Africa/Cairo'),
    getProfile: vi.fn().mockResolvedValue({ optedIn: false }),
    isAwaitingCheckin: vi.fn().mockResolvedValue(opts.awaiting ?? false),
    recordCheckin: vi.fn().mockResolvedValue({}),
    context: vi.fn().mockResolvedValue({ streak: 3, completionRatio: 1 }),
  };
  const settings = { get: vi.fn().mockResolvedValue(20) };
  const search = { search: vi.fn().mockResolvedValue([]) };
  const conversations = {
    resolve: vi.fn().mockImplementation((_u: string, id?: string) =>
      Promise.resolve(id === OTHER.id ? OTHER : COACHING),
    ),
  };

  const service = new ChatService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    llm as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    usage as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reminders as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coaching as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    search as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { get: vi.fn(() => undefined) } as any,
  );
  return { service, prisma, llm, coaching, conversations, created };
}

/** Drains the SSE observable to completion and returns the events. */
function drain(observable: { subscribe: (o: unknown) => { unsubscribe(): void } }) {
  return new Promise<{ type: string; data: unknown }[]>((resolve, reject) => {
    const events: { type: string; data: unknown }[] = [];
    const sub = observable.subscribe({
      next: (e: { type: string; data: unknown }) => {
        if (e.type !== 'heartbeat') events.push(e);
      },
      error: reject,
      complete: () => {
        sub.unsubscribe();
        resolve(events);
      },
    });
  });
}

describe('the nightly check-in only listens in its own chat', () => {
  it('does not record a check-in from another conversation', async () => {
    // The regression this whole feature exists to prevent: "rest", "not" and
    // "did" are all whole-word matches in the classifier, so an ordinary
    // sentence in an unrelated chat used to be filed as the day's answer.
    const { service, coaching, llm } = makeService({ awaiting: true });

    const events = await drain(
      service.streamReply('u1', OTHER, 'does this recipe need rest time?'),
    );

    expect(coaching.recordCheckin).not.toHaveBeenCalled();
    expect(llm.chat).toHaveBeenCalled(); // an ordinary turn instead
    expect(events.map((e) => e.type)).not.toContain('error');
  });

  it('leaves the check-in open, so the real answer still counts', async () => {
    const { service, coaching } = makeService({ awaiting: true });
    await drain(service.streamReply('u1', OTHER, 'no rest for me today'));

    // Nothing cleared the flag: markAwaitingCheckin is untouched and the
    // 12-hour window is still running.
    expect(coaching.recordCheckin).not.toHaveBeenCalled();
  });

  it('records it in the coaching chat', async () => {
    const { service, coaching, llm } = makeService({ awaiting: true });

    const events = await drain(service.streamReply('u1', COACHING, 'yes, all done'));

    expect(coaching.recordCheckin).toHaveBeenCalledWith('u1', true, 'yes, all done');
    // The short-circuit answers from a template — no model call, no usage row.
    expect(llm.chat).not.toHaveBeenCalled();
    expect(events.find((e) => e.type === 'intent')?.data).toEqual({ intent: 'checkin_reply' });
  });

  it('falls through to an ordinary turn on an unclear answer', async () => {
    const { service, coaching, llm } = makeService({ awaiting: true });
    await drain(service.streamReply('u1', COACHING, 'what should I eat tomorrow'));

    expect(coaching.recordCheckin).not.toHaveBeenCalled();
    expect(llm.chat).toHaveBeenCalled();
  });
});

describe('chats do not leak into each other', () => {
  it('reads history from this conversation only', async () => {
    const { service, prisma } = makeService();
    await drain(service.streamReply('u1', OTHER, 'hello'));

    expect(prisma.message.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      conversationId: OTHER.id,
    });
  });

  it('files both turns in the conversation they were sent to', async () => {
    const { service, created } = makeService();
    await drain(service.streamReply('u1', OTHER, 'hello'));

    expect(created).toHaveLength(2);
    for (const row of created) expect(row.conversationId).toBe(OTHER.id);
    expect(created.map((r) => r.role)).toEqual(['user', 'assistant']);
  });

  it('files the check-in pair in the coaching chat', async () => {
    const { service, created } = makeService({ awaiting: true });
    await drain(service.streamReply('u1', COACHING, 'yes'));

    expect(created).toHaveLength(2);
    for (const row of created) expect(row.conversationId).toBe(COACHING.id);
  });
});

describe('an offline flush spanning several chats', () => {
  it('answers each conversation in its own thread', async () => {
    // One combined reply would necessarily land in the wrong chat for all but
    // one of them.
    const { service, created, conversations } = makeService();
    const result = await service.batchReply('u1', [
      {
        clientId: 'c1',
        text: 'what did I train yesterday?',
        composedAt: new Date('2026-09-01T06:00:00Z'),
        conversationId: COACHING.id,
      },
      {
        clientId: 'c2',
        text: 'draft the standup note',
        composedAt: new Date('2026-09-01T06:05:00Z'),
        conversationId: OTHER.id,
      },
    ]);

    expect(conversations.resolve).toHaveBeenCalledTimes(2);
    const assistants = created.filter((r) => r.role === 'assistant');
    expect(assistants).toHaveLength(2);
    expect(new Set(assistants.map((r) => r.conversationId))).toEqual(
      new Set([COACHING.id, OTHER.id]),
    );
    expect(result.processed).toBe(2);
  });

  it('reports which client ids it stored', async () => {
    // The device used to mark its whole outbox synced on any success, which
    // discarded rows the server had never seen.
    const { service } = makeService();
    const result = await service.batchReply('u1', [
      {
        clientId: 'c1',
        text: 'hello',
        composedAt: new Date('2026-09-01T06:00:00Z'),
        conversationId: OTHER.id,
      },
    ]);

    expect(result.accepted).toEqual(['c1']);
  });

  it('sends a message with no conversation to the coaching chat', async () => {
    // A client older than named chats, and a message queued before the upgrade.
    const { service, created } = makeService();
    await service.batchReply('u1', [
      { clientId: 'c1', text: 'hello', composedAt: new Date('2026-09-01T06:00:00Z') },
    ]);

    for (const row of created) expect(row.conversationId).toBe(COACHING.id);
  });
});
