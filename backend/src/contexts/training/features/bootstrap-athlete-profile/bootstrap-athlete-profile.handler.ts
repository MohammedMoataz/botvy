import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { AthleteProfile } from '../../domain/athlete-profile.aggregate.js';
import { AthleteProfileRepository } from '../../domain/training.repositories.js';

/**
 * Gives a new member an athlete profile, so the read side can promise one.
 *
 * ## Why the empty document exists at all
 *
 * `AthleteProfile`'s own note has the argument: a nullable profile puts a "have
 * they set this up yet" branch into the Athlete screen, the coach prompt, the
 * materialiser and every query, and four copies of one question is how they
 * come to disagree. An empty profile answers "no sports, no slots", which every
 * caller can render — and story 1 scenario 3 asks for exactly that, an
 * invitation rather than an empty grid.
 *
 * ## Idempotent, because the relay is at-least-once
 *
 * Identity is on PostgreSQL and this context is on MongoDB, so no transaction
 * spans them: the event goes through `identity_outbox` in the same transaction
 * as the account and the relay forwards it, at least once. A second delivery
 * must create nothing **and must not throw** — throwing would make the relay
 * retry for ever on a member who is already correctly set up.
 *
 * `AthleteProfile.empty` raises nothing, deliberately, so there is no
 * `AthleteProfileCreated` event for a second delivery to duplicate either.
 * The write is still inside `uow.run`, which is not ceremony: the unit of work
 * is what makes the read-then-write one statement, and a later change that
 * gives the empty profile an event does not then have to remember to add one.
 *
 * ## Nothing is seeded from the registry here
 *
 * Unlike Profile's bootstrap, which reads a dozen defaults, there is nothing an
 * operator could sensibly pre-fill: a member's sports and their week are theirs
 * alone, and an installation-wide "default weekly timetable" would materialise
 * a fortnight of sessions nobody asked for on the day they registered.
 */
@Injectable()
export class BootstrapAthleteProfileHandler {
  private readonly logger = new Logger(BootstrapAthleteProfileHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: AthleteProfileRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'created' | 'already-there'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; no athlete profile to write`,
      );
      return 'already-there';
    }

    return this.uow.run(async () => {
      if (await this.profiles.find(userId)) return 'already-there';

      // `event.occurredAt` rather than now: the profile's `updatedAt` should
      // say when the member registered, not when the relay got around to it.
      await this.profiles.save(AthleteProfile.empty(userId, event.occurredAt));
      this.logger.log(`athlete profile created for ${userId}`);
      return 'created';
    });
  }
}
