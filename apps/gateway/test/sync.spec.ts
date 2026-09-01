import { describe, expect, it, vi } from 'vitest';
import { SyncService } from '../src/sync/sync.service.js';
import { ProtectedConversationError } from '../src/chat/conversations.service.js';

/**
 * The sync contract, with Prisma and the two delegated services stubbed.
 *
 * The rules worth protecting here are the ones whose failure is silent: a
 * cursor that skips a row forever, a slow device clock that discards a user's
 * offline edits, and a server-owned column reachable from a client.
 */
function makeService(
  opts: {
    tombstoneDays?: number;
    serverUpdatedAt?: Date;
    /** The conversation row the server holds, if the test needs one. */
    chatRow?: unknown;
    messages?: unknown[];
  } = {},
) {
  const serverRow = {
    id: 'r1',
    userId: 'u1',
    title: 'Dentist',
    updatedAt: opts.serverUpdatedAt ?? new Date('2026-09-01T12:00:00Z'),
    deletedAt: null,
  };

  const prisma = {
    reminder: {
      findFirst: vi.fn().mockResolvedValue(serverRow),
      findMany: vi.fn().mockResolvedValue([]),
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(opts.chatRow ?? null),
      findUnique: vi.fn().mockResolvedValue(opts.chatRow ?? null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    coachingProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    checkIn: { findMany: vi.fn().mockResolvedValue([]) },
    workoutRecord: { findMany: vi.fn().mockResolvedValue([]) },
    message: { findMany: vi.fn().mockResolvedValue(opts.messages ?? []) },
    device: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const reminders = {
    create: vi.fn().mockResolvedValue(serverRow),
    update: vi.fn().mockResolvedValue(serverRow),
    remove: vi.fn().mockResolvedValue({ id: 'r1', deleted: true }),
  };
  const coaching = { upsertProfile: vi.fn().mockResolvedValue({}) };
  const settings = {
    get: vi.fn().mockResolvedValue(opts.tombstoneDays ?? 30),
  };
  const conversations = {
    upsert: vi.fn().mockResolvedValue({ id: 'c1' }),
    remove: vi.fn().mockResolvedValue({ id: 'c1', deleted: true }),
  };

  const service = new SyncService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reminders as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coaching as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    settings as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conversations as any,
  );
  return { service, prisma, reminders, coaching, conversations, serverRow };
}

/**
 * Times are relative to the real clock on purpose: the service clamps a
 * client's claimed time to the server's now, so a fixture pinned to a fixed
 * date would be "in the future" and get clamped by accident.
 */
const ago = (ms: number) => new Date(Date.now() - ms);

const push = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  clientId: 'c1',
  title: 'Dentist moved',
  updatedAt: ago(10_000),
  ...over,
});

