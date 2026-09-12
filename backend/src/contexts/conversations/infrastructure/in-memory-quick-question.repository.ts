import { Injectable } from '@nestjs/common';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import type { ConversationKind } from '../domain/conversation.aggregate.js';
import {
  QuickQuestionRepository,
  type QuickQuestion,
} from '../domain/quick-question.repository.js';

/**
 * `quick_questions` in memory, held to the Mongo adapter's promises.
 *
 * Three of them, and each one is a place where a looser twin would let a
 * handler spec pass over behaviour the real store does not have:
 *
 * 1. **`forMember` returns the globals and this member's own, nothing else.**
 *    The whole of FR-010's "for them only". An adapter that returned every row
 *    would make a leak look like a longer list, and a spec asserting "the
 *    member's own question is offered" would pass against it.
 * 2. **`findOwn` never finds a global.** `userId: null` is not a member id, so
 *    the filter excludes it — which is what makes "a member cannot delete a
 *    seeded question" a fact about the store rather than a rule a handler has
 *    to remember.
 * 3. **`order` then `createdAt`, ascending.** The same sort as the Mongo
 *    adapter, because the seed gives alternatives at one rank the same `order`
 *    and a spec that asserted a stable list against an unsorted adapter would
 *    be asserting insertion order.
 *
 * Enlisted with the unit of work so a rolled-back transaction takes its rows
 * with it, like every other in-memory adapter in this context.
 */
@Injectable()
export class InMemoryQuickQuestionRepository extends QuickQuestionRepository {
  readonly rows = new Map<string, QuickQuestion>();

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows);
  }

  async forMember(
    userId: string,
    scope: ConversationKind,
  ): Promise<QuickQuestion[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.scope === scope &&
          row.enabled &&
          (row.userId === null || row.userId === userId),
      )
      .sort(
        (a, b) =>
          a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((row) => structuredClone(row));
  }

  async findOwn(userId: string, id: string): Promise<QuickQuestion | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    return structuredClone(row);
  }

  async save(question: QuickQuestion): Promise<void> {
    this.rows.set(question.id, structuredClone(question));
  }

  async remove(question: QuickQuestion): Promise<void> {
    const row = this.rows.get(question.id);
    if (!row || row.userId !== question.userId) return;
    this.rows.delete(question.id);
  }

  async removeAllFor(userId: string): Promise<number> {
    let removed = 0;
    // No copy: `Map`'s iterator tolerates deleting the entry it is standing on,
    // so the spread would only allocate a second array of everything.
    for (const [id, row] of this.rows) {
      // Strict equality, so a seeded global (`userId: null`) is never reached
      // however this is called.
      if (row.userId !== userId) continue;
      this.rows.delete(id);
      removed += 1;
    }
    return removed;
  }
}
