import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  COACHING_CLIENT_ID,
  ConversationsService,
  ProtectedConversationError,
} from '../src/chat/conversations.service.js';

/**
 * Conversations. What is worth protecting here is ownership and the coaching
 * thread: an id is minted by the phone, so the server must never adopt one that
 * belongs to somebody else, must never resurrect one that has been deleted, and
 * must keep the one place the nightly cycle can speak.
 */
function makeService(opts: { own?: unknown; foreign?: unknown } = {}) {
  const prisma = {
    conversation: {
      findFirst: vi.fn().mockResolvedValue(opts.own ?? null),
      findUnique: vi.fn().mockResolvedValue(opts.foreign ?? opts.own ?? null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
      upsert: vi.fn().mockResolvedValue({ id: 'coach', clientId: COACHING_CLIENT_ID }),
    },
    message: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
  };
  const settings = { get: vi.fn().mockResolvedValue({ en: 'Coaching', ar: 'التدريب' }) };
  const service = new ConversationsService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings as any,
  );
  return { service, prisma };
}

const OWN = { id: 'c1', userId: 'u1', clientId: null, deletedAt: null };

describe('resolve', () => {
  it('returns a chat this user already has', async () => {
    const { service, prisma } = makeService({ own: OWN });
    await expect(service.resolve('u1', 'c1')).resolves.toBe(OWN);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('creates one the server has never seen', async () => {
    // A chat started offline has to accept a message before the sync that would
    // have created it has drained.
    const { service, prisma } = makeService();
    await service.resolve('u1', 'fresh-uuid');

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { id: 'fresh-uuid', userId: 'u1' },
    });
  });

  it('refuses to resurrect a deleted one', async () => {
    const deleted = { ...OWN, deletedAt: new Date() };
    const { service } = makeService({ own: deleted });
    await expect(service.resolve('u1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never adopts an id that belongs to another account', async () => {
    // findFirst is scoped to the caller, so someone else's row reads as absent
    // — without the second lookup we would try to create a row on a taken key.
    const { service, prisma } = makeService({ foreign: { id: 'c1', userId: 'someone-else' } });
    await expect(service.resolve('u1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('sends a message with no chat named to the coaching one', async () => {
    const { service, prisma } = makeService();
    const conversation = await service.resolve('u1', undefined);

    expect(prisma.conversation.upsert).toHaveBeenCalled();
    expect(conversation.clientId).toBe(COACHING_CLIENT_ID);
  });
});

describe('ensureCoaching', () => {
  it('is keyed so a user can only ever have one', async () => {
    const { service, prisma } = makeService();
    await service.ensureCoaching('u1');

    expect(prisma.conversation.upsert.mock.calls[0][0].where).toEqual({
      userId_clientId: { userId: 'u1', clientId: COACHING_CLIENT_ID },
    });
  });

  it('revives one that was deleted or archived', async () => {
    // Otherwise the nightly check-in has nowhere to land and goes quiet.
    const { service, prisma } = makeService();
    await service.ensureCoaching('u1');

    expect(prisma.conversation.upsert.mock.calls[0][0].update).toEqual({
      deletedAt: null,
      archived: false,
    });
  });

  it('names it from the setting, not a constant', async () => {
    const { service, prisma } = makeService();
    await service.ensureCoaching('u1');

    expect(prisma.conversation.upsert.mock.calls[0][0].create.title).toBe('Coaching');
  });
});

describe('the coaching chat is protected', () => {
  const coaching = { id: 'coach', userId: 'u1', clientId: COACHING_CLIENT_ID, deletedAt: null };

  it('cannot be deleted', async () => {
    const { service, prisma } = makeService({ own: coaching, foreign: coaching });
    await expect(service.remove('u1', 'coach')).rejects.toBeInstanceOf(ProtectedConversationError);
    expect(prisma.message.deleteMany).not.toHaveBeenCalled();
  });

  it('cannot be archived, because the nightly has to be visible', async () => {
    const { service } = makeService({ own: coaching, foreign: coaching });
    await expect(
      service.upsert('u1', 'coach', { archived: true }),
    ).rejects.toBeInstanceOf(ProtectedConversationError);
  });

  it('can still be renamed and pinned', async () => {
    const { service, prisma } = makeService({ own: coaching, foreign: coaching });
    await service.upsert('u1', 'coach', { title: 'My coach', pinned: true });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'coach' },
      data: { title: 'My coach', pinned: true },
    });
  });
});

describe('remove', () => {
  it('tombstones the chat and deletes what was said in it', async () => {
    // The tombstone is what carries the deletion to other devices; the messages
    // go now so the gateway is not holding a deleted chat's contents.
    const { service, prisma } = makeService({ own: OWN, foreign: OWN });
    await service.remove('u1', 'c1');

    expect(prisma.message.deleteMany).toHaveBeenCalledWith({ where: { conversationId: 'c1' } });
    expect(prisma.conversation.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('reports a chat belonging to another account as not found', async () => {
    const { service } = makeService({ foreign: { ...OWN, userId: 'u2' } });
    await expect(service.remove('u1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('upsert', () => {
  it('clears a title but leaves an unmentioned field alone', async () => {
    // An empty title is a real value — it means unnamed, and the client then
    // shows the first message instead.
    const { service, prisma } = makeService({ own: OWN, foreign: OWN });
    await service.upsert('u1', 'c1', { title: '', pinned: undefined });

    expect(prisma.conversation.update.mock.calls[0][0].data).toEqual({ title: '' });
  });
});

describe('speak', () => {
  it('writes the nightly message into the coaching chat', async () => {
    const { service, prisma } = makeService();
    await service.speak('u1', "Today's program: push day");

    expect(prisma.message.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      conversationId: 'coach',
      role: 'assistant',
      content: "Today's program: push day",
    });
  });
});