describe('SyncService — pulling', () => {
  it('sends a full snapshot when the device has no cursor', async () => {
    const { service, prisma } = makeService();
    const result = await service.sync('u1', {});

    expect(result.full).toBe(true);
    expect(prisma.reminder.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });

  it('filters every entity on the cursor for a delta', async () => {
    const since = new Date('2026-09-01T10:00:00Z');
    const { service, prisma } = makeService();
    await service.sync('u1', { since, lastMessageId: 412 });

    for (const call of [
      prisma.reminder.findMany,
      prisma.conversation.findMany,
      prisma.checkIn.findMany,
      prisma.workoutRecord.findMany,
      prisma.coachingProfile.findFirst,
    ]) {
      expect(call.mock.calls[0][0].where).toMatchObject({ updatedAt: { gt: since } });
    }
    // Messages are append-only with immutable content, so the autoincrement id
    // is the cursor rather than another timestamp column.
    expect(prisma.message.findMany.mock.calls[0][0].where).toMatchObject({
      userId: 'u1',
      id: { gt: 412 },
    });
  });

  it('includes tombstones so a deletion can reach the device', async () => {
    // A delta cannot express a row that simply vanished.
    const { service, prisma } = makeService();
    await service.sync('u1', { since: new Date('2026-09-01T10:00:00Z') });

    expect(prisma.reminder.findMany.mock.calls[0][0].where).not.toHaveProperty('deletedAt');
  });

  it('hands back a cursor that lags real time', async () => {
    // Load-bearing. A transaction that began before the pull and commits after
    // it would otherwise be skipped forever by the next `updatedAt > since`.
    const { service } = makeService();
    const before = Date.now();
    const result = await service.sync('u1', {});

    expect(new Date(result.now).getTime()).toBeLessThan(before);
  });

  it('falls back to a full snapshot when the cursor predates the tombstone horizon', async () => {
    // Deletions from before the horizon have been purged, so a delta would
    // silently resurrect them on the device.
    const { service, prisma } = makeService({ tombstoneDays: 30 });
    const ancient = new Date(Date.now() - 90 * 86_400_000);
    const result = await service.sync('u1', { since: ancient });

    expect(result.full).toBe(true);
    expect(prisma.reminder.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });

  it('scopes every read to the caller', async () => {
    const { service, prisma } = makeService();
    await service.sync('u1', { since: new Date('2026-09-01T10:00:00Z') });

    for (const call of [
      prisma.reminder.findMany,
      prisma.conversation.findMany,
      prisma.checkIn.findMany,
      prisma.workoutRecord.findMany,
      prisma.message.findMany,
      prisma.coachingProfile.findFirst,
    ]) {
      expect(call.mock.calls[0][0].where).toMatchObject({ userId: 'u1' });
    }
  });

  it('reads conversations after messages, never alongside them', async () => {
    // The foreign key guarantees a conversation exists before any message
    // references it, so this order is what stops a message arriving in a
    // response that does not carry its chat. Reversed, or run in the same
    // Promise.all, a chat created between the two queries produces a message
    // the device has to drop.
    const { service, prisma } = makeService();
    await service.sync('u1', {});

    expect(prisma.conversation.findMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.message.findMany.mock.invocationCallOrder[0],
    );
  });

  it('includes tombstoned conversations, because a delta cannot express a gone row', async () => {
    const { service, prisma } = makeService();
    await service.sync('u1', { since: new Date('2026-09-01T10:00:00Z') });

    expect(prisma.conversation.findMany.mock.calls[0][0].where).not.toHaveProperty('deletedAt');
  });

  it('says there is more when the page came back full', async () => {
    // The device loops on this. Hardcoding the page size client-side would put
    // the same constant in two repositories.
    const full = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }));
    const { service } = makeService({ messages: full });

    const result = await service.sync('u1', {});
    expect(result.moreMessages).toBe(true);
    expect(result.lastMessageId).toBe(200);
  });

  it('says there is no more on a short page', async () => {
    const { service } = makeService({ messages: [{ id: 7 }] });
    await expect(service.sync('u1', {})).resolves.toMatchObject({ moreMessages: false });
  });
});

