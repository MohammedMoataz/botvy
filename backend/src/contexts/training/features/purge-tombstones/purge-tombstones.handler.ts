import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import {
  ProgramRepository,
  SessionRepository,
  WorkoutRepository,
} from '../../domain/training.repositories.js';

/**
 * Erasing Training's tombstones once they are past the horizon.
 *
 * ## Why this is its own slice
 *
 * It is not `purge-session`, which is the member's own "erase this for good"
 * from the Deleted view — one row, by id, refused unless it is already a
 * tombstone. And it is not `purge-on-deleted`, which is one *member's*
 * everything on `identity.UserDeleted`. This is the third thing: a sweep over
 * every member's rows by *age*, run on a timer, which is a different caller
 * (the nightly sweep), a different unit (a date), and a different failure mode
 * (too eager, rather than too narrow).
 *
 * Meetings put the same sweep on its `purge-meeting` handler, and that reads
 * worse: a slice named after the member's command carrying a method only a cron
 * calls. This one is named after what it does.
 *
 * ## Why the sweep asks rather than reaching
 *
 * These are Training's rows, so nothing outside Training deletes them
 * (principle I). The sweep runs on a timer in Notifications and knows only
 * `TombstonePurgePort` — it asks each owner to purge its own collections and
 * adds up what they report, which is why the number in the sweep's output is
 * honest: it is a count of rows the owning contexts deleted, reported by them.
 *
 * ## Three collections, one number
 *
 * `athlete_profiles` is not among them and has nothing to sweep: one document
 * per member, no tombstone, and its only deletion is the member's own, which
 * `purge-on-deleted` handles. The three syncable collections are swept in one
 * unit of work and report one total, because two ports reporting two numbers
 * would only be added together again by the caller.
 *
 * The horizon is `reminders.tombstoneDays`, read by the sweep and passed in as
 * a date. That the whole platform shares one key is deliberate and load-bearing
 * for the clients: `/sync`'s full-snapshot rule reads the same value, so a
 * phone offline longer than the horizon re-syncs from a snapshot rather than a
 * delta — and a per-context horizon would make "how long may a device be away"
 * a question with four answers.
 */
@Injectable()
export class PurgeTrainingTombstonesHandler {
  private readonly logger = new Logger(PurgeTrainingTombstonesHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly sessions: SessionRepository,
    private readonly programs: ProgramRepository,
    private readonly workouts: WorkoutRepository,
  ) {}

  /**
   * Erases tombstones deleted before `before`, across the three collections.
   *
   * Scoped to one member when the caller has one — which nothing does today,
   * and the parameter is here because `purgeTombstonesBefore` takes it and a
   * wrapper that dropped it would be a wrapper somebody has to widen later.
   */
  async purgeTombstones(before: Date, userId?: string): Promise<number> {
    return this.uow.run(async () => {
      const sessions = await this.sessions.purgeTombstonesBefore(before, userId);
      const programs = await this.programs.purgeTombstonesBefore(before, userId);
      const workouts = await this.workouts.purgeTombstonesBefore(before, userId);
      const total = sessions + programs + workouts;

      if (total > 0) {
        this.logger.log(
          `purged ${sessions} session(s), ${programs} program(s) and ` +
            `${workouts} workout(s) deleted before ${before.toISOString()}`,
        );
      }
      return total;
    });
  }
}
