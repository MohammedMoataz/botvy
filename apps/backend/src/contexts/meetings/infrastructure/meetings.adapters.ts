import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { TasksDueQueryHandler } from '../../planning/features/tasks-due-query/tasks-due.query.js';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import {
  MeetingDefaultsPort,
  TimedTasksPort,
  TrainingSessionsPort,
  type AgendaSession,
  type AgendaTask,
} from '../domain/meetings.ports.js';

/**
 * Where this context is allowed to know the others exist.
 *
 * `infrastructure/` is the one layer constitution IX exempts, because binding a
 * local port to somebody else's published surface is exactly its job — the
 * pattern `admin-device.lookup.ts` established in P0 and Notifications'
 * `notification.adapters.ts` repeated in P2. Nothing in `domain/` or
 * `features/` imports any of this, and `no-restricted-imports` refuses it if
 * anyone tries; the agenda takes two abstract ports and never learns which
 * contexts answer them.
 *
 * That matters most on this screen. The agenda is the one read in the product
 * that is genuinely cross-context — a day holds meetings, tasks, training and
 * personal events — so it is also the one most likely to be built by reaching
 * into three collections. These two adapters are what it reaches through
 * instead, and the surface each binds to is a `*.query.ts` handler rather than
 * a feature service, because the query handler is the published half.
 */

/**
 * Planning's timed tasks, narrowed to what the agenda draws.
 *
 * A range query rather than a day at a time, because `timedBetween` was
 * declared in P2 for exactly this caller: an agenda spans a month and asking
 * day by day would be thirty round trips against a collection that can answer
 * once.
 */
@Injectable()
export class PlanningTimedTasks extends TimedTasksPort {
  constructor(private readonly tasks: TasksDueQueryHandler) {
    super();
  }

  async between(userId: string, from: Date, to: Date): Promise<AgendaTask[]> {
    const views = await this.tasks.timedBetween(userId, from, to);
    const rows: AgendaTask[] = [];
    for (const view of views) {
      /*
       * `dueAt` is non-null by construction — Planning's `timedBetween` filters
       * to `!allDay && dueAt !== null` — so this skips nothing in practice. It
       * is a skip rather than a non-null assertion because the two failure
       * modes are not equal: an assertion that turns out wrong puts an
       * `Invalid Date` on the member's calendar, and a later widening of
       * Planning's query would do that silently. Dropping the row is the
       * honest answer to "a task with no time, on an hour grid", and it is the
       * same answer Planning already gives an all-day task.
       */
      if (view.dueAt === null) continue;
      rows.push({
        id: view.id,
        title: view.title,
        dueAt: view.dueAt,
        priority: view.priority,
        // The label snapshot Planning already denormalises onto the task, so
        // the agenda tints the row exactly as the task list does, without a
        // second read for the label.
        color: view.label?.color ?? null,
      });
    }
    return rows;
  }
}

/**
 * Training sessions on the agenda — **stubbed until P6 (Training)**.
 *
 * P6 owns sessions, and it replaces this binding with an adapter over its own
 * session query: one line in `meetings.module.ts`, and every call site here is
 * already correct. Nothing else in the calendar changes, which is the entire
 * reason this file has a class in it that returns a constant.
 *
 * ## Why an empty-list stub beats a branch in the agenda
 *
 * The alternative is an optional dependency and a question inside the agenda's
 * assembly: "has Training been built yet?" That question has three costs and no
 * benefit.
 *
 * It would still be there in P9. Nobody deletes a defensive branch once it is
 * written, because deleting it requires being sure it can no longer be false,
 * and the way to be sure is to trace every module — so it stays, and by P9 the
 * agenda carries a question about a context that has existed for three phases.
 *
 * It moves a wiring decision into a per-request path. Whether Training exists
 * is a fact about the module graph, settled once at boot; asking it on every
 * calendar read is asking a constant, and the answer cannot differ between two
 * members or two days.
 *
 * And it would be the second place that knows the day renders without a
 * training row. The day view already does: the spec builds it from what is
 * present rather than from a template with a hole in it, so an empty list is an
 * ordinary state the assembly handles rather than an absence the caller has to
 * work around. A stub returning that same value asks nothing new of anybody.
 *
 * The port is bound rather than left unbound because Nest would refuse to boot
 * without it (`UnknownDependenciesException`), and rightly: an unsatisfied
 * dependency is not the same statement as "the answer is nothing yet". Same
 * reasoning, same shape, as P3's `rhythm-next-session.stub.ts`.
 */
@Injectable()
export class NoTrainingSessions extends TrainingSessionsPort {
  async between(
    _userId: string,
    _from: Date,
    _to: Date,
  ): Promise<AgendaSession[]> {
    return [];
  }
}

/**
 * The member's own default meeting length, from Profile's published read.
 *
 * `preferencesFor` rather than the preferences collection, and the difference
 * is the whole of constitution IX: a `*.query.ts` handler is Profile's
 * published surface, and a Mongo context reaching for another context's
 * collection — or for its *feature service* — is the violation even in the
 * permitted direction.
 *
 * The fallback is the installation default, for a member whose preferences row
 * the registration bootstrap has not written yet. That window is real: the
 * relay is at-least-once and eventual, so a member can create a meeting in the
 * seconds between registering and their preferences existing. Answering `null`
 * would push a "what now" branch into the create handler for a value the
 * bootstrap is about to write with exactly this number in it.
 */
@Injectable()
export class ProfileMeetingDefaults extends MeetingDefaultsPort {
  constructor(
    private readonly profiles: ProfileQueryHandler,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async durationMinFor(userId: string): Promise<number> {
    const preferences = await this.profiles.preferencesFor(userId);
    return (
      preferences?.meetingDurationMin ??
      (await this.settings.get('defaults.meetingDurationMin'))
    );
  }
}
