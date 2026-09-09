import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ENV } from '../../shared/config/config.module.js';
import type { Env } from '../../shared/config/env.schema.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
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
import { IdentityModule } from '../identity/identity.module.js';
import { PingRepository } from './domain/ping.aggregate.js';
import { AdminPasswordFlagHandler } from './features/admin-password-flag/admin-password-flag.handler.js';
import { OperationsBootstrap } from './features/admin-password-flag/operations.bootstrap.js';
import { PingHandler } from './features/ping/ping.handler.js';
import { PingedHandler } from './features/ping/pinged.handler.js';
import { ADMIN_DEVICE_LOOKUP, SeededAdminDeviceLookup } from './infrastructure/admin-device.lookup.js';
import { MongoPingRepository, type PingDoc } from './infrastructure/mongo-ping.repository.js';

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
      provide: PushService,
      inject: [ENV],
      useFactory: (env: Env) => {
        const push = new PushService(env.FIREBASE_CREDENTIALS_FILE);
        push.initialise();
        return push;
      },
    },
    { provide: ADMIN_DEVICE_LOOKUP, useClass: SeededAdminDeviceLookup },
    PingHandler,
    PingedHandler,
    AdminPasswordFlagHandler,
    OperationsBootstrap,
  ],
  // The shared-kernel services are no longer re-exported: `PlatformModule` is
  // global, so a context that needs `SettingsService` or `AuditPort` gets it
  // without naming anybody. Re-exporting them here is what made this module
  // look like the only way to reach them, and then made Identity import it.
  exports: [
    UnitOfWork,
    PingRepository,
    PushService,
    ADMIN_DEVICE_LOOKUP,
    PingHandler,
    PingedHandler,
    AdminPasswordFlagHandler,
    MongooseModule,
  ],
})
export class OperationsModule {}
