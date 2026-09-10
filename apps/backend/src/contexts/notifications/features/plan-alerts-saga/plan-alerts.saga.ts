import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { desiredFor, type DesiredAlert } from '../../domain/alert-plan.js';
import {
  Alert,
  type AlertSource,
  type AlertSourceKind,
} from '../../domain/alert.aggregate.js';
import { AlertRepository } from '../../domain/alert.repository.js';
import { ReconcileMeetingAlertsHandler } from '../reconcile-meeting-alerts/reconcile-meeting-alerts.handler.js';

/** Mints an alert id. A token, because the two adapters mint differently. */
export const ALERT_ID = Symbol('ALERT_ID');
export type AlertIdFactory = () => string;

/**
 * A source's current facts, as the saga needs them. Assembled from the event
 * payload rather than read back from the owning context: the event is the
 * published surface, and calling into Planning to re-read a task the event
 * already described would be this context reaching where it may not.
 */
interface SourceFacts {
  kind: AlertSourceKind;
  id: string;
  occurrenceAt: Date | null;
  moment: Date;
  title: string;
  /** False for an all-day thing, which gets one alert and no warnings. */
  timed: boolean;
  deepLink: string;
}

/**
 * Turns everything that has a moment into a set of alerts, and keeps that set
 * correct as the moment moves.
 *
 * ## It reconciles rather than appends
 *
 * Every source event recomputes the *whole* desired set for that source and
 * makes the store match: create what is missing, re-plan what moved, delete
 * what is no longer wanted. That is not tidiness — it is what makes the saga
 * idempotent, and it has to be, because the relay delivers at least once. A
 * saga that appended would give a member two notifications for one reminder
 * every time a redelivery happened, which is exactly when they would least be
 * able to explain it.
 *
 * ## It listens outside Planning and Reminders, and that is the interesting half
 *
 * An alert's correct *instant* depends on facts those contexts do not own. The
 * member's time zone lives in Profile; whether they are banned lives in
 * Identity; whether they have a phone that can receive a push lives in Identity
 * too. So this saga subscribes to those contexts' events as well, and the
 * time-zone branch is the one that matters most:
 *
 * **A member who changes time zone has every future alert recomputed.** Not
 * shifted by the offset difference — recomputed from each source's own local
 * time, because "warn me an hour before my 18:00 meeting" means 17:00 wherever
 * they are, and a stored instant computed in Cairo is the wrong instant in New
 * York. Resolving a user-facing time against the wrong zone once shifted every
 * extracted reminder in this product by three hours; a member who flies
 * somewhere reproduces that bug exactly unless this branch exists.
 */
@Injectable()
export class PlanAlertsSaga {
  private readonly logger = new Logger(PlanAlertsSaga.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly alerts: AlertRepository,
    private readonly member: MemberContextPort,
    private readonly nextId: AlertIdFactory,
    /**
     * The meetings branch, which owns its own reconcile.
     *
     * A separate collaborator rather than five more constructor arguments,
     * because the meetings window needs an occurrences port, a members port and
     * a settings key that nothing else in this saga reads — and the nightly
     * endpoint needs exactly the same reconciliation, so it would have had to
     * live somewhere both could reach it either way.
     *
     * Optional so that a spec exercising the task, reminder and rhythm paths
     * can bind four dependencies and no more. A meetings event arriving with
     * nothing bound is a wiring fault rather than a quiet no-op, so it is
     * logged as an error: a handler that silently never runs is the failure
     * mode this codebase has paid for twice.
     */
    private readonly meetings?: ReconcileMeetingAlertsHandler,
  ) {}

  // ------------------------------------------------------------------ Planning

  /**
   * `planning.TaskScheduled` and `TaskRescheduled`.
   *
   * Both are handled the same way because reconciling makes them the same
   * operation: "here is what this task's alerts should be now". The distinction
   * matters to the *catalogue* — one means the task acquired a moment, the
   * other that it moved — but not to the work.
   */
  async onTaskScheduled(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      taskId?: string;
      dueAt?: Date | string | null;
      allDay?: boolean;
      title?: string;
    };
    const userId = event.userId;
    if (!userId || !payload.taskId) return;

