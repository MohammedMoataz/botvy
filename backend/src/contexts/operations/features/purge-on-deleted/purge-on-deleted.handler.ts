import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UsageRepository } from '../../domain/usage.repository.js';

/**
 * Removes every `usage_log` row a deleted member had.
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this collection is on MongoDB — so no transaction can span
 * them and the event is the only way across.
 *
 * The rows would go on their own within ninety days, on the TTL index the
 * migration declares, and waiting is still the wrong answer. `usage_log` holds
 * what a named member asked a model and how long it took; ninety days of that
 * for an account somebody deleted is ninety days of data nobody may look at and
 * nobody can explain keeping. The TTL exists to bound the collection's size, not
 * to serve as an erasure mechanism.
 *
 * The class is named for its context rather than for the event, because six
 * `*PurgeOnDeletedHandler` classes now meet in one import list in
 * `relay.module.ts`; two called the same thing is a rename under pressure at the
 * moment somebody is adding the seventh.
 *
 * No unit of work: one `deleteMany` is atomic by itself, and there is no
 * aggregate here and no outbox event to keep in step with it. Wrapping it in a
 * transaction would buy nothing and would suggest to a reader that something
 * else in this handler needed to commit alongside it.
 *
 * Idempotent, because the relay delivers at least once: the second delivery
 * finds nothing and reports so rather than failing.
 */
@Injectable()
export class OperationsPurgeOnDeletedHandler {
  private readonly logger = new Logger(OperationsPurgeOnDeletedHandler.name);

  constructor(private readonly usage: UsageRepository) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const removed = await this.usage.removeAllFor(userId);
    if (removed === 0) return 'nothing-to-do';

    this.logger.log(`purged ${removed} usage row(s) for ${userId}`);
    return 'purged';
  }
}
