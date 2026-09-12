import { Injectable, Logger } from '@nestjs/common';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';
import { MemberContextPort } from '../../../../shared/member/member-context.port.js';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { sendAt, type QuietHours } from '../../domain/alert-plan.js';
import {
  Alert,
  alertKey,
  MEMBER_CHOSEN_LABEL,
  type AlertLabel,
} from '../../domain/alert.aggregate.js';
import { AlertRepository } from '../../domain/alert.repository.js';
import {
  MeetingMembersPort,
  MeetingOccurrencesPort,
  type MeetingOccurrence,
} from '../../domain/notification.ports.js';

/** The heartbeat key `/health` and the admin overview report staleness on. */
export const MEETING_ALERTS_JOB = 'notifications.meeting-alerts';

/**
 * The label of the preparation warning.
 *
 * It cannot collide with a reminder offset's label, and that is a property
 * rather than a hope: `offsetLabel` always produces a leading digit
 * (`^\d+[mhd]$`, the same shape the settings registry validates), so a label
 * beginning with a letter is unreachable from any offset. The collision would
 * matter because the reconcile keys on `(occurrence, label)` — two warnings
 * sharing a label are one warning, and the member would silently lose the one
 * that lost the race.
 *
 * It is also not a lead time, and `leadMinutes('prep')` returns null rather
 * than a number, so if this label ever reached the lead-time arithmetic it
 * would be ignored instead of misread as a duration.
 */
export const PREP_LABEL = 'prep';

/** Exactly the shape `contracts/internal.md` names. n8n logs this response. */
export interface ReconcileMeetingAlertsResult {
  members: number;
  meetings: number;
  planned: number;
  removed: number;
  ms: number;
}

/** What one member's pass did. */
export interface MemberReconcileResult {
  meetings: number;
  planned: number;
  removed: number;
}

/**
 * Keeps a member's meeting reminders in step with a rule that is never
 * expanded into rows.
 *
 * ## Why a rolling window rather than the whole series
 *
 * A meeting is a start plus a recurrence rule, and its occurrences are computed
 * on read (FR-006). "Every Monday, no end date" therefore has infinitely many
 * of them, so the alerts cannot be planned once at creation — the choice is
 * between planning for ever (unbounded rows) and planning a window and
 * advancing it. The window is `meetings.alertWindowDays`, a registry key
 * because how far ahead the phone should hold alarms is exactly the sort of
 * number an operator retunes.
 *
 * Which is also why there is a nightly pass. Nothing has to *happen* for
 * tomorrow's edge of the window to need filling, so the event branches alone
 * would leave the window frozen on a quiet week.
 *
 * ## Why it reconciles on `(occurrence, label)` and not on `label`
 *
 * P2's reconcile is one desired set per `(source.kind, source.id)` keyed by
 * label, which is exact for a task or a reminder: one source, one moment. A
 * recurring meeting is one source id with *many* moments, so keying by label
 * alone would have occurrence two's `1h` warning overwrite occurrence one's and
 * the member would get one reminder for a weekly series. The key here is the
 * alert's own uniqueness key — `alertKey`, which already includes
 * `source.occurrenceAt` and is what the partial unique index in Mongo enforces
 * — so the reconcile and the store agree on what "the same alert" means.
 *
 * That is a sibling of the saga's `reconcile` rather than a change to it. The
 * task and reminder paths are three phases deep and correct; widening their key
 * would turn a reschedule from "move this alert" into "delete it and plan
 * another", which is a different row with a different id for no gain.
 *
 * ## Idempotence
 *
 * `source.occurrenceAt` is the occurrence's `originalStart` — the moment the
 * *rule* produced, which is also the override key on the meeting. So a moved
 * occurrence keeps its identity and the reconcile moves the alert it already
 * holds; and running the whole pass twice finds every wanted alert already
 * present, unchanged, and writes nothing at all. The events arrive at least
 * once, so that is not a nicety.
 */
