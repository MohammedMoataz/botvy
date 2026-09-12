import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { TasksDueQueryHandler } from '../../planning/features/tasks-due-query/tasks-due.query.js';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import { SessionsInRangeQueryHandler } from '../../training/features/sessions/sessions-in-range.query.js';
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
 * Training's sessions on the agenda — **bound as of P6 (T641)**.
 *
 * This class was `NoTrainingSessions`, an empty-list stub from P5 to P6, and its
 * comment promised that closing it would be "one line in `meetings.module.ts`,
 * and every call site here is already correct". Both halves held: the agenda's
 * assembly, the day view and the month grid are all unchanged, and the `session`
 * item kind they already handle now has rows in it. It is renamed rather than
 * kept, because a class called `NoTrainingSessions` that returns sessions is a
 * comment a reader stops trusting.
 *
 * ## `between`, and the shape that made this a one-liner
 *
 * `SessionsInRangeQueryHandler.between` answers `{ id, title, sport, startAt,
 * durationMin }` — `AgendaSession`'s fields, named on purpose in the phase that
 * declared the query, because the two contexts may not import each other's
 * interface in either direction (constitution IX) and an adapter that had to
 * translate would be the place a field went missing. So the mapping is the
 * identity, and it is written out rather than passed through: this file is the
 * only thing that would fail to compile if either side dropped a field, which is
 * the whole reason two structurally identical shapes are acceptable.
 *
 * A window rather than a day at a time, which is why `between` exists at all: an
 * agenda spans a month, and asking day by day would be thirty round trips
 * against a collection that answers once.
 *
 * ## Every status, deliberately
 *
 * `between` does not filter to `planned`, and the agenda should not want it to.
 * A skipped or cancelled session stays on the calendar for the same reason a
 * cancelled meeting stays in the diary and the week view keeps a skipped
 * session: it is a fact about a day the member may well be looking for, and a
 * calendar that dropped it would make a skipped week and a quiet week look
 * identical. Tombstoned rows are excluded by Training's repository, because
 * those the member did ask to stop seeing. The rhythm's *proposal* is the caller
 * that needs `planned` only, and it asks a different method.
 */
@Injectable()
export class TrainingSessions extends TrainingSessionsPort {
  constructor(private readonly sessions: SessionsInRangeQueryHandler) {
    super();
  }

  async between(userId: string, from: Date, to: Date): Promise<AgendaSession[]> {
    const rows = await this.sessions.between(userId, from, to);
    return rows.map((session) => ({
      id: session.id,
      title: session.title,
      sport: session.sport,
      startAt: session.startAt,
      durationMin: session.durationMin,
    }));
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
