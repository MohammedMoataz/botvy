import { Controller, HttpCode, Post } from '@nestjs/common';
import { Scopes, ServiceOnly } from '../../../../shared/auth/decorators.js';
import {
  SessionMaterialiserSaga,
  type MaterialiseResult,
} from './materialise.saga.js';

/**
 * The nightly materialiser pass, as a route only a machine may call.
 *
 * `ServiceOnly` rather than a role check, for the reason P5's sibling states:
 * this is not "an administrator's endpoint", it is an endpoint no *person* has
 * any business calling. A member being able to walk everybody's fortnight is a
 * different thing from a member being an administrator, so a member's JWT is
 * refused whatever their role — by the `KindGuard`, before this class is
 * constructed.
 *
 * `internal:tick` is the scope every unattended pass in the platform holds, and
 * a scope is declared on the class. n8n holds exactly the scopes for the jobs it
 * runs: a service token is not a master key.
 *
 * ## Why its own workflow and not a branch of an existing tick
 *
 * The plan says "the materialiser runs on the existing nightly tick". There is
 * no such thing — `rhythm_tick` and `notifications_sweep` fire every five
 * minutes and `meeting_alerts_reconcile` is Notifications' own job. A five-minute
 * pulse would need a claimed date to stop this walking every member's fortnight
 * all day; a nightly schedule of its own needs no claim, because the pass is
 * idempotent and a retry, a manual run and a catch-up after the gateway was
 * down all reconcile to the same set.
 */
@Controller('internal/training')
@ServiceOnly()
@Scopes('internal:tick')
export class InternalMaterialiseController {
  constructor(private readonly materialiser: SessionMaterialiserSaga) {}

  /**
   * One pass over every member with at least one slot, so the horizon advances
   * on a day when nothing at all happens — which is the only reason this exists,
   * and the whole of FR-008's second half: week four of a four-week program is
   * filled on the day the horizon reaches it, not at apply time.
   *
   * Returns the counts rather than an ack, because n8n's workflow logs the
   * response and that log is the only record of what a 03:40 pass did. A bare
   * `{ ok: true }` would make "ran and everything was already correct" and "ran
   * and created four hundred sessions" the same line.
   */
  @Post('materialise')
  @HttpCode(200)
  async run(): Promise<MaterialiseResult> {
    return this.materialiser.handle();
  }
}