@Injectable()
export class ReconcileMeetingAlertsHandler {
  private readonly logger = new Logger(ReconcileMeetingAlertsHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly alerts: AlertRepository,
    private readonly member: MemberContextPort,
    private readonly occurrences: MeetingOccurrencesPort,
    private readonly members: MeetingMembersPort,
    private readonly settings: SettingsService,
    private readonly heartbeats: HeartbeatService,
    private readonly nextId: () => string,
  ) {}

  /**
   * The nightly pass: every member who has a diary.
   *
   * ## A member who throws is logged and skipped, not fatal
   *
   * Deliberately, and it is the same call `rhythm`'s tick makes for the same
   * reason: one member with a rule the expander chokes on must not stop the
   * window advancing for everybody else. Aborting would make the blast radius
   * of one bad row the whole installation, and the heartbeat would go green
   * anyway on the next night that member's meeting fell out of the window —
   * which is the worst of both, a fault that fixes itself before anybody sees
   * it and comes back later.
   *
   * The counters are incremented as each member returns, so a member who threw
   * leaves the totals short while whatever it saved before throwing stands.
   * Read the alerts, not this number, when asking what a 03:00 pass did.
   */
  async handle(now: Date = new Date()): Promise<ReconcileMeetingAlertsResult> {
    const started = Date.now();
    const result: ReconcileMeetingAlertsResult = {
      members: 0,
      meetings: 0,
      planned: 0,
      removed: 0,
      ms: 0,
    };

    try {
      const userIds = await this.members.withMeetings();
      for (const userId of userIds) {
        result.members += 1;
        try {
          const one = await this.forMember(userId, now);
          result.meetings += one.meetings;
          result.planned += one.planned;
          result.removed += one.removed;
        } catch (error) {
          this.logger.error(
            `meeting alert reconcile failed for ${userId}: ${(error as Error).message}`,
          );
        }
      }

      result.ms = Date.now() - started;
      await this.heartbeats.stamp(
        MEETING_ALERTS_JOB,
        true,
        undefined,
        result.ms,
      );
      return result;
    } catch (error) {
      // Stamped on the way out either way. A scheduled job that stops arriving
      // has to be visible: `/health` reports this key stale after fifteen
      // minutes, and a silent 401 between n8n and the gateway once went
      // unnoticed for days.
      result.ms = Date.now() - started;
      await this.heartbeats.stamp(
        MEETING_ALERTS_JOB,
        false,
        (error as Error).message,
        result.ms,
      );
      throw error;
    }
  }

  /**
   * Every meeting this member has in the window.
   *
   * The time-zone branch calls this rather than rebuilding from the stored
   * instants, and that is the whole of FR-014: an unpinned series' occurrences
   * are wall times, so all of their instants moved when the member did. Coming
   * back through the port re-expands the rule against the member's *current*
   * zone — and a series with `lockTimezone` expands in its own zone and comes
   * back at the same instants, which is the entire point of the flag.
   */
  async forMember(
    userId: string,
    now: Date = new Date(),
  ): Promise<MemberReconcileResult> {
    const occurrences = await this.readWindow(userId, now);
    return this.reconcileAll(userId, occurrences, now);
  }

  /**
   * One meeting, after one of its events.
   *
   * It reads the member's whole window and keeps this meeting's occurrences,
   * because the port answers per member: Meetings has to load the member's
   * series to expand any of them anyway, so a per-meeting method would save a
   * filter and no round trip. A member has tens of meetings, not thousands.
   */
  async forMeeting(
    userId: string,
    meetingId: string,
    now: Date = new Date(),
  ): Promise<MemberReconcileResult> {
    const occurrences = (await this.readWindow(userId, now)).filter(
      (occurrence) => occurrence.meetingId === meetingId,
    );

    // No occurrences left in the window — the member skipped the only one, or
    // the meeting was completed, cancelled or deleted between the event being
    // raised and this running. Reconciling to an empty set is what removes the
    // alerts; returning early would leave them to fire.
    return this.reconcileMeeting(userId, meetingId, occurrences, now);
  }