    const dueAt = asDate(payload.dueAt);
    if (!dueAt) {
      // A task with no due moment has nothing to warn about. Reconciling to an
      // empty set is what removes the alerts of a task whose date was cleared.
      await this.reconcile(userId, { kind: 'task', id: payload.taskId }, []);
      return;
    }

    await this.plan(userId, {
      kind: 'task',
      id: payload.taskId,
      occurrenceAt: dueAt,
      moment: dueAt,
      title: payload.title ?? 'Task due',
      // An all-day task gets one alert at the moment it carries and no lead
      // times. Warning somebody an hour before a midnight they never chose is
      // a notification at 23:00 about a task with no time.
      timed: payload.allDay === false,
      deepLink: `botvy://tasks/${payload.taskId}`,
    });
  }

  /** Completed, cancelled or deleted: the pending alerts go. */
  async onTaskClosed(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      taskId?: string;
      recurrenceAdvancedTo?: Date | string;
    };
    const userId = event.userId;
    if (!userId || !payload.taskId) return;

    // A repeating task that advanced is *not* closed — `TaskScheduled` follows
    // for the new moment, and dropping the alerts here would be undone a
    // moment later. Doing nothing is right: the reconcile that follows plans
    // the new set and removes the old one in the same pass.
    if (payload.recurrenceAdvancedTo) return;

    await this.uow.run(() =>
      this.alerts.deletePendingForSource(userId, {
        kind: 'task',
        id: payload.taskId!,
      }),
    );
  }

  // ----------------------------------------------------------------- Reminders

  /** `ReminderScheduled`, `ReminderRescheduled` and `ReminderSnoozed`. */
  async onReminderScheduled(event: DomainEvent): Promise<void> {
    const payload = event.payload as {
      reminderId?: string;
      remindAt?: Date | string;
      leadTimes?: string[];
      title?: string;
    };
    const userId = event.userId;
    if (!userId || !payload.reminderId) return;

    const remindAt = asDate(payload.remindAt);
    if (!remindAt) return;

    await this.plan(
      userId,
      {
        kind: 'reminder',
        id: payload.reminderId,
        occurrenceAt: remindAt,
        moment: remindAt,
        title: payload.title ?? 'Reminder',
        // A reminder is always a moment the member picked to the minute, so it
        // always gets its lead times.
        timed: true,
        deepLink: `botvy://reminders/${payload.reminderId}`,
      },
      // The reminder's *own* lead times, which override the member's defaults:
      // they chose them for this reminder.
      payload.leadTimes,
    );
  }

  /** Completed, cancelled, deleted or purged. */
  async onReminderClosed(event: DomainEvent): Promise<void> {
    const payload = event.payload as { reminderId?: string };
    const userId = event.userId;
    if (!userId || !payload.reminderId) return;

    await this.uow.run(() =>
      this.alerts.deletePendingForSource(userId, {
        kind: 'reminder',
        id: payload.reminderId!,
      }),
    );
  }

  // ------------------------------------------------------------------ Meetings

  /**
   * `meetings.MeetingScheduled`, `MeetingChanged`, `OccurrenceSkipped` and
   * `OccurrenceMoved`.
   *
   * All four are handled the same way, because reconciling makes them the same
   * operation: "here is what this meeting's warnings should be now". The
   * distinction matters to the *catalogue* — one means the meeting appeared,
   * one that its rule or its offsets changed, one that a date was dropped, one
   * that a date moved — but not to the work, and the alternative is four
   * branches that must agree about a window and a quiet-hours rule.
   *
   * The desired set is *not* built from this payload, and that is the one thing
   * about this branch worth reading twice. The payload carries the rule, and
   * occurrences are not in a rule until something expands it against the
   * member's zone — so the moments come from Meetings' own query, which runs the
   * same expander every calendar screen does. Expanding here would be a second
   * copy of the hardest logic in the platform, and its first divergence would
   * be an alarm at one hour and a calendar insisting the meeting is at another.
   */
  async onMeetingChanged(event: DomainEvent): Promise<void> {
    const payload = event.payload as { meetingId?: string };
    const userId = event.userId;
    if (!userId || !payload.meetingId) return;

    if (!this.meetings) {
      this.logger.error(
        `${event.name} for ${userId}: no meeting reconciler is bound, so no ` +
          'meeting alert was planned. Register ReconcileMeetingAlertsHandler ' +
          'in notifications.module.ts.',
      );
      return;
    }

    await this.meetings.forMeeting(userId, payload.meetingId);
  }

  /**
   * `meetings.MeetingCompleted`, `MeetingCancelled` and `MeetingDeleted`: the
   * pending alerts go.
   *
   * A completed meeting drops its warnings exactly as a cancelled one does, and
   * that is not laziness about the difference between them. The status is the
   * record of which it was and the Deleted view exists to show it; a *warning*
   * about a meeting that has already run is noise either way, and it would be
   * noise arriving after the fact, which is the kind a member acts on.
   *
   * Straight to `deletePendingForSource` rather than through the reconciler:
   * these three payloads carry `{ meetingId, at }` and nothing else, there is
   * no window to expand, and an empty desired set is one delete either way.
   * Note it never touches a *sent* alert — an alert already delivered is a
   * thing that happened, and deleting the record of it would lose the only
   * evidence the member was told.
   */
  async onMeetingClosed(event: DomainEvent): Promise<void> {
    const payload = event.payload as { meetingId?: string };
    const userId = event.userId;
    if (!userId || !payload.meetingId) return;

    await this.uow.run(() =>
      this.alerts.deletePendingForSource(userId, {
        kind: 'meeting',
        id: payload.meetingId!,
      }),
    );
  }

  // -------------------------------------------------------------- Daily Rhythm

  /**
   * The three rhythm touches: `PlanTomorrowPrompted`, `EndOfDaySummarySent`
   * and `MorningBriefingSent`.
   *
   * One alert each, at the moment the touch happened, and **no lead times** —
   * which `timed: false` gives exactly. Warning somebody an hour before their
   * own 22:00 summary is warning them about a thing that has already been
   * written into their chat.
   *
   * ## Why these are member-chosen and not system-generated
   *
   * `desiredFor` labels the source's own moment `0m` — `MEMBER_CHOSEN_LABEL` —
   * and `sendAt` returns that one unshifted, where a derived warning inside
   * quiet hours is held until the window ends. That is the whole reason these
   * three come through this path rather than getting a bespoke one: **a member
   * whose quiet hours cover their own 08:00 briefing asked for that briefing at
   * 08:00.** Holding it back would be Botvy overruling them about their own
   * morning, and it is spec FR-013. Falling out of an existing rule is better
   * than a `if (kind === 'rhythm') skipQuietHours` branch somebody would later
   * "tidy up".
   *
   * ## The wording lives here, and the payload is untouched
   *
   * `contracts/events.md` fixes these payloads at `{ date, taskIds, … }` with
   * no title in them, and adding one would put notification copy in the
   * rhythm's domain events. The event *name* already says which touch it is, so
   * this context composes its own banner from the name and the date — which is
   * where notification wording belongs, and it keeps the contract exact.
   *
   * ## Idempotent through the source id, like everything else here
   *
   * The source id is `"<touch>:<date>"`, so a redelivered event reconciles to
   * the same single row instead of planning a second. The relay is
   * at-least-once and this is the only thing standing between that and a member
   * being notified twice about one evening.
   */
  async onRhythmTouch(event: DomainEvent): Promise<void> {
    const userId = event.userId;
    const payload = event.payload as { date?: string };
    if (!userId || !payload.date) return;

    const touch = RHYTHM_TOUCHES[event.name];
    if (!touch) return;

    await this.plan(userId, {
      kind: 'rhythm',
      id: `${touch.slug}:${payload.date}`,
      // No occurrence: a rhythm touch's instant belongs to the rhythm, not to a
      // recurring source the member picked. `replanFuture` reads this field to
      // decide what it may rebuild, and leaving it null is what stops a
      // time-zone change from recomputing a notification about an evening that
      // has already happened.
      occurrenceAt: null,
      moment: event.occurredAt,
      title: touch.title,
      timed: false,
      deepLink: touch.deepLink(payload.date),
    });
  }

  // ------------------------------------------------------- Profile and Identity

  /**
   * `profile.ProfileUpdated`.
   *
   * Only two of the fields it can name matter here, and they matter completely.
   *
   * **`timezone`** — every future alert is recomputed. The stored `notifyAt` was
   * resolved against the old zone, so it is now the wrong instant: an alert
   * planned for 17:00 in Cairo is 17:00 Cairo for ever unless somebody
   * recomputes it, and the member is in New York. Both the quiet-hours shift and
   * the lead-time arithmetic have to be redone, which is why this re-plans from
   * each source's own local moment rather than adding an offset.
   *
   * **A changed display name or allergy list** reaches here too, because the
   * event carries one `changed` list for the whole patch. Ignoring those is the
   * point of reading the list: a member editing their food dislikes must not
   * cost a full re-plan of their week.
   *
   * ## Meetings are re-planned, not re-computed (FR-014)
   *
   * `replanFuture` rebuilds each alert from `source.occurrenceAt`, which for a
   * task or a reminder is the moment the member chose and is still that moment
   * in the new zone. For a meeting it is now **the wrong instant**: an
   * occurrence is a wall time, so an unpinned series' occurrences all moved
   * when the member did — their 18:00 routine is at 18:00 wherever they are,
   * which is a different instant. Rebuilding from the stored one would keep
   * every warning on the old city's clock, and it would also read the member's
   * default lead times instead of the meeting's own stored offsets.
   *
   * So the meeting half goes back to the port and re-expands the rule. A series
   * marked `lockTimezone` expands in its own zone and comes back at the same
   * instants, which is the entire point of the flag — it costs a reconcile that
   * finds nothing to change, and a reconcile that finds nothing to change
   * writes nothing.
   *
   * Without this branch a member who flies is wrong until the nightly pass:
   * v1's three-hour bug again, a day long instead of permanent.
   */
  async onProfileUpdated(event: DomainEvent): Promise<void> {
    const changed = (event.payload as { changed?: string[] })?.changed ?? [];
    if (!event.userId || !changed.includes('timezone')) return;

    const count = await this.replanFuture(event.userId, event.occurredAt);
    const meetings = await this.replanMeetings(event.userId);
    this.logger.log(
      `time zone changed for ${event.userId}: re-planned ${count} alert(s) ` +
        `and ${meetings} meeting(s)`,
    );
  }

  /**
   * `profile.PreferencesChanged`.
   *
   * The default lead times and the quiet window both change what a *derived*
   * warning's instant should be, so the same re-plan applies. A member-chosen
   * moment is untouched by either, which falls out of the rule rather than
   * needing a branch: `sendAt` never moves the `0m` label.
   */
  async onPreferencesChanged(event: DomainEvent): Promise<void> {
    const changed = (event.payload as { changed?: string[] })?.changed ?? [];
    if (!event.userId) return;
    if (
      !changed.some((field) => field === 'leadTimes' || field === 'quietHours')
    )
      return;

    const count = await this.replanFuture(event.userId, event.occurredAt);
    // The quiet window moves a meeting's *derived* warnings too, and the
    // meeting half of the re-plan is the port's, not `replanFuture`'s — the
    // same reason as the time-zone branch, minus the moved instants. A changed
    // `leadTimes` reaches here as well and correctly changes nothing about a
    // meeting: its offsets were stored on it at creation.
    const meetings = await this.replanMeetings(event.userId);
    this.logger.log(
      `alert preferences changed for ${event.userId}: re-planned ${count} ` +
        `alert(s) and ${meetings} meeting(s)`,
    );
  }

  /**
   * `identity.UserBanned` — nothing reaches a banned member.
   *
   * Their unsent alerts are deleted rather than suppressed at send time,
   * because a suppression check is a thing the sweep has to remember to do and
   * this is a thing that cannot be forgotten.
   */
  async onUserBanned(event: DomainEvent): Promise<void> {
    if (!event.userId) return;
    const pending = await this.alerts.pendingForMember(
      event.userId,
      new Date(0),
    );
    await this.uow.run(async () => {
      for (const alert of pending) await this.alerts.remove(alert);
    });
    this.logger.log(
      `${event.userId} banned: dropped ${pending.length} pending alert(s)`,
    );
  }

  /**
   * `identity.UserUnbanned` — nothing to restore, and that is deliberate.
   *
   * The deleted rows are not resurrected. The alert set is *derived* state and
   * the sources are the record, so an unban re-plans from the tasks and
   * reminders that are still live — which is also the only correct answer,
   * since a source that was completed during the ban should not produce an
   * alert now. This is recorded as a decision in `plan.md` rather than left to
   * be rediscovered.
   *
   * It needs the sources, which this context may not read. So it does nothing
   * here, and the re-plan happens the next time each source is touched — plus a
   * one-shot rebuild is available through the internal replan endpoint for an
   * operator who wants it immediately.
   */
  async onUserUnbanned(event: DomainEvent): Promise<void> {
    this.logger.log(
      `${event.userId} unbanned: alerts will be re-planned from live sources; ` +
        'the pending set is derived state and is not resurrected',
    );
  }

  /**
   * `identity.DeviceRegistered` and `DeviceRemoved`.
   *
   * The alerts themselves do not change — only who can receive them — but
   * `plannedAt` moving is what makes a newly registered phone a candidate for
   * the sweep. Without it, a phone registered a minute ago has a `lastSeenAt`
   * *after* every existing `plannedAt`, so the sweep would consider it already
   * up to date about alerts it has never heard of and send it nothing.
   */
  async onDevicesChanged(event: DomainEvent): Promise<void> {
    if (!event.userId) return;
    const count = await this.replanFuture(event.userId, event.occurredAt);
    this.logger.log(
      `devices changed for ${event.userId}: re-planned ${count} alert(s)`,
    );
  }

  // ----------------------------------------------------------------- internals

  /**
   * Plan one source's alerts: work out what is wanted, then reconcile.
   *
   * `leadTimes` overrides the member's defaults when the source carries its own
   * — a reminder does, a task does not.
   */
  private async plan(
    userId: string,
    facts: SourceFacts,
    leadTimes?: string[],
  ): Promise<void> {
    const [{ timezone }, preferences] = await Promise.all([
      this.member.clock(userId),
      this.member.alertPreferences(userId),
    ]);

    const desired = desiredFor(
      facts.moment,
      leadTimes ?? preferences.leadTimes,
      preferences.quietHours,
      timezone,
      facts.timed,
    );

    await this.reconcile(userId, facts, desired, facts);
  }

  /**
   * Make the store's pending set for this source equal `desired`.
   *
   * Three passes over one read, and the deletion pass is the one that is easy
   * to leave out: a member who removes a lead time, or moves a task from a
   * timed moment to all-day, has alerts that should no longer exist. Only
   * planning what is missing would leave them to fire.
   */
  private async reconcile(
    userId: string,
    source: Pick<AlertSource, 'kind' | 'id'>,
    desired: DesiredAlert[],
    facts?: SourceFacts,
  ): Promise<void> {
    const existing = await this.alerts.pendingForSource(userId, source);
    const byLabel = new Map(existing.map((alert) => [alert.label, alert]));
    const wanted = new Set(desired.map((entry) => entry.label));
    const at = new Date();

    await this.uow.run(async () => {
      for (const entry of desired) {
        const current = byLabel.get(entry.label);

        if (!current) {
          if (!facts) continue;
          const alert = Alert.plan({
            id: this.nextId(),
            userId,
            source: {
              kind: facts.kind,
              id: facts.id,
              occurrenceAt: facts.occurrenceAt,
            },
            label: entry.label,
            notifyAt: entry.notifyAt,
            title: facts.title,
            body: '',
            deepLink: facts.deepLink,
            plannedAt: at,
          });
          await this.alerts.save(alert);
          continue;
        }

        // Already there: move it if the moment or the wording changed, and
        // leave it entirely alone if not, so a redelivered event writes
        // nothing at all.
        if (current.replan(entry.notifyAt, facts?.title ?? current.title, at)) {
          await this.alerts.save(current);
        }
      }

      for (const alert of existing) {
        if (!wanted.has(alert.label)) await this.alerts.remove(alert);
      }
    });
  }

  /**
   * Recompute every future alert for a member against their current zone and
   * preferences.
   *
   * The re-plan is per *source moment*, not per alert: the stored `notifyAt` of
   * a `1h` warning is already an hour before the source, so recomputing from it
   * would subtract another hour. `source.occurrenceAt` is the moment the member
   * actually chose, which is why the aggregate carries it even for a one-off,
   * and it is what every derived instant is rebuilt from.
   */
  private async replanFuture(userId: string, from: Date): Promise<number> {
    const [{ timezone }, preferences] = await Promise.all([
      this.member.clock(userId),
      this.member.alertPreferences(userId),
    ]);

    const pending = await this.alerts.pendingForMember(userId, from);
    let moved = 0;

    await this.uow.run(async () => {
      for (const alert of pending) {
        /*
         * A meeting's warnings are not rebuilt from here, and the reason is
         * exactly why this method cannot be the whole of FR-014.
         *
         * Two things it would get wrong. The lead times it reads are the
         * member's *defaults*, and a meeting carries its own offsets stored at
         * creation — so a `30m` warning would find no matching entry and be
         * left behind, and a `prep` warning has no lead time at all. And
         * `occurrenceAt` is the *rule's* moment, which is the right key but the
         * wrong instant to count back from once an override has moved the
         * occurrence, or once the member has changed zone and every wall time
         * has landed somewhere new.
         *
         * `replanMeetings` re-expands the rule through the port instead. The
         * sweep's device filter is untroubled by the omission: a meeting
         * warning is always future-dated, so the phone pulls it and schedules
         * its own alarm — unlike a rhythm touch, whose alert is planned for
         * *now* and therefore depends on the server sweep.
         */
        if (alert.source.kind === 'meeting') continue;

        const moment = alert.source.occurrenceAt;
        // Without an occurrence there is no member-chosen moment to rebuild
        // from — a rhythm touch, say, whose instant the rhythm owns. Left
        // alone rather than guessed at.
        if (!moment) continue;

        const desired = desiredFor(
          moment,
          preferences.leadTimes,
          preferences.quietHours,
          timezone,
          true,
        ).find((entry) => entry.label === alert.label);
        if (!desired) continue;

        if (alert.replan(desired.notifyAt, alert.title, from)) {
          await this.alerts.save(alert);
          moved += 1;
        }
      }
    });

    return moved;
  }

  /**
   * Re-expand every meeting this member has in the alert window and reconcile.
   *
   * Returns the number of meetings looked at rather than the number of alerts
   * moved, because "nothing moved" is the correct and common answer — a member
   * whose meetings are all pinned to a zone, or whose zone change was to one
   * with the same offset, has a full window of warnings that are already right.
   * Counting writes would report zero and read as a failure.
   *
   * A no-op with nothing bound, and quietly so: the profile and preference
   * branches predate meetings by three phases, and a spec exercising them must
   * not have to know this context now has a diary in it.
   */
  private async replanMeetings(userId: string): Promise<number> {
    if (!this.meetings) return 0;
    const result = await this.meetings.forMember(userId);
    return result.meetings;
  }
}

