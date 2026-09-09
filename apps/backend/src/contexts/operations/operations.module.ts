import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ENV } from '../../shared/config/config.module.js';
import type { Env } from '../../shared/config/env.schema.js';
import { EVENT_SCHEMA_VERSION, contextOf } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import { OutboxWriter } from '../../shared/outbox/outbox-writer.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  AuditLogSchema,
  HeartbeatSchema,
  MODEL_NAMES,
  PingSchema,
  SettingSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { PushService } from '../../shared/push/push.service.js';
import { SETTINGS_EVENT_SINK, SettingsService, type SettingsEventSink } from '../../shared/settings/settings.service.js';
import { SettingsStore } from '../../shared/settings/settings.store.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AuditPort } from './domain/audit.port.js';
import { HeartbeatRepository } from './domain/heartbeat.repository.js';
import { PingRepository } from './domain/ping.aggregate.js';
import { AdminPasswordFlagHandler } from './features/admin-password-flag/admin-password-flag.handler.js';
import { PingHandler } from './features/ping/ping.handler.js';
import { PingedHandler } from './features/ping/pinged.handler.js';
import { ADMIN_DEVICE_LOOKUP, SeededAdminDeviceLookup } from './infrastructure/admin-device.lookup.js';
import {
  MongoAuditAdapter,
  MongoHeartbeatRepository,
  MongoSettingsStore,
} from './infrastructure/mongo-operations.adapters.js';
import { MongoPingRepository, type PingDoc } from './infrastructure/mongo-ping.repository.js';

type AnyModel = Model<Record<string, unknown>>;

/**
 * Operations: settings, heartbeats, the audit trail and the demonstration
 * slice, all on MongoDB. Providers only — the controllers are declared by the
 * backend role, so importing this module into the worker gives it the
 * services and none of the routes.
 */
@Module({
  imports: [
    OutboxModule,
    IdentityModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.ping, schema: PingSchema },
      { name: MODEL_NAMES.heartbeat, schema: HeartbeatSchema },
      { name: MODEL_NAMES.setting, schema: SettingSchema },
      { name: MODEL_NAMES.auditLog, schema: AuditLogSchema },
    ]),
  ],
  providers: [
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
    {
      provide: PingRepository,
      inject: [getModelToken(MODEL_NAMES.ping), getModelToken(MODEL_NAMES.outbox)],
      useFactory: (ping: Model<PingDoc>, outbox: Model<OutboxInsert>) =>
        new MongoPingRepository(ping, outbox),
    },
    {
      provide: HeartbeatRepository,
      inject: [getModelToken(MODEL_NAMES.heartbeat)],
      useFactory: (model: AnyModel) => new MongoHeartbeatRepository(model),
    },
    {
      provide: AuditPort,
      inject: [getModelToken(MODEL_NAMES.auditLog)],
      useFactory: (model: AnyModel) => new MongoAuditAdapter(model),
    },
    {
      provide: SettingsStore,
      inject: [getModelToken(MODEL_NAMES.setting)],
      useFactory: (model: AnyModel) => new MongoSettingsStore(model),
    },
    {
      // A changed setting is an event like any other: through the outbox, so
      // the other role's cache learns about it the same way n8n would.
      provide: SETTINGS_EVENT_SINK,
      inject: [OutboxWriter],
      useFactory: (writer: OutboxWriter): SettingsEventSink => ({
        publish: (name, payload) =>
          writer.append([
            {
              eventId: newId(),
              name,
              context: contextOf(name),
              aggregate: { type: 'setting', id: String((payload as { key?: string })?.key ?? '') },
              userId: null,
              occurredAt: new Date(),
              payload,
              schemaVersion: EVENT_SCHEMA_VERSION,
            },
          ]),
      }),
    },
    {
      provide: PushService,
      inject: [ENV],
      useFactory: (env: Env) => {
        const push = new PushService(env.FIREBASE_CREDENTIALS_FILE);
        push.initialise();
        return push;
      },
    },
    { provide: ADMIN_DEVICE_LOOKUP, useClass: SeededAdminDeviceLookup },
    HeartbeatService,
    SettingsService,
    PingHandler,
    PingedHandler,
    AdminPasswordFlagHandler,
  ],
  exports: [
    UnitOfWork,
    PingRepository,
    HeartbeatRepository,
    AuditPort,
    SettingsStore,
    SettingsService,
    HeartbeatService,
    PushService,
    ADMIN_DEVICE_LOOKUP,
    PingHandler,
    PingedHandler,
    AdminPasswordFlagHandler,
    MongooseModule,
  ],
})
export class OperationsModule {}