  private async readWindow(
    userId: string,
    now: Date,
  ): Promise<MeetingOccurrence[]> {
    const windowDays = await this.settings.get('meetings.alertWindowDays');
    const to = new Date(now.getTime() + windowDays * 86_400_000);
    return this.occurrences.forMember(userId, now, to);
  }

  private async reconcileAll(
    userId: string,
    occurrences: MeetingOccurrence[],
    now: Date,
  ): Promise<MemberReconcileResult> {
    const byMeeting = new Map<string, MeetingOccurrence[]>();
    for (const occurrence of occurrences) {
      const group = byMeeting.get(occurrence.meetingId);
      if (group) group.push(occurrence);
      else byMeeting.set(occurrence.meetingId, [occurrence]);
    }

    const total: MemberReconcileResult = {
      meetings: 0,
      planned: 0,
      removed: 0,
    };
    for (const [meetingId, group] of byMeeting) {
      const one = await this.reconcileMeeting(userId, meetingId, group, now);
      total.meetings += one.meetings;
      total.planned += one.planned;
      total.removed += one.removed;
    }
    return total;
  }

  /**
   * Make this meeting's pending alerts equal what its occurrences deserve.
   *
   * Three passes over one read, and the deletion pass is the one that is easy
   * to leave out: a skipped occurrence, a dropped reminder offset and a
   * preparation block set back to zero all leave alerts that should no longer
   * exist. Only planning what is missing would leave them to fire.
   */
  private async reconcileMeeting(
    userId: string,
    meetingId: string,
    occurrences: MeetingOccurrence[],
    now: Date,
  ): Promise<MemberReconcileResult> {
    const [{ timezone }, preferences] = await Promise.all([
      this.member.clock(userId),
      this.member.alertPreferences(userId),
    ]);

    const desired = desiredForMeeting(
      occurrences,
      preferences.quietHours,
      timezone,
    );
    const existing = await this.alerts.pendingForSource(userId, {
      kind: 'meeting',
      id: meetingId,
    });
    const held = new Map(existing.map((alert) => [alert.key, alert]));
    const at = new Date();
    const result: MemberReconcileResult = {
      meetings: occurrences.length > 0 ? 1 : 0,
      planned: 0,
      removed: 0,
    };

    await this.uow.run(async () => {
      for (const [key, want] of desired) {
        const current = held.get(key);

        if (!current) {
          /*
           * A warning whose moment has already passed is never *created*.
           *
           * `desiredFor` keeps past lead times for a task, on the reasoning
           * that the sweep expires what is too old in one place — which holds
           * when the source event arrives once, near the moment. This pass runs
           * every night over a fortnight of occurrences, so the same rule would
           * resurrect a warning that has already gone out: a sent alert is not
           * `pendingForSource`, so the reconcile cannot see it, and it would
           * plan a fresh copy of yesterday's `1d` warning every night until the
           * meeting arrived. The member would be told repeatedly about one
           * meeting, which is exactly the failure the reconcile exists to
           * prevent.
           *
           * A row that is already there is left alone whatever its moment: the
           * sweep owns the decision to send or expire it, and deleting one the
           * sweep has yet to reach would suppress a warning the member is owed.
           */
          if (want.notifyAt < now) continue;

          await this.alerts.save(
            Alert.plan({
              id: this.nextId(),
              userId,
              source: {
                kind: 'meeting',
                id: meetingId,
                occurrenceAt: want.occurrenceAt,
              },
              label: want.label,
              notifyAt: want.notifyAt,
              title: want.title,
              body: '',
              // The meeting, not the occurrence. A client resolves which
              // occurrence this is from the alert's own `source.occurrenceAt`;
              // a link carrying a date would be a second encoding of the same
              // fact, one of them stale the first time the member moved it.
              deepLink: `botvy://meetings/${meetingId}`,
              plannedAt: at,
            }),
          );
          result.planned += 1;
          continue;
        }

        // Already there: move it if the moment or the wording changed, and
        // leave it entirely alone if not, so a redelivered event and a second
        // nightly pass both write nothing at all.
        if (current.replan(want.notifyAt, want.title, at)) {
          await this.alerts.save(current);
        }
      }

      for (const alert of existing) {
        if (!desired.has(alert.key)) {
          await this.alerts.remove(alert);
          result.removed += 1;
        }
      }
    });

    return result;
  }
}

