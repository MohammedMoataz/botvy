import { Controller, HttpCode, Post } from '@nestjs/common';
import { Scopes, ServiceOnly } from '../../../../shared/auth/decorators.js';
import {
  ReconcileMeetingAlertsHandler,
  type ReconcileMeetingAlertsResult,
} from './reconcile-meeting-alerts.handler.js';

/**
 * The nightly meeting-alert pass, as a route only a machine may call.
 *
 * `ServiceOnly` rather than a role check, and the distinction is constitution
 * VI: this is not "an administrator's endpoint", it is an endpoint no *person*
 * has any business calling. A member being able to trigger a re-plan over
 * everybody's diary is a different thing from a member being an administrator,
 * so a member's JWT is refused whatever their role — by the `KindGuard`,
 * before this class is constructed.
 *
 * ## Why its own controller beside `InternalSweepController`
 *
 * Same path prefix, different scope. The sweep's surface is `internal:sweep`
 * and this is `internal:tick`, the scope every unattended pass in the platform
 * holds, and a scope is declared on the class. Widening the sweep controller to
 * carry both would hand the sweep's credential this route as well — a service
 * token is not a master key, and n8n holds exactly the scopes for the jobs it
 * runs so that a leaked automation credential cannot also do somebody else's
 * job.
 *
 * ## Why its own workflow rather than a branch of the rhythm tick
 *
 * That tick fires every five minutes and would need a claimed date to stop this
 * pass repeating all day. A nightly schedule of its own needs no claim: the
 * work is idempotent, so a retry, a manual run and a catch-up after the gateway
 * was down all reconcile to the same set.
 */
@Controller('internal/notifications')
@ServiceOnly()
@Scopes('internal:tick')
export class InternalReconcileController {
  constructor(private readonly reconcile: ReconcileMeetingAlertsHandler) {}

  /**
   * One pass over every member with a meeting, so the rolling alert window
   * advances on a day when nothing at all happens.
   *
   * Returns the counts rather than an ack, because n8n's workflow logs the
   * response and that log is the only record of what a 03:00 pass did. A bare
   * `{ ok: true }` would make "ran and everything was already correct" and
   * "ran and planned four hundred warnings" the same line.
   */
  @Post('reconcile-meeting-alerts')
  @HttpCode(200)
  async run(): Promise<ReconcileMeetingAlertsResult> {
    return this.reconcile.handle();
  }
}
