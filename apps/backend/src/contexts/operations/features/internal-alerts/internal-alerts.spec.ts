import { describe, expect, it } from 'vitest';
import type { Principal } from '../../../../shared/auth/principal.js';
import type { PushResult } from '../../../../shared/push/push.service.js';
import { InMemoryAuditAdapter } from '../../infrastructure/mongo-operations.adapters.js';
import {
  InternalAlertsHandler,
  type AdminDeviceLookup,
  type DeviceSummary,
} from './internal-alerts.handler.js';

const n8n: Principal = { kind: 'service', id: 'svc-1', name: 'n8n', scopes: ['internal:alerts'] };

function device(overrides: Partial<DeviceSummary> = {}): DeviceSummary {
  return {
    userId: 'admin-1',
    deviceId: 'dev-1',
    kind: 'android',
    pushToken: 'token-1',
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function lookup(devices: DeviceSummary[]): AdminDeviceLookup {
  return { async adminDevices() { return devices; } };
}

function pushThat(result: PushResult) {
  const calls: Array<{ tokens: string[] }> = [];
  return {
    calls,
    send: async (tokens: string[]): Promise<PushResult> => {
      calls.push({ tokens });
      return result;
    },
  };
}

const input = { workflow: 'rhythm_tick', error: 'HTTP 401 from /internal/rhythm/tick' };

describe('internal alerts', () => {
  it('notifies every administrator device that has a push token', async () => {
    const push = pushThat({ sent: 2, failed: 0, invalidTokens: [] });
    const audit = new InMemoryAuditAdapter();
    const handler = new InternalAlertsHandler(
      lookup([device(), device({ deviceId: 'dev-2', pushToken: 'token-2' })]),
      push,
      audit,
      n8n,
    );

    expect(await handler.handle(input)).toEqual({ notified: 2 });
    expect(push.calls[0]?.tokens).toEqual(['token-1', 'token-2']);
  });

  it('skips a device with no push token rather than sending an empty one', async () => {
    const push = pushThat({ sent: 1, failed: 0, invalidTokens: [] });
    const handler = new InternalAlertsHandler(
      lookup([device(), device({ deviceId: 'dev-2', pushToken: null })]),
      push,
      new InMemoryAuditAdapter(),
      n8n,
    );

    await handler.handle(input);

    expect(push.calls[0]?.tokens).toEqual(['token-1']);
  });

  /**
   * An ordinary state on a fresh install, not an error to throw at the caller —
   * and n8n would retry a thrown one for ever.
   */
  it('answers zero, without throwing, when no administrator has a device', async () => {
    const push = pushThat({ sent: 0, failed: 0, invalidTokens: [] });
    const handler = new InternalAlertsHandler(lookup([]), push, new InMemoryAuditAdapter(), n8n);

    expect(await handler.handle(input)).toEqual({ notified: 0 });
    expect(push.calls).toHaveLength(0);
  });

  /**
   * This is the path that reports a failure. A failure of its own must not
   * become a second, louder one.
   */
  it('records a push failure rather than propagating it', async () => {
    const push = {
      async send(): Promise<PushResult> {
        return { sent: 0, failed: 1, invalidTokens: [] };
      },
    };
    const audit = new InMemoryAuditAdapter();
    const handler = new InternalAlertsHandler(lookup([device()]), push, audit, n8n);

    await expect(handler.handle(input)).resolves.toEqual({ notified: 0 });
    expect(audit.entries).toHaveLength(1);
  });

  it('leaves an audit row naming the workflow, the error and who reported it', async () => {
    const audit = new InMemoryAuditAdapter();
    const handler = new InternalAlertsHandler(
      lookup([device()]),
      pushThat({ sent: 1, failed: 0, invalidTokens: [] }),
      audit,
      n8n,
    );

    await handler.handle({ ...input, executionId: 'exec-42' });

    expect(audit.entries[0]).toMatchObject({
      actor: n8n,
      action: 'ops.alert',
      target: { type: 'workflow', id: 'rhythm_tick' },
      meta: { notified: 1, executionId: 'exec-42' },
    });
  });

  it('truncates a long error so a notification is still deliverable', async () => {
    const captured: string[] = [];
    const handler = new InternalAlertsHandler(
      lookup([device()]),
      {
        async send(_tokens, message) {
          captured.push(message.body);
          return { sent: 1, failed: 0, invalidTokens: [] };
        },
      },
      new InMemoryAuditAdapter(),
      n8n,
    );

    await handler.handle({ workflow: 'w', error: 'x'.repeat(1000) });

    expect(captured[0]!.length).toBe(240);
  });
});
