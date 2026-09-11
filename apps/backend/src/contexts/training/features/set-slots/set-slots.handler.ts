import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  AthleteProfile,
  type TrainingSlot,
} from '../../domain/athlete-profile.aggregate.js';
import { AthleteProfileRepository } from '../../domain/training.repositories.js';

/**
 * The weekly timetable (FR-002).
 *
 * ## Wholesale, and `setSlots`'s comment is the reason
 *
 * A slot's *identity* is what future sessions are keyed to, so "this one,
 * changed" and "this one, gone" would need two verbs and a client that could
 * send them in the wrong order. The editor arranges the week and saves it; a
 * slot that keeps its id keeps its sessions, and one whose id disappears loses
 * its future sessions to the materialiser's reconcile.
 *
 * ## What this handler deliberately does not do
 *
 * It does not touch a single session. `SlotsChanged` goes to the outbox and the
 * materialiser reacts — which is what keeps "changing slots affects future
 * sessions only" in one place instead of two, and what makes the same rule
 * apply to the nightly pass and to a redelivered event. A handler that wrote
 * the sessions itself would be the second implementation of a reconcile whose
 * first implementation already has to exist.
 */
@Injectable()
export class SetSlotsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: AthleteProfileRepository,
  ) {}

  async handle(
    userId: string,
    slots: TrainingSlot[],
    at: Date = new Date(),
  ): Promise<{ changed: boolean }> {
    return this.uow.run(async () => {
      const existing = await this.profiles.find(userId);
      const profile = existing ?? AthleteProfile.empty(userId, at);
      const changed = profile.setSlots(slots, at);

      // See `choose-sports`: a new profile is written even when the timetable
      // it was given is empty, because the read side promises a document.
      if (changed || !existing) await this.profiles.save(profile);
      return { changed };
    });
  }
}
