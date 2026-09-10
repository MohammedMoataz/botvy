import { Injectable } from '@nestjs/common';
import { AlertRepository } from '../../domain/alert.repository.js';

/**
 * How far ahead the phone is given alarms to schedule.
 *
 * Seven days is a compromise between two real costs. Shorter, and a phone that
 * goes offline for a fortnight runs out of alarms and the member silently stops
 * being reminded of anything. Longer, and Android's own cap — a few dozen
 * pending alarms — is reached by the window rather than by the member's
 * actual week, so the far end is scheduled and the near end is not.
 */
export const PENDING_WINDOW_DAYS = 7;

/**
 * One alarm for the phone to schedule locally. Deliberately not the alert
 * aggregate: the phone has no use for `claimedAt` or `plannedAt`, and sending
 * them would invite a client to reason about the server's delivery state.
 */
export interface PendingAlertView {
  source: { kind: string; id: string; occurrenceAt: Date | null };
  label: string;
  notifyAt: Date;
  title: string;
  body: string;
  deepLink: string;
}

/**
 * The next seven days of alarms, so the device can schedule its own.
 *
 * This is the *primary* delivery path, not a convenience: an alarm scheduled on
 * the phone fires with the network off, in a tunnel, with the app killed. The
 * server sweep is the fallback for a device that has not synced. Which means
 * this query and the sweep have to agree about what is planned — the sweep's
 * device filter compares `lastSeenAt` against `plannedAt`, and it is *this*
 * query's response that advances `lastSeenAt` when the sync facade wraps it.
 *
 * Returned by `POST /api/v1/sync` rather than by a route of its own, because
 * the phone needs it on exactly the occasions it syncs and a second round trip
 * would be a second chance to be offline.
 */
@Injectable()
export class PendingAlertsQueryHandler {
  constructor(private readonly alerts: AlertRepository) {}

  async forMember(
    userId: string,
    now: Date = new Date(),
  ): Promise<PendingAlertView[]> {
    const to = new Date(now.getTime() + PENDING_WINDOW_DAYS * 86_400_000);
    const alerts = await this.alerts.upcomingForMember(userId, now, to);

    return alerts.map((alert) => ({
      source: alert.source,
      label: alert.label,
      notifyAt: alert.notifyAt,
      title: alert.title,
      body: alert.body,
      deepLink: alert.deepLink,
    }));
  }
}
