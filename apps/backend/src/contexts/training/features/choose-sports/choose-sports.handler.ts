import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { AthleteProfile } from '../../domain/athlete-profile.aggregate.js';
import { AthleteProfileRepository } from '../../domain/training.repositories.js';

/**
 * What the member practises (FR-001).
 *
 * ## Wholesale, because that is what the picker sends
 *
 * The screen is a set of toggles plus a text field; the member arranges the set
 * and saves it. A patch protocol would need its own vocabulary for "added" and
 * "removed" and would let two clients disagree about the order — and the order
 * is the member's, because `chooseSports` keeps their capitalisation and their
 * sequence.
 *
 * ## The profile may not exist yet, and that is not an error
 *
 * `bootstrap-athlete-profile` writes it from `identity.UserRegistered` and the
 * relay is eventual, so a member who reaches this screen inside that window has
 * no row. Creating the empty profile here and applying the change to it is the
 * whole of the handling: the bootstrap's own `find` then sees a profile and
 * takes its `already-there` exit, so the two orders converge on one document.
 * The alternative — a 404 on a screen the member is entitled to use — would be
 * a race the member has to lose.
 *
 * ## Why the save is inside `uow.run`
 *
 * `SportsChanged` goes to the outbox in the same transaction as the row.
 * Publishing after the save loses the event on a crash, and the materialiser is
 * a subscriber: a lost event means a member whose week is not re-checked until
 * the nightly pass.
 */
@Injectable()
export class ChooseSportsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: AthleteProfileRepository,
  ) {}

  async handle(
    userId: string,
    sports: string[],
    at: Date = new Date(),
  ): Promise<{ changed: boolean }> {
    return this.uow.run(async () => {
      const existing = await this.profiles.find(userId);
      const profile = existing ?? AthleteProfile.empty(userId, at);
      const changed = profile.chooseSports(sports, at);

      // Saved when something moved, and also when the profile is new even if
      // nothing did: a member whose first save is an empty list still needs the
      // document to exist, and `chooseSports([])` on an empty profile is
      // correctly a no-op.
      if (changed || !existing) await this.profiles.save(profile);
      return { changed };
    });
  }
}
