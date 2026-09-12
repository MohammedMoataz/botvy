import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
  WorkoutRepository,
} from '../../domain/training.repositories.js';

/**
 * Removes everything a deleted member's athletic life consisted of.
 *
 * Reacts to `identity.UserDeleted`, which crosses two stores — Identity is on
 * PostgreSQL and this context is on MongoDB, so no transaction can span them
 * and the event is the only way across. The shape is Meetings'
 * `purge-on-deleted` handler, deliberately: this is the fourth context to need
 * it and the fourth to do it identically, and a member asking to be erased
 * should not be erased differently depending on which collection they are in.
 *
 * **Hard deletes, not tombstones.** Everywhere else in this context a delete is
 * a tombstone, because a tombstone is how a deletion reaches the member's other
 * devices and because the Deleted view exists to show them what they removed —
 * and a skipped session stays in the week precisely so the record is honest.
 * None of those reasons survives the account going away: there is no device
 * left to tell, no week left to be honest about, and no member left to show.
 *
 * **All four collections, including the profile.** `athlete_profiles` is the
 * one row in this context with no tombstone and no client-minted id, and its
 * own comment says the member themselves is the only thing that deletes it —
 * this is that. Leaving it behind would keep the sports and the weekly
 * timetable of somebody who has gone, which is the part of this context that
 * reads most like personal data.
 *
 * Idempotent, because the relay delivers at least once: two deliveries collapse
 * to one purge and the second reports nothing rather than failing.
 */
@Injectable()
export class TrainingPurgeOnDeletedHandler {
  private readonly logger = new Logger(TrainingPurgeOnDeletedHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: AthleteProfileRepository,
    private readonly sessions: SessionRepository,
    private readonly programs: ProgramRepository,
    private readonly workouts: WorkoutRepository,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to purge`,
      );
      return 'nothing-to-do';
    }

    /*
     * One unit of work over four removals, in a fixed order, and sequential
     * rather than `Promise.all`.
     *
     * The order is the profile last on purpose: the sessions, programs and
     * workouts are what the profile's slots produced, so a pass that failed
     * half way through leaves the profile as the record of what still needs
     * clearing, and the next delivery finishes the job. A `Promise.all` inside
     * one unit of work would also interleave four writes on a single session,
     * which is not what either adapter is built for.
     */
    const counts = await this.uow.run(async () => {
      const sessions = await this.sessions.removeAllFor(userId);
      const programs = await this.programs.removeAllFor(userId);
      const workouts = await this.workouts.removeAllFor(userId);
      const profiles = await this.profiles.removeAllFor(userId);
      return { sessions, programs, workouts, profiles };
    });

    const total =
      counts.sessions + counts.programs + counts.workouts + counts.profiles;
    if (total === 0) return 'nothing-to-do';

    // The counts are logged individually rather than summed, because "0
    // sessions and 1 profile" and "40 sessions and 0 profiles" are different
    // stories about the same member and the log is the only record of either.
    this.logger.log(
      `purged ${counts.sessions} session(s), ${counts.programs} program(s), ` +
        `${counts.workouts} workout(s) and ${counts.profiles} athlete ` +
        `profile(s) for ${userId}`,
    );
    return 'purged';
  }
}
