import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  MODEL_NAMES,
  ReminderSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import {
  REMINDER_READ_REPOSITORY,
  ReminderRepository,
} from './domain/reminder.repository.js';
import { ManageReminderHandler } from './features/manage-reminder/manage-reminder.handler.js';
import { ReminderLifecycleHandler } from './features/reminder-lifecycle/reminder-lifecycle.handler.js';
import { RemindersQueryHandler } from './features/reminders-query/reminders.query.js';
import {
  MongoReminderReadRepository,
  MongoReminderRepository,
  type ReminderDoc,
} from './infrastructure/mongo-reminder.repository.js';

/**
 * Reminders: a moment the member asked to be told about.
 *
 * Providers only; the controller is declared by the backend role in
 * `AppModule`, so the worker can import this for `ReminderLifecycleHandler`
 * — whose `purgeTombstones` the sweep dispatches — without gaining an HTTP
 * surface.
 *
 * `ProfileModule` is here for `MemberContextPort` alone, and the same note
 * applies as in `PlanningModule`: the *module* is imported so Nest can find
 * the provider, but the dependency in the code is on the shared port, and
 * nothing under `contexts/reminders/` imports anything under
 * `contexts/profile/`.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.reminder, schema: ReminderSchema },
    ]),
  ],
  providers: [
    {
      provide: ReminderRepository,
      inject: [
        getModelToken(MODEL_NAMES.reminder),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<ReminderDoc>, outbox: Model<OutboxInsert>) =>
        new MongoReminderRepository(model, outbox),
    },
    {
      provide: REMINDER_READ_REPOSITORY,
      inject: [getModelToken(MODEL_NAMES.reminder)],
      useFactory: (model: Model<ReminderDoc>) =>
        new MongoReminderReadRepository(model),
    },
    ManageReminderHandler,
    ReminderLifecycleHandler,
    RemindersQueryHandler,
    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    ReminderRepository,
    REMINDER_READ_REPOSITORY,
    ManageReminderHandler,
    ReminderLifecycleHandler,
    RemindersQueryHandler,
  ],
})
export class RemindersModule {}
