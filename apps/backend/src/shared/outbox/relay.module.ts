import { Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { IdentityOutboxRepository } from '../../contexts/identity/domain/identity-outbox.repository.js';
import { IdentityModule } from '../../contexts/identity/identity.module.js';
import { PingedHandler } from '../../contexts/operations/features/ping/pinged.handler.js';
import { OperationsModule } from '../../contexts/operations/operations.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { HeartbeatService } from '../health/heartbeat.service.js';
import { RELAY_LIVENESS } from '../health/healthz.controller.js';
import { MODEL_NAMES } from '../persistence/mongo/schemas.js';
import { SettingsService } from '../settings/settings.service.js';
import { IdentityOutboxForwarder } from './identity-outbox-forwarder.js';
import { MongoOutboxStore, type OutboxDoc, type RelayStateDoc } from './mongo-outbox.store.js';
import { OutboxModule } from './outbox.module.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxWriter } from './outbox-writer.js';
import { RelayRuntime } from './relay.runtime.js';
import { HTTP_POST, WebhookFanout, type HttpPost } from './webhook-fanout.js';

export const RELAY_JOB = 'outbox.relay';
const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * The worker's half of the outbox: the change-stream relay, the identity
 * forwarder and the webhook fan-out, plus the runtime that keeps them alive
 * and reports on them. Backend never imports this — it only writes.
 *
 * In-process delivery is a small table from event name to handler. There is
 * no EventBus in P0 because two handlers do not need a bus; the table grows a
 * row per handler until a phase shows it should become one.
 */
@Module({
  imports: [OutboxModule, IdentityModule, OperationsModule],
  providers: [
    {
      provide: MongoOutboxStore,
      inject: [getModelToken(MODEL_NAMES.outbox), getModelToken(MODEL_NAMES.relayState)],
      useFactory: (outbox: Model<OutboxDoc>, state: Model<RelayStateDoc>) =>
        new MongoOutboxStore(outbox, state),
    },
    {
      provide: HTTP_POST,
      useValue: (async (url, body, headers) => {
        const response = await fetch(url, {
          method: 'POST',
          body,
          headers,
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        return { ok: response.ok, status: response.status };
      }) satisfies HttpPost,
    },
    {
      provide: WebhookFanout,
      inject: [ENV, HTTP_POST],
      useFactory: (env: Env, post: HttpPost) => new WebhookFanout(env.AUTOMATION_WEBHOOK_SECRET, post),
    },
    {
      provide: OutboxRelay,
      inject: [MongoOutboxStore, WebhookFanout, SettingsService, PingedHandler, HeartbeatService],
      useFactory: (
        store: MongoOutboxStore,
        fanout: WebhookFanout,
        settings: SettingsService,
        pinged: PingedHandler,
        heartbeats: HeartbeatService,
      ) =>
        new OutboxRelay({
          store,
          fanout,
          subscriptions: async () =>
            (await settings.get('automation.subscriptions')).map((sub) => ({
              ...sub,
              enabled: sub.enabled ?? false,
            })),
          publish: async (event: DomainEvent) => {
            switch (event.name) {
              case 'operations.Pinged':
                await pinged.handle(event);
                return;
              case 'operations.SettingChanged':
                settings.invalidate(String((event.payload as { key?: string })?.key ?? ''));
                return;
              default:
                return;
            }
          },
          heartbeat: (ok, error) => heartbeats.stamp(RELAY_JOB, ok, error),
        }),
    },
    {
      provide: IdentityOutboxForwarder,
      inject: [IdentityOutboxRepository, OutboxWriter],
      useFactory: (pending: IdentityOutboxRepository, writer: OutboxWriter) =>
        new IdentityOutboxForwarder(pending, writer),
    },
    {
      provide: RelayRuntime,
      inject: [OutboxRelay, IdentityOutboxForwarder, MongoOutboxStore, HeartbeatService],
      useFactory: (
        relay: OutboxRelay,
        forwarder: IdentityOutboxForwarder,
        store: MongoOutboxStore,
        heartbeats: HeartbeatService,
      ) =>
        new RelayRuntime({
          relay,
          forwarder,
          closeStore: () => store.close(),
          heartbeat: (ok, error) => heartbeats.stamp(RELAY_JOB, ok, error),
        }),
    },
    { provide: RELAY_LIVENESS, useExisting: RelayRuntime },
  ],
  exports: [RELAY_LIVENESS, RelayRuntime],
})
export class RelayModule {}
