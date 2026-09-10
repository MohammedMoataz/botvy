import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CurrentPrincipal,
  Scopes,
  ServiceOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { PushService } from '../../../../shared/push/push.service.js';
import { DeviceLookupPort } from '../../domain/notification.ports.js';
import { SweepHandler, type SweepResult } from './sweep.handler.js';

export class SendTestDto {
  /** Whose devices to reach. Omitted means the calling service's own test. */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}

/**
 * The two routes only a machine may call.
 *
 * `ServiceOnly` rather than a role check, and the distinction is constitution
 * VI: this is not "an administrator's endpoint", it is an endpoint no *person*
 * has any business calling. n8n's cron hits the sweep every five minutes with a
 * service token; a member's JWT is refused on it whatever their role, because a
 * member being able to trigger a delivery pass over everybody's alerts is a
 * different thing from a member being an administrator.
 */
@Controller('internal/notifications')
@ServiceOnly()
// The scope `contracts/internal.md` names for this surface. A service token is
// not a master key: n8n holds exactly the scopes for the jobs it runs, so a
// leaked automation credential cannot also read a member's chat.
@Scopes('internal:sweep')
export class InternalSweepController {
  constructor(
    private readonly sweep: SweepHandler,
    private readonly devices: DeviceLookupPort,
    private readonly push: PushService,
  ) {}

  /**
   * One delivery pass.
   *
   * Returns the counts rather than an ack, because n8n's workflow logs the
   * response and that log is the only record of what a 03:00 sweep did. A bare
   * `{ ok: true }` would make "the sweep ran and sent nothing" and "the sweep
   * ran and sent four hundred" the same line.
   */
  @Post('sweep')
  async run(): Promise<SweepResult> {
    return this.sweep.handle();
  }

  /**
   * A push to the member's own devices, to prove the route works end to end.
   *
   * It exists because the push path has more places to fail silently than
   * anything else in the system — a stale credentials file, a token the app
   * never registered, a device the member uninstalled, a notification
   * permission they declined — and every one of them looks identical from the
   * server: an alert marked sent and a phone that stays quiet. This is the one
   * way to ask "would a notification arrive right now" and get an answer.
   */
  @Post('test')
  @HttpCode(200)
  async sendTest(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SendTestDto,
  ): Promise<{
    devices: number;
    sent: number;
    failed: number;
    invalidTokens: number;
  }> {
    const userId = body.userId ?? principal.id;
    const devices = await this.devices.forUsers([userId]);
    const tokens = devices
      .map((device) => device.pushToken)
      .filter((token): token is string => token !== null);

    if (tokens.length === 0) {
      // Not an error. "This member has no device that can receive a push" is a
      // true and useful answer, and a 4xx would have the caller hunting for a
      // fault that is not there.
      return { devices: devices.length, sent: 0, failed: 0, invalidTokens: 0 };
    }

    const result = await this.push.send(tokens, {
      title: 'Botvy',
      body: body.message ?? 'Push notifications are working.',
      data: { kind: 'test' },
    });

    return {
      devices: devices.length,
      sent: result.sent,
      failed: result.failed,
      invalidTokens: result.invalidTokens.length,
    };
  }
}
