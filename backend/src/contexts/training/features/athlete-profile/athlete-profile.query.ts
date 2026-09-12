import { Injectable } from '@nestjs/common';
import {
  AthleteProfile,
  type TrainingSlot,
} from '../../domain/athlete-profile.aggregate.js';
import { AthleteProfileRepository } from '../../domain/training.repositories.js';

/** The member's sports and weekly timetable, as the Athlete screen reads it. */
export interface AthleteProfileView {
  sports: string[];
  slots: TrainingSlot[];
}

/**
 * The member's own profile, and it **answers a document rather than null**.
 *
 * ## Why the read is non-null when the row can be missing
 *
 * `bootstrap-athlete-profile` writes an empty profile on
 * `identity.UserRegistered`, so it exists for every member who registered after
 * this phase landed — but the relay is at-least-once and *eventual*, so there is
 * a window after registration in which the row is not there, and a member who
 * registered before P6 may never have had one.
 *
 * The alternative is a nullable read, and `AthleteProfile.empty`'s comment gives
 * the argument against it: a null profile puts a "have they set this up yet"
 * branch into the Athlete screen, the coach prompt, the materialiser and every
 * query — four copies of one question, which is how they come to disagree. An
 * empty profile answers "no sports, no slots", which every one of those callers
 * can already render, and story 1 scenario 3 asks for exactly that: an
 * invitation to set them, not an empty grid.
 *
 * ## Why nothing is written here
 *
 * `AthleteProfile.empty` is built and discarded rather than saved. A read that
 * writes is a read that fails on a replica and a read that a rate-limited client
 * can turn into a write loop; the bootstrap and the two editor commands are the
 * three writers of this collection, and all three are commands.
 */
@Injectable()
export class AthleteProfileQueryHandler {
  constructor(private readonly profiles: AthleteProfileRepository) {}

  async handle(userId: string): Promise<AthleteProfileView> {
    const profile =
      (await this.profiles.find(userId)) ?? AthleteProfile.empty(userId);
    return { sports: profile.sports, slots: profile.slots };
  }
}