/**
 * The three rhythm touches, keyed by event name.
 *
 * A table rather than a switch so that adding a fourth touch is a row, and so
 * that the banner text for all three is readable in one place — the member sees
 * these three strings more often than any others in the product.
 *
 * The deep links match the routes the phone registers. A link the app cannot
 * resolve is a notification that opens the home screen and loses the thing it
 * was about, which is worse than no link at all because it looks like it worked.
 */
const RHYTHM_TOUCHES: Record<
  string,
  { slug: string; title: string; deepLink: (date: string) => string }
> = {
  'rhythm.PlanTomorrowPrompted': {
    slug: 'plan',
    title: 'Plan tomorrow',
    deepLink: (date) => `botvy://rhythm/plan/${date}`,
  },
  'rhythm.EndOfDaySummarySent': {
    slug: 'end_of_day',
    // The check-in is the actionable half, so the banner names it: tapping this
    // is how most check-ins will be answered, and "Tomorrow's plan is set" on
    // its own gives the member nothing to do.
    title: "Tomorrow's plan is set — how did today go?",
    deepLink: () => 'botvy://rhythm/checkin',
  },
  'rhythm.MorningBriefingSent': {
    slug: 'morning',
    title: 'Your day',
    deepLink: () => 'botvy://home',
  },
};

/** Mongo hands back Dates; a webhook or a replayed row may hand back strings. */
function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
