import { describe, expect, it, vi } from 'vitest';
import { ChatService } from '../src/chat/chat.service.js';
import { formatInTz } from '../src/common/time.js';

/**
 * The offline flush. What matters here is that re-sending a batch cannot
 * duplicate anything, that a reminder typed offline is resolved against the
 * time it was typed rather than the time it arrived, and that the whole batch
 * costs one reply rather than one per message.
 */
function makeService(opts: { stored?: string[]; intent?: unknown } = {}) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    message: {
      findMany: vi
        .fn()
        .mockResolvedValue((opts.stored ?? []).map((clientId) => ({ clientId }))),
      create: vi.fn().mockImplementation(({ data }) => {
        created.push(data);
        return Promise.resolve({ id: created.length, ...data });
      }),
    },
  };

  async function* tokens() {
    yield 'Got it.';
  }
  const llm = {
    modelName: 'test-model',
    extract: vi.fn().mockResolvedValue(opts.intent ?? null),
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
  };
  const settings = { get: vi.fn().mockResolvedValue(20) };
  // A queued message is answered from the conversation, never from the web:
  // the batch path does not search.
  const search = { search: vi.fn().mockResolvedValue([]) };

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
  );
  return { service, prisma, llm, reminders, search, created };
}

const COMPOSED = new Date('2026-09-01T06:00:00Z');
const batch = [
  { clientId: 'c1', text: 'remind me to call mum in 2 hours', composedAt: COMPOSED },
  { clientId: 'c2', text: 'how did my week go?', composedAt: new Date('2026-09-01T06:05:00Z') },
];

describe('ChatService.batchReply', () => {
  it('answers a whole batch with one reply', async () => {
    const { service, llm } = makeService();
    const result = await service.batchReply('u1', batch);

    expect(result.processed).toBe(2);
    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe('Got it.');
  });

  it('looks for duplicates only within this user\'s own messages', async () => {
    const { service, prisma } = makeService();
    await service.batchReply('u1', batch);

    expect(prisma.message.findMany.mock.calls[0][0].where).toMatchObject({ userId: 'u1' });
  });

  it('does nothing when the same batch is sent twice', async () => {
    const { service, llm, prisma } = makeService({ stored: ['c1', 'c2'] });
    const result = await service.batchReply('u1', batch);

    expect(result).toMatchObject({ processed: 0, duplicates: ['c1', 'c2'], reply: null });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('processes only the messages that did not land the first time', async () => {
    const { service, created } = makeService({ stored: ['c1'] });
    const result = await service.batchReply('u1', batch);

    expect(result.processed).toBe(1);
    expect(created.filter((m) => m.role === 'user').map((m) => m.clientId)).toEqual(['c2']);
  });

  it('resolves a queued message against when it was typed, not when it arrived', async () => {
    const { service, llm } = makeService();
    await service.batchReply('u1', [batch[0]]);

    // The reference handed to the model is the composing moment on the user's
    // own clock — 06:00 UTC is 09:00 in Cairo — not the moment of the flush.
    const prompt = llm.extract.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('09:00');
    expect(prompt).toContain(formatInTz(COMPOSED, 'Africa/Cairo'));
  });

  it('creates the reminder a queued message asked for and tells the model it is done', async () => {
    const { service, reminders, llm } = makeService({
      intent: {
        intent: 'set_reminder',
        title: 'call mum',
        remindAt: '2026-09-01T08:00:00Z',
        needsClarification: false,
        clarifyQuestion: '',
      },
    });
    reminders.create.mockResolvedValue({
      title: 'call mum',
      remindAt: new Date('2026-09-01T08:00:00Z'),
    });

    const result = await service.batchReply('u1', [batch[0]]);

    expect(reminders.create).toHaveBeenCalled();
    expect(result.actions[0]).toMatchObject({ clientId: 'c1', intent: 'set_reminder' });
    const sent = llm.chat.mock.calls[0][0];
    expect(sent[sent.length - 1].content).toContain('Already handled');
  });
});
