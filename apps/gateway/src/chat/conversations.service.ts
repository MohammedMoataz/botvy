import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';

/**
 * The one thread the nightly cycle speaks into.
 *
 * A reserved `clientId` rather than a `kind` column: `@@unique([userId,
 * clientId])` already makes it exactly one per user, enforced by the database
 * instead of by app code that has to remember.
 */
export const COACHING_CLIENT_ID = 'coaching';

export interface ConversationPatch {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
}

/**
 * Conversations, for chat and for the nightly cycle.
 *
 * Its own service rather than part of ChatService because NightlyService needs
 * it too, and ChatModule already imports CoachingModule — putting it in
 * ChatService would make that a cycle.
 *
 * There is no controller. Every action on a conversation is a field value, and
 * every one of them has to survive being made with no connection, so they all
 * ride the outbox through `/sync` exactly as reminders do. A REST route that
 * only worked online would be dead code the day it shipped.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The conversation a message belongs to.
   *
   * An id the server has never seen is *created*, not rejected: a chat started
   * offline has to carry a message before the sync that would have created it
   * has drained. An id that has been deleted is not-found, so a late send from
   * a device that had not yet heard about the delete cannot resurrect it — the
   * same rule reminders use.
   *
   * With no id at all (a client from before conversations existed) the message
   * goes to the coaching thread, which is also where the device shows a message
   * it has no conversation for.
   */
  async resolve(userId: string, id: string | undefined) {
    if (!id) return this.ensureCoaching(userId);

    const existing = await this.prisma.conversation.findFirst({ where: { id, userId } });
    if (existing) {
      if (existing.deletedAt) throw new NotFoundException('Conversation not found');
      return existing;
    }

    // A uuid that already exists under another account must never be adopted:
    // findFirst above is scoped to userId, so we would otherwise try to create
    // a row whose primary key is taken and fail with a confusing constraint
    // error rather than an honest 404.
    const foreign = await this.prisma.conversation.findUnique({ where: { id } });
    if (foreign) throw new NotFoundException('Conversation not found');

    try {
      return await this.prisma.conversation.create({ data: { id, userId } });
    } catch (err) {
      // Two sends racing on the same brand-new id. The loser re-reads rather
      // than failing the user's message.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.prisma.conversation.findFirst({ where: { id, userId } });
        if (raced) return raced;
      }
      throw err;
    }
  }

  /**
   * The coaching thread, created if this user has never had one.
   *
   * The update clause revives it: a client that somehow deleted or archived it
   * gets it back on the next nightly rather than leaving the check-in with
   * nowhere to land.
   */
  async ensureCoaching(userId: string) {
    const titles = await this.settings.get('coaching.conversationTitle');
    const title = titles.en ?? 'Coaching';
    return this.prisma.conversation.upsert({
      where: { userId_clientId: { userId, clientId: COACHING_CLIENT_ID } },
      create: { userId, clientId: COACHING_CLIENT_ID, title },
      update: { deletedAt: null, archived: false },
    });
  }

  list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * Creates or edits by id. The phone mints the id, so a create and an edit are
   * the same write on the wire and a retried create cannot make a second row.
   */
  async upsert(userId: string, id: string, patch: ConversationPatch) {
    const existing = await this.prisma.conversation.findFirst({ where: { id, userId } });
    if (!existing) {
      const foreign = await this.prisma.conversation.findUnique({ where: { id } });
      if (foreign) throw new NotFoundException('Conversation not found');
      return this.prisma.conversation.create({ data: { id, userId, ...clean(patch) } });
    }
    this.assertNotArchivingCoaching(existing.clientId, patch);
    return this.prisma.conversation.update({ where: { id }, data: clean(patch) });
  }

  /**
   * A tombstone plus a hard delete of what was said in it.
   *
   * The messages go now rather than at purge time so the thread really is gone
   * from the only process that writes the database; the tombstone is what
   * carries the deletion to every device, and the sweep removes it later.
   */
  async remove(userId: string, id: string) {
    const existing = await this.ownedOrThrow(userId, id);
    if (existing.clientId === COACHING_CLIENT_ID) {
      throw new ProtectedConversationError();
    }
    await this.prisma.message.deleteMany({ where: { conversationId: id } });
    await this.prisma.conversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id, deleted: true };
  }

  /**
   * A new, empty chat with a server-minted id.
   *
   * Used when a message typed in the coaching chat turns out not to belong to
   * the coaching track: it gets a thread of its own rather than being refused.
   */
  createFor(userId: string) {
    return this.prisma.conversation.create({ data: { userId } });
  }

  /**
   * Empties a chat without deleting it.
   *
   * The messages are removed for real, and the watermark records how far the
   * clearing went so every other device can do the same — a message carries no
   * tombstone, and the device pulls by `id > lastMessageId`, so a hard delete
   * alone would be invisible to a phone that already had them.
   *
   * This is the only way to empty the coaching chat, which cannot be deleted.
   */
  async clearMessages(userId: string, id: string) {
    const conversation = await this.ownedOrThrow(userId, id);

    const newest = await this.prisma.message.findFirst({
      where: { conversationId: id },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (!newest) return conversation; // already empty; nothing to record

    await this.prisma.message.deleteMany({
      // Bounded by the id we just read rather than "everything in this chat":
      // a message arriving mid-clear is newer than the watermark, so it
      // survives here and is not dropped on the devices either.
      where: { conversationId: id, id: { lte: newest.id } },
    });
    return this.prisma.conversation.update({
      where: { id },
      data: { clearedUpToMessageId: newest.id },
    });
  }

  /** Writes one of the nightly cycle's own messages into the coaching thread. */
  async speak(userId: string, content: string) {
    const conversation = await this.ensureCoaching(userId);
    await this.prisma.message.create({
      data: { userId, conversationId: conversation.id, role: 'assistant', content },
    });
    return conversation;
  }

  private async ownedOrThrow(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation || conversation.userId !== userId || conversation.deletedAt) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private assertNotArchivingCoaching(clientId: string | null, patch: ConversationPatch) {
    // Renaming and pinning it are fine. Archiving means hidden, and the nightly
    // has to land somewhere the user can see.
    if (clientId === COACHING_CLIENT_ID && patch.archived === true) {
      throw new ProtectedConversationError();
    }
  }
}

/** The coaching thread cannot be deleted or archived. */
export class ProtectedConversationError extends Error {
  constructor() {
    super('The coaching conversation cannot be removed');
  }
}

function clean(patch: ConversationPatch) {
  // undefined only — an empty title is a real value (it means "unnamed", which
  // is what the client renders the first message for).
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
}
