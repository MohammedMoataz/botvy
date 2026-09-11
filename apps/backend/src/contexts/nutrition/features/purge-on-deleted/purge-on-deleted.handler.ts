import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  MealRepository,
  MealSuggestionRepository,
} from '../../domain/nutrition.repositories.js';

/**
 * Removes everything a deleted member ever ate (T753's pattern, sixth copy).
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this context is on MongoDB — so no transaction spans them and
 * the event is the only way across. Deliberately identical in shape to
 * Knowledge's, Training's and Meetings': a member asking to be erased should
 * not be erased differently depending on which collection they are in.
 *
 * **Hard deletes, not tombstones.** A tombstone exists to tell the member's
 * other devices about a deletion and to fill the Deleted view; neither reason
 * survives the account going away.
 *
 * The day rows go first and the library second, for the reason every other copy
 * of this handler gives about its index: a pass that fails half way through
 * leaves the meals as the record of what still needs clearing, and the next
 * delivery finishes the job.
 */
@Injectable()
export class NutritionPurgeOnDeletedHandler {
  private readonly logger = new Logger(NutritionPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
    private readonly suggestions: MealSuggestionRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const counts = await this.uow.run(async () => {
      const days = await this.suggestions.removeAllFor(userId);
      const meals = await this.meals.removeAllFor(userId);
      return { days, meals };
    });

    if (counts.days + counts.meals === 0) return 'nothing-to-do';

    this.logger.log(
      `purged ${counts.meals} meal(s) and ${counts.days} day(s) for ${userId}`,
    );
    return 'purged';
  }
}

/**
 * Erasing Nutrition's tombstones once they are past the horizon.
 *
 * Neither the member's own purge of one row nor a deleted account's everything,
 * but a sweep over every member's rows by *age*, run on a timer and reached
 * through `TombstonePurgePort`.
 *
 * Only `meals` has tombstones: a day's row is server-written, never synced and
 * never deleted — a day does not stop having happened, and FR-011 is the reason
 * the row exists at all.
 *
 * The horizon is `reminders.tombstoneDays`, passed in as a date by the sweep.
 * That the whole platform shares one key is load-bearing for the clients:
 * `/sync`'s full-snapshot rule reads the same value, and a per-context horizon
 * would make "how long may a device be away" a question with six answers.
 */
@Injectable()
export class PurgeMealTombstonesHandler {
  private readonly logger = new Logger(PurgeMealTombstonesHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly meals: MealRepository,
  ) {}

  async purgeTombstones(before: Date, userId?: string): Promise<number> {
    return this.uow.run(async () => {
      const purged = await this.meals.purgeTombstonesBefore(before, userId);
      if (purged > 0) {
        this.logger.log(
          `purged ${purged} meal(s) deleted before ${before.toISOString()}`,
        );
      }
      return purged;
    });
  }
}