describe('SyncService — pushing reminders', () => {
  it('creates a reminder that has no server id yet', async () => {
    const { service, reminders } = makeService();
    await service.sync('u1', {
      push: { reminders: [push({ id: undefined, remindAt: new Date('2026-09-05T17:00:00Z') })] },
    });

    expect(reminders.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ clientId: 'c1' }),
    );
  });

  it('accepts an uncontested edit even from an hour-slow clock', async () => {
    // The row has not moved since this device saw it, so no clock is consulted
    // at all — which is what stops a slow handset losing every offline edit.
    const server = ago(60_000);
    const { service, reminders } = makeService({ serverUpdatedAt: server });
    await service.sync('u1', {
      push: { reminders: [push({ updatedAt: ago(3_600_000), baseUpdatedAt: server })] },
    });

    expect(reminders.update).toHaveBeenCalled();
  });

  it('accepts a concurrent edit that is genuinely newer', async () => {
    const { service, reminders } = makeService({ serverUpdatedAt: ago(60_000) });
    await service.sync('u1', {
      push: {
        reminders: [
          push({ updatedAt: ago(10_000), baseUpdatedAt: ago(120_000) }), // stale base
        ],
      },
    });

    expect(reminders.update).toHaveBeenCalled();
  });

  it('accepts an edit made seconds ago against a row touched seconds ago', async () => {
    // The lagged cursor is for the pull window only. Clamping the claimed time
    // to it instead of to real now rejected every edit inside the overlap —
    // which is the ordinary "user edits, phone syncs straight away" case.
    const { service, reminders } = makeService({ serverUpdatedAt: ago(1_000) });
    const result = await service.sync('u1', {
      push: { reminders: [push({ updatedAt: new Date(), baseUpdatedAt: ago(60_000) })] },
    });

    expect(result.rejected).toEqual([]);
    expect(reminders.update).toHaveBeenCalled();
  });

  it('rejects a stale edit and returns the row that won', async () => {
    const { service, reminders, serverRow } = makeService({ serverUpdatedAt: ago(10_000) });
    const result = await service.sync('u1', {
      push: {
        reminders: [
          push({ updatedAt: ago(120_000), baseUpdatedAt: ago(180_000) }),
        ],
      },
    });

    expect(reminders.update).not.toHaveBeenCalled();
    expect(result.rejected[0]).toMatchObject({ id: 'r1', reason: 'stale', server: serverRow });
  });

  it('clamps a device claiming to be in 2099 so it cannot win forever', async () => {
    const { service, reminders } = makeService({
      // Server row is in the future relative to the clamped claim.
      serverUpdatedAt: new Date(Date.now() + 60_000),
    });
    const result = await service.sync('u1', {
      push: {
        reminders: [
          push({
            updatedAt: new Date('2099-01-01T00:00:00Z'),
            baseUpdatedAt: new Date('2026-01-01T00:00:00Z'),
          }),
        ],
      },
    });

    expect(reminders.update).not.toHaveBeenCalled();
    expect(result.rejected[0].reason).toBe('stale');
  });

  it('reports a reminder the server no longer has', async () => {
    const { service, prisma } = makeService();
    prisma.reminder.findFirst.mockResolvedValue(null);
    const result = await service.sync('u1', { push: { reminders: [push()] } });

    expect(result.rejected[0]).toMatchObject({ id: 'r1', reason: 'gone' });
  });

  it('routes a delete request through the tombstone path', async () => {
    const server = ago(60_000);
    const { service, reminders } = makeService({ serverUpdatedAt: server });
    await service.sync('u1', {
      push: { reminders: [push({ deleted: true, baseUpdatedAt: server })] },
    });

    expect(reminders.remove).toHaveBeenCalledWith('u1', 'r1');
    expect(reminders.update).not.toHaveBeenCalled();
  });
});

describe('SyncService — pushing the profile', () => {
  it('applies the fields a client may write', async () => {
    const { service, coaching } = makeService();
    await service.sync('u1', {
      push: { profile: { timezone: 'Africa/Cairo', optedIn: true } as never },
    });

    expect(coaching.upsertProfile).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ timezone: 'Africa/Cairo', optedIn: true }),
    );
  });

  it('does not consult a timestamp, because the column sets are disjoint', async () => {
    // The nightly tick bumps the profile's updatedAt twice a day; comparing
    // timestamps here would read that as a conflict and reject real edits.
    const { service, coaching } = makeService({
      serverUpdatedAt: new Date('2099-01-01T00:00:00Z'),
    });
    await service.sync('u1', { push: { profile: { optedIn: true } as never } });

    expect(coaching.upsertProfile).toHaveBeenCalled();
  });
});

