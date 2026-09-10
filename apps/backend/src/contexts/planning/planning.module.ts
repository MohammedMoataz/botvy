import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  LabelSchema,
  MODEL_NAMES,
  TaskSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { LabelRepository } from './domain/label.repository.js';
import { TASK_READ_REPOSITORY } from './domain/task-read.repository.js';
import { TaskRepository } from './domain/task.repository.js';
import { CancelTaskHandler } from './features/cancel-task/cancel-task.handler.js';
import { CompleteTaskHandler } from './features/complete-task/complete-task.handler.js';
import { CreateLabelHandler } from './features/create-label/create-label.handler.js';
import { CreateTaskHandler } from './features/create-task/create-task.handler.js';
import { DeferTaskHandler } from './features/defer-task/defer-task.handler.js';
import { DeleteLabelHandler } from './features/delete-label/delete-label.handler.js';
import { DeleteTaskHandler } from './features/delete-task/delete-task.handler.js';
import { LabelSnapshotHandler } from './features/label-snapshot/label-snapshot.handler.js';
import { PlanningPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { PurgeTaskHandler } from './features/purge-task/purge-task.handler.js';
import { ReopenTaskHandler } from './features/reopen-task/reopen-task.handler.js';
import { RestoreTaskHandler } from './features/restore-task/restore-task.handler.js';
import { RolloverHandler } from './features/rollover/rollover.handler.js';
import { SkipOccurrenceHandler } from './features/skip-occurrence/skip-occurrence.handler.js';
import { TasksDueQueryHandler } from './features/tasks-due-query/tasks-due.query.js';
import { TasksQueryHandler } from './features/tasks-query/tasks.query.js';
import { UpdateLabelHandler } from './features/update-label/update-label.handler.js';
import { UpdateTaskHandler } from './features/update-task/update-task.handler.js';
import {
  MongoLabelRepository,
  MongoTaskRepository,
  type LabelDoc,
  type TaskDoc,
} from './infrastructure/mongo-planning.repositories.js';
import { MongoTaskReadRepository } from './infrastructure/mongo-task-read.repository.js';

/**
 * Planning: what the member has to do, and the labels they group it under.
 *
 * Providers only. The controller is declared by the backend role in
 * `AppModule`, so the worker can import this module for `LabelSnapshotHandler`
 * — which runs where the relay runs — and for `PurgeTaskHandler`, whose
 * `purgeTombstones` the sweep dispatches, without gaining an HTTP surface it
 * should not have.
 *
 * `ProfileModule` is imported for one thing: `MemberContextPort`. That is not
 * Planning reaching into Profile — the port lives in `shared/`, Profile
 * provides the binding, and nothing in this context imports anything from
 * `../profile/`. What is imported here is the *module*, so Nest can find the
 * provider; the dependency in the code is on the shared port alone, which is
 * what makes it possible to move that port's implementation later without
 * touching a line of Planning.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.task, schema: TaskSchema },
      { name: MODEL_NAMES.label, schema: LabelSchema },
    ]),
  ],
  providers: [
    {
      provide: TaskRepository,
      inject: [
        getModelToken(MODEL_NAMES.task),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<TaskDoc>, outbox: Model<OutboxInsert>) =>
        new MongoTaskRepository(model, outbox),
    },
    {
      provide: LabelRepository,
      inject: [
        getModelToken(MODEL_NAMES.label),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<LabelDoc>, outbox: Model<OutboxInsert>) =>
        new MongoLabelRepository(model, outbox),
    },
    {
      // A token rather than a class, because the read port is an interface and
      // an interface has no runtime identity to inject by.
      provide: TASK_READ_REPOSITORY,
      inject: [
        getModelToken(MODEL_NAMES.task),
        getModelToken(MODEL_NAMES.label),
      ],
      useFactory: (tasks: Model<TaskDoc>, labels: Model<LabelDoc>) =>
        new MongoTaskReadRepository(tasks, labels),
    },
    // Every one of these takes its dependencies by class token, so Nest builds
    // them without a factory. They are listed rather than glob-imported so that
    // a slice added without being provided fails at boot instead of at the
    // first request.
    CreateTaskHandler,
    UpdateTaskHandler,
    CompleteTaskHandler,
    ReopenTaskHandler,
    CancelTaskHandler,
    DeferTaskHandler,
    DeleteTaskHandler,
    RestoreTaskHandler,
    PurgeTaskHandler,
    PlanningPurgeOnDeletedHandler,
    SkipOccurrenceHandler,
    RolloverHandler,
    CreateLabelHandler,
    UpdateLabelHandler,
    DeleteLabelHandler,
    LabelSnapshotHandler,
    TasksQueryHandler,
    TasksDueQueryHandler,
    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    PlanningPurgeOnDeletedHandler,
    TaskRepository,
    LabelRepository,
    TASK_READ_REPOSITORY,
    CreateTaskHandler,
    UpdateTaskHandler,
    CompleteTaskHandler,
    ReopenTaskHandler,
    CancelTaskHandler,
    DeferTaskHandler,
    DeleteTaskHandler,
    RestoreTaskHandler,
    PurgeTaskHandler,
    SkipOccurrenceHandler,
    RolloverHandler,
    CreateLabelHandler,
    UpdateLabelHandler,
    DeleteLabelHandler,
    LabelSnapshotHandler,
    // The published read surface. `TasksDueQueryHandler` is exported for P3 and
    // P5; `TASK_READ_REPOSITORY` is exported for this context's own resolvers
    // and for the sync adapter, and no other context should inject it.
    TasksQueryHandler,
    TasksDueQueryHandler,
  ],
})
export class PlanningModule {}