/** One warning this pass wants to exist, and the occurrence it belongs to. */
interface DesiredMeetingAlert {
  occurrenceAt: Date;
  label: AlertLabel;
  notifyAt: Date;
  title: string;
}

/**
 * Every warning a window of occurrences deserves, keyed by the alert's own
 * uniqueness key.
 *
 * One per `reminderOffsets` entry, plus one for the preparation block when
 * `prepMinutes > 0`. The offsets are the meeting's own, stored on it at
 * creation from the member's `defaults.leadTimes`, so a later preference change
 * never silently moves the reminders of a meeting that already exists — which
 * is why this does not read `preferences.leadTimes` the way the task path does.
 *
 * Quiet hours still apply, through the same `sendAt` the rest of this context
 * uses, and the same distinction still decides: the label `0m` is the moment
 * the member themselves chose and is never moved, every other label is a
 * warning the system derived and may be held until the window ends. An offset
 * of zero minutes is the occurrence's own start, so it labels `0m` and inherits
 * that reading with no rule of its own.
 */
function desiredForMeeting(
  occurrences: MeetingOccurrence[],
  quiet: QuietHours,
  timezone: string,
): Map<string, DesiredMeetingAlert> {
  const desired = new Map<string, DesiredMeetingAlert>();

  const want = (
    occurrenceAt: Date,
    meetingId: string,
    label: AlertLabel,
    moment: Date,
    title: string,
  ) => {
    desired.set(
      alertKey({ kind: 'meeting', id: meetingId, occurrenceAt }, label),
      {
        occurrenceAt,
        label,
        notifyAt: sendAt(moment, label, quiet, timezone),
        title,
      },
    );
  };

  for (const occurrence of occurrences) {
    const start = occurrence.startAt.getTime();

    for (const offset of occurrence.reminderOffsets) {
      want(
        occurrence.originalStart,
        occurrence.meetingId,
        offsetLabel(offset),
        new Date(start - offset * 60_000),
        occurrence.title,
      );
    }

    if (occurrence.prepMinutes > 0) {
      want(
        occurrence.originalStart,
        occurrence.meetingId,
        PREP_LABEL,
        new Date(start - occurrence.prepMinutes * 60_000),
        `Prepare: ${occurrence.title}`,
      );
    }
  }

  return desired;
}

/**
 * A reminder offset in minutes as the lead-time label the rest of this context
 * speaks.
 *
 * Reusing the existing vocabulary rather than inventing one is what keeps
 * `MEMBER_CHOSEN_LABEL` meaning what it means: zero minutes before the meeting
 * *is* the moment the member chose, so it must carry `0m` and be exempt from
 * the quiet-hours shift like every other member-chosen moment. Coining
 * `offset:0` would have made the meeting's own start a derived warning and held
 * a 23:00 call's notification until seven the next morning.
 *
 * Exported for the spec, which asserts the labels rather than only their
 * count — a label is half of the reconcile's key, so a wrong one is a warning
 * that never matches itself and is deleted and re-planned for ever.
 */
export function offsetLabel(minutes: number): AlertLabel {
  if (minutes === 0) return MEMBER_CHOSEN_LABEL;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}