describe('SyncService — pushing conversations', () => {
  const chat = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    title: 'Trip planning',
    updatedAt: ago(10_000),
    ...over,
  });
  const serverChat = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    userId: 'u1',
    title: 'Old name',
    clientId: null,
    deletedAt: null,
    updatedAt: ago(60_000),
    ...over,
  });

  it('creates a chat the server has never seen rather than refusing it', async () => {
    // Started offline, and its first message may already be on the way.
    const { service, conversations } = makeService();
    const result = await service.sync('u1', { push: { conversations: [chat()] } });

    expect(conversations.upsert).toHaveBeenCalledWith('u1', 'c1', {
      title: 'Trip planning',
      pinned: undefined,
      archived: undefined,
    });
    expect(result.rejected).toEqual([]);
  });

  it('does not resurrect one that was deleted', async () => {
    const row = serverChat({ deletedAt: new Date() });
    const { service, conversations } = makeService({ chatRow: row });
    const result = await service.sync('u1', { push: { conversations: [chat()] } });

    expect(conversations.upsert).not.toHaveBeenCalled();
    expect(result.rejected[0]).toMatchObject({ entity: 'conversation', reason: 'gone' });
  });

  it('accepts a rename whose base still matches, with no clock involved', async () => {
    const base = ago(60_000);
    const { service, conversations } = makeService({ chatRow: serverChat({ updatedAt: base }) });
    await service.sync('u1', {
      push: { conversations: [chat({ updatedAt: ago(3_600_000), baseUpdatedAt: base })] },
    });

    expect(conversations.upsert).toHaveBeenCalled();
  });

  it('rejects a stale rename and hands back the row that won', async () => {
    const row = serverChat({ updatedAt: ago(10_000) });
    const { service, conversations } = makeService({ chatRow: row });
    const result = await service.sync('u1', {
      push: { conversations: [chat({ updatedAt: ago(120_000), baseUpdatedAt: ago(180_000) })] },
    });

    expect(conversations.upsert).not.toHaveBeenCalled();
    expect(result.rejected[0]).toMatchObject({
      entity: 'conversation',
      reason: 'stale',
      server: row,
    });
  });

  it('labels every rejection with its table', async () => {
    // Without this the device writes a rejected conversation back through the
    // reminder path — corruption, not a crash.
    const { service } = makeService({ chatRow: serverChat({ deletedAt: new Date() }) });
    const result = await service.sync('u1', { push: { conversations: [chat()] } });

    expect(result.rejected.every((r) => r.entity === 'conversation')).toBe(true);
  });

  it('refuses to delete the coaching chat, and says so distinctly', async () => {
    // Not 'stale': that would tell the phone to retry with a fresher timestamp,
    // and it would then retry for ever.
    const base = ago(60_000);
    const { service, conversations } = makeService({
      chatRow: serverChat({ clientId: 'coaching', updatedAt: base }),
    });
    conversations.remove.mockRejectedValueOnce(new ProtectedConversationError());

    const result = await service.sync('u1', {
      push: { conversations: [chat({ deleted: true, baseUpdatedAt: base })] },
    });

    expect(result.rejected[0]).toMatchObject({ entity: 'conversation', reason: 'protected' });
  });

  it('routes a delete through the tombstone path', async () => {
    const base = ago(60_000);
    const { service, conversations } = makeService({ chatRow: serverChat({ updatedAt: base }) });
    await service.sync('u1', {
      push: { conversations: [chat({ deleted: true, baseUpdatedAt: base })] },
    });

    expect(conversations.remove).toHaveBeenCalledWith('u1', 'c1');
  });

  it('ignores a delete for a chat the server never had', async () => {
    // Created and deleted entirely offline. Creating it just to tombstone it
    // would be two writes to reach the state of having done nothing.
    const { service, conversations } = makeService();
    const result = await service.sync('u1', {
      push: { conversations: [chat({ deleted: true })] },
    });

    expect(conversations.upsert).not.toHaveBeenCalled();
    expect(conversations.remove).not.toHaveBeenCalled();
    expect(result.rejected).toEqual([]);
  });

  it('scopes the lookup to the caller', async () => {
    const { service, prisma } = makeService();
    await service.sync('u1', { push: { conversations: [chat()] } });

    expect(prisma.conversation.findFirst.mock.calls[0][0].where).toMatchObject({ userId: 'u1' });
  });
});

describe('SyncService — the device watermark', () => {
  it('marks how much of the world this device holds, at the cursor instant', async () => {
    // The sweep compares this against a ping's creation time to decide whether
    // the phone already has a local alarm, so the two must mean the same thing.
    const { service, prisma } = makeService();
    const result = await service.sync('u1', { installId: 'install-1' });

    expect(prisma.device.updateMany).toHaveBeenCalledWith({
      where: { installId: 'install-1', userId: 'u1' },
      data: { lastSeenAt: new Date(result.now) },
    });
  });

  it('touches nothing when the device did not identify itself', async () => {
    const { service, prisma } = makeService();
    await service.sync('u1', {});
    expect(prisma.device.updateMany).not.toHaveBeenCalled();
  });
});
