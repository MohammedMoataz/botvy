import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  CheckinRepository,
  DailyPlanRepository,
  RhythmStateRepository,
} from '../../domain/rhythm.repositories.js';

/**
 * Removes every plan, check-in and rhythm row a deleted member had.
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this context is on MongoDB, so no transaction can span them
 * and the event is the only way across.
 *
 * **Hard deletes, not tombstones.** Elsewhere a delete is a tombstone, because
 * a tombstone is how a deletion reaches the member's other devices and because
 * the Deleted view exists to show them what they removed. Neither reason
 * survives the account going away: there is no device left to tell, and no
 * member left to show. "Deleted" here has to mean gone.
 *
 * The streak is the part worth naming. `RhythmState.streak.best` is the one
 * value in this context that is not recoverable from the check-in rows, so it
 * is also the one that would outlive the account if this handler forgot the
 * state row and purged only plans and check-ins — a member's personal record,
 * kept after they asked to be erased.
 *
 * Idempotent, because the relay delivers at least once: two deliveries collapse
 * to one purge and the second reports nothing rather than failing.
 */
@Injectable()
export class RhythmPurgeOnDeletedHandler {
  private readonly logger = new Logger(RhythmPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly plans: DailyPlanRepository,
    private readonly checkins: CheckinRepository,
    private readonly states: RhythmStateRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    const [plans, checkins, states] = await this.uow.run(async () => {
      // Plans and check-ins before the state row, and in that order for the
      // same reason the sync facade orders its applies: the state is the
      // summary of the other two, so a future reader looking for the dependency
      // direction should find one answer rather than two. Nothing observes the
      // intermediate state inside one transaction.
      const removedPlans = await this.plans.removeAllFor(userId);
      const removedCheckins = await this.checkins.removeAllFor(userId);
      const removedStates = await this.states.removeAllFor(userId);
      return [removedPlans, removedCheckins, removedStates];
    });

    if (plans === 0 && checkins === 0 && states === 0) return 'nothing-to-do';

    this.logger.log(
      `purged ${plans} plan(s), ${checkins} check-in(s) and ${states} rhythm state(s) for ${userId}`,
    );
    return 'purged';
  }
}
