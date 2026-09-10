import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { MemberContextPort } from '../../shared/member/member-context.port.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  AlertSchema,
  MODEL_NAMES,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { PushService } from '../../shared/push/push.service.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { AlertRepository } from './domain/alert.repository.js';
import {
  DeviceLookupPort,
  DeviceRemovalPort,
  TombstonePurgePort,
} from './domain/notification.ports.js';
import { PendingAlertsQueryHandler } from './features/pending-alerts/pending-alerts.query.js';
import {
  ALERT_ID,
  PlanAlertsSaga,
  type AlertIdFactory,
} from './features/plan-alerts-saga/plan-alerts.saga.js';
import { SweepHandler } from './features/sweep/sweep.handler.js';
import {
  IdentityDeviceLookup,
  IdentityDeviceRemoval,
  PlanningTombstonePurge,
  RemindersTombstonePurge,
} from './infrastructure/notification.adapters.js';
import {
  MongoAlertRepository,
  newAlertId,
  type AlertDoc,
} from './infrastructure/mongo-alert.repository.js';

/**
 * The token the sweep injects to get every context that owns tombstones.
 *
 * A multi-provider array rather than two named dependencies, so P5's meetings
 * and P6's sessions join by adding a provider here instead of by editing the
 * sweep. The sweep's job is to run on a timer and add up what the owners
 * report; which owners exist is not its business.
 */
export const TOMBSTONE_PURGES = Symbol('TOMBSTONE_PURGES');

/**
 * Notifications: one place that decides when to tell the member something, and
 * one place that tells them.
 *
 * It imports four other context modules, which looks like a lot until you see
 * *what for*: every one is a binding for a port declared in this context's own
 * `domain/`, made in this context's own `infrastructure/`. Nothing in `domain/`
 * or `features/` imports any of them — the saga takes `MemberContextPort` and
 * the sweep takes three abstract ports, and neither can name a context. That is
 * the seam constitution IX sanctions, and the lint rule enforces the half of it
 * that matters by refusing such an import anywhere but `infrastructure/`.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    IdentityModule,
    PlanningModule,
    RemindersModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.alert, schema: AlertSchema },
    ]),
  ],
  providers: [
    {
      provide: AlertRepository,
      inject: [
        getModelToken(MODEL_NAMES.alert),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<AlertDoc>, outbox: Model<OutboxInsert>) =>
        new MongoAlertRepository(model, outbox),
    },
    {
      // Server-only rows, so ObjectIds. A token rather than a call inside the
      // saga, because the in-memory adapter mints its own sortable ids and a
      // spec has to be able to substitute them.
      provide: ALERT_ID,
      useValue: newAlertId satisfies AlertIdFactory,
    },
    { provide: DeviceLookupPort, useClass: IdentityDeviceLookup },
    { provide: DeviceRemovalPort, useClass: IdentityDeviceRemoval },
    PlanningTombstonePurge,
    RemindersTombstonePurge,
    {
      provide: TOMBSTONE_PURGES,
      inject: [PlanningTombstonePurge, RemindersTombstonePurge],
      useFactory: (...purges: TombstonePurgePort[]) => purges,
    },
    {
      provide: PlanAlertsSaga,
      inject: [UnitOfWork, AlertRepository, MemberContextPort, ALERT_ID],
      useFactory: (
        uow: UnitOfWork,
        alerts: AlertRepository,
        member: MemberContextPort,
        nextId: AlertIdFactory,
      ) => new PlanAlertsSaga(uow, alerts, member, nextId),
    },
    {
      provide: SweepHandler,
      inject: [
        UnitOfWork,
        AlertRepository,
        DeviceLookupPort,
        DeviceRemovalPort,
        TOMBSTONE_PURGES,
        PushService,
        SettingsService,
        HeartbeatService,
      ],
      useFactory: (
        uow: UnitOfWork,
        alerts: AlertRepository,
        devices: DeviceLookupPort,
        removal: DeviceRemovalPort,
        purges: TombstonePurgePort[],
        push: PushService,
        settings: SettingsService,
        heartbeats: HeartbeatService,
      ) =>
        new SweepHandler(
          uow,
          alerts,
          devices,
          removal,
          purges,
          push,
          settings,
          heartbeats,
        ),
    },
    PendingAlertsQueryHandler,
    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    AlertRepository,
    PlanAlertsSaga,
    SweepHandler,
    PendingAlertsQueryHandler,
    DeviceLookupPort,
  ],
})
export class NotificationsModule {}
