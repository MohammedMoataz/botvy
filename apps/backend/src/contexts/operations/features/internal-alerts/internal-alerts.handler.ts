import { Injectable, Logger } from '@nestjs/common';
import type { Principal } from '../../../../shared/auth/principal.js';
import type { PushService } from '../../../../shared/push/push.service.js';
import { AuditPort } from '../../../../shared/audit/audit.port.js';

/** What Identity answers when asked for a member's devices. */
export interface DeviceSummary {
  userId: string;
  deviceId: string;
  kind: string;
  pushToken?: string | null;
  lastSeenAt: Date | null;
}

/** Identity's query, reached over the bus — never its tables. */
export interface AdminDeviceLookup {
  adminDevices(): Promise<DeviceSummary[]>;
}

export interface InternalAlertInput {
  workflow: string;
  error: string;
  executionId?: string;
}

/**
 * Tells the Owner an automation broke.
 *
 * It reaches an administrator's phone through Identity's device query rather
 * than by reading Identity's tables — a Mongo context opening PostgreSQL is
 * exactly what principle I forbids, and it is why that query exists this early.
 *
 * Nothing here throws. This is the path that reports a failure; a failure of
 * its own must not become a second, louder one that n8n then retries.
 */
@Injectable()
export class InternalAlertsHandler {
  private readonly logger = new Logger(InternalAlertsHandler.name);

  constructor(
    private readonly devices: AdminDeviceLookup,
    private readonly push: Pick<PushService, 'send'>,
    private readonly audit: AuditPort,
    private readonly principal: Principal,
  ) {}

  async handle(input: InternalAlertInput): Promise<{ notified: number }> {
    const admins = await this.devices.adminDevices();
    const tokens = admins
      .map((device) => device.pushToken)
      .filter((token): token is string => typeof token === 'string' && token.length > 0);

    let notified = 0;
    if (tokens.length > 0) {
      const result = await this.push.send(tokens, {
        title: `${input.workflow} failed`,
        body: input.error.slice(0, 240),
        data: { kind: 'ops_alert', workflow: input.workflow },
      });
      notified = result.sent;
    } else {
      // No administrator has a phone registered yet. That is an ordinary state
      // on a fresh install, not an error to throw at the caller.
      this.logger.warn(
        `${input.workflow} failed and no administrator device could be notified: ${input.error}`,
      );
    }

    await this.audit.record({
      actor: this.principal,
      action: 'ops.alert',
      target: { type: 'workflow', id: input.workflow },
      at: new Date(),
      meta: {
        error: input.error,
        notified,
        ...(input.executionId ? { executionId: input.executionId } : {}),
      },
    });

    return { notified };
  }
}
