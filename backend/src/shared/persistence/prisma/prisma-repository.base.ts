import type { DomainEvent } from '../../cqrs/domain-event.js';
import type { AggregateRoot } from '../ports/aggregate-root.js';
import type { Mapper } from '../ports/mapper.js';
import { Repository } from '../ports/repository.js';
import { StaleWriteError } from '../ports/errors.js';
import type { PrismaService, PrismaTransaction } from './prisma.service.js';
import { PrismaUnitOfWork, toIdentityOutboxRow } from './prisma-unit-of-work.js';

/**
 * The minimum a Prisma model delegate has to offer for the base to drive it.
 * Declared structurally rather than imported from the generated client: the
 * generated delegate types are not stable across Prisma majors, and pinning to
 * them would make an upgrade a compile error in every adapter.
 */
export interface PrismaDelegate<Row> {
  findFirst(args: unknown): Promise<Row | null>;
  upsert(args: unknown): Promise<Row>;
  delete(args: unknown): Promise<Row>;
}

/**
 * The PostgreSQL half of the repository port, used only by Identity.
 *
 * The load-bearing difference from the Mongo base: this one cannot append to
 * the Mongo outbox, because that would be a second store inside one logical
 * write. It writes the aggregate's events to `identity_outbox` **in the same
 * transaction**, and the worker's forwarder carries them across. A post-commit
 * write to Mongo would be at-most-once — a crash between the two loses the
 * event and leaves nothing to say it was owed.
 */
export abstract class PrismaRepositoryBase<T extends AggregateRoot, Row> extends Repository<T> {
  protected abstract readonly mapper: Mapper<T, Row>;

  constructor(protected readonly prisma: PrismaService) {
    super();
  }

  /** The delegate for this aggregate's table, off whichever client is in force. */
  protected abstract delegate(client: PrismaTransaction | PrismaService): PrismaDelegate<Row>;

  /** The transaction client if we are inside one, otherwise the base client. */
  protected client(): PrismaTransaction | PrismaService {
    return PrismaUnitOfWork.currentTx() ?? this.prisma;
  }

  async findById(userId: string, id: string): Promise<T | null> {
    const row = await this.delegate(this.client()).findFirst({ where: { id, userId } });
    return row ? this.mapper.toDomain(row) : null;
  }

  async save(aggregate: T): Promise<void> {
    const client = this.client();
    const row = this.mapper.toPersistence(aggregate);
    const events = aggregate.pullEvents();

    const current = await this.delegate(client).findFirst({
      where: { id: aggregate.id },
      select: { updatedAt: true },
    });
    const storedUpdatedAt = (current as { updatedAt?: Date } | null)?.updatedAt;
    if (storedUpdatedAt && storedUpdatedAt > aggregate.updatedAt) {
      throw new StaleWriteError(String(aggregate.id));
    }

    await this.delegate(client).upsert({
      where: { id: aggregate.id },
      create: row,
      update: row,
    });

    await this.appendToIdentityOutbox(client, events);
  }

  async remove(aggregate: T): Promise<void> {
    const client = this.client();
    const events = aggregate.pullEvents();
    await this.delegate(client).delete({ where: { id: aggregate.id } });
    await this.appendToIdentityOutbox(client, events);
  }

  /**
   * Inside the caller's transaction. If there is none, the write still happens —
   * a script using a repository directly should not silently lose its events —
   * but every handler path runs inside `UnitOfWork.run`.
   */
  protected async appendToIdentityOutbox(
    client: PrismaTransaction | PrismaService,
    events: DomainEvent[],
  ): Promise<void> {
    if (events.length === 0) return;
    const outbox = (client as unknown as { identityOutbox: { createMany(args: unknown): Promise<unknown> } })
      .identityOutbox;
    await outbox.createMany({ data: events.map(toIdentityOutboxRow) });
  }
}
