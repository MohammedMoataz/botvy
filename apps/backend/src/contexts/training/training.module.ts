import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { MemberContextPort } from '../../shared/member/member-context.port.js';
import { newId } from '../../shared/cqrs/ids.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  AthleteProfileSchema,
  MODEL_NAMES,
  ProgramSchema,
  SessionSchema,
  WorkoutSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { NextPracticeCutoffPort } from './domain/training.ports.js';
import {
  AthleteProfileRepository,
  ProgramRepository,
  SessionRepository,
  WorkoutRepository,
} from './domain/training.repositories.js';
import { ActivateProgramHandler } from './features/activate-program/activate-program.handler.js';
import { ApplyProgramHandler } from './features/apply-program/apply-program.handler.js';
import { ApplyWorkoutToSessionHandler } from './features/apply-workout-to-session/apply-workout-to-session.handler.js';
import { ArchiveProgramHandler } from './features/archive-program/archive-program.handler.js';
import { AthleteProfileQueryHandler } from './features/athlete-profile/athlete-profile.query.js';
import { BootstrapAthleteProfileHandler } from './features/bootstrap-athlete-profile/bootstrap-athlete-profile.handler.js';
import { CancelSessionHandler } from './features/cancel-session/cancel-session.handler.js';
import { ChooseSportsHandler } from './features/choose-sports/choose-sports.handler.js';
import { CompleteSessionHandler } from './features/complete-session/complete-session.handler.js';
import { CreateProgramHandler } from './features/create-program/create-program.handler.js';
import { CreateSessionHandler } from './features/create-session/create-session.handler.js';
import { CreateWorkoutHandler } from './features/create-workout/create-workout.handler.js';
import { DeleteProgramHandler } from './features/delete-program/delete-program.handler.js';
import { DeleteSessionHandler } from './features/delete-session/delete-session.handler.js';
import { DeleteWorkoutHandler } from './features/delete-workout/delete-workout.handler.js';
import { LogSessionHandler } from './features/log-session/log-session.handler.js';
import {
  SessionMaterialiserSaga,
  type ExerciseIdFactory,
} from './features/materialise/materialise.saga.js';
import { NextPracticeQueryHandler } from './features/next-practice/next-practice.query.js';
import { ProgramQueryHandler } from './features/program/program.query.js';
import { ProgramsQueryHandler } from './features/programs/programs.query.js';
import { PurgeProgramHandler } from './features/purge-program/purge-program.handler.js';
import { PurgeSessionHandler } from './features/purge-session/purge-session.handler.js';
import { PurgeTrainingTombstonesHandler } from './features/purge-tombstones/purge-tombstones.handler.js';
import { PurgeWorkoutHandler } from './features/purge-workout/purge-workout.handler.js';
import { TrainingPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { ReopenSessionHandler } from './features/reopen-session/reopen-session.handler.js';
import { RestoreProgramHandler } from './features/restore-program/restore-program.handler.js';
import { RestoreSessionHandler } from './features/restore-session/restore-session.handler.js';
import { RestoreWorkoutHandler } from './features/restore-workout/restore-workout.handler.js';
import { SessionQueryHandler } from './features/session/session.query.js';
import { SessionsInRangeQueryHandler } from './features/sessions/sessions-in-range.query.js';
import { SessionsQueryHandler } from './features/sessions/sessions.query.js';
import { SetSlotsHandler } from './features/set-slots/set-slots.handler.js';
import { SkipSessionHandler } from './features/skip-session/skip-session.handler.js';
import { TrainingSummaryQueryHandler } from './features/training-summary/training-summary.query.js';
import { UpdateProgramHandler } from './features/update-program/update-program.handler.js';
import { UpdateSessionHandler } from './features/update-session/update-session.handler.js';
import { UpdateWorkoutHandler } from './features/update-workout/update-workout.handler.js';
import { WorkoutsQueryHandler } from './features/workouts/workouts.query.js';
import {
  MongoAthleteProfileRepository,
  MongoProgramRepository,
  MongoSessionRepository,
  MongoWorkoutRepository,
  type AthleteProfileDoc,
  type ProgramDoc,
  type SessionDoc,
  type WorkoutDoc,
} from './infrastructure/mongo-training.repositories.js';
import { ProfileNextPracticeCutoff } from './infrastructure/training.adapters.js';

/**
 * Training: the athlete's week.
 *
 * Providers only. The four controllers are declared by the backend role in
 * `AppModule`, so the worker can import this module for the materialiser — which
 * runs where the relay runs — and for the tombstone sweep the nightly pass
 * dispatches, without gaining an HTTP surface it should not have.
 *
 * ## Two imported context modules, and each is one binding
 *
 * `ProfileModule` for `ProfileQueryHandler` and `MemberContextPort`,
 * `OperationsModule` for `SettingsService` and the shared Mongoose connection.
 * Nothing under `domain/` or `features/` here imports either: the cut-off comes
 * through `NextPracticeCutoffPort`, bound in this context's own
 * `infrastructure/`, and the zone through the shared `MemberContextPort`. That
 * is the seam constitution IX sanctions, and `no-restricted-imports` refuses it
 * anywhere else — `training` was added to that rule's pattern list in this
 * phase, and the rule was probed by writing a file that should fail and
 * watching it do so.
 *
 * ## Nothing here imports Rhythm, Meetings or Conversations
 *
 * All three now depend on Training — the rhythm's proposal, the calendar's
 * agenda and the chat's `set_slots` — and every one of those edges points
 * *inwards*. So there is no cycle and **no `forwardRef`**, unlike the genuine
 * Rhythm↔Conversations pair. If a future phase makes Training read one of them,
 * that is a new cycle and worth questioning before it is wrapped.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.athleteProfile, schema: AthleteProfileSchema },
      { name: MODEL_NAMES.session, schema: SessionSchema },
      { name: MODEL_NAMES.program, schema: ProgramSchema },
      { name: MODEL_NAMES.workout, schema: WorkoutSchema },
    ]),
  ],
  providers: [
    {
      provide: AthleteProfileRepository,
      inject: [
        getModelToken(MODEL_NAMES.athleteProfile),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (
        model: Model<AthleteProfileDoc>,
        outbox: Model<OutboxInsert>,
      ) => new MongoAthleteProfileRepository(model, outbox),
    },
    {
      provide: SessionRepository,
      inject: [
        getModelToken(MODEL_NAMES.session),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<SessionDoc>, outbox: Model<OutboxInsert>) =>
        new MongoSessionRepository(model, outbox),
    },
    {
      provide: ProgramRepository,
      inject: [
        getModelToken(MODEL_NAMES.program),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<ProgramDoc>, outbox: Model<OutboxInsert>) =>
        new MongoProgramRepository(model, outbox),
    },
    {
      provide: WorkoutRepository,
      inject: [
        getModelToken(MODEL_NAMES.workout),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<WorkoutDoc>, outbox: Model<OutboxInsert>) =>
        new MongoWorkoutRepository(model, outbox),
    },

    /*
     * The member's own cut-off, from Profile's published read.
     *
     * A port rather than `SettingsService.get('defaults.nextPracticeCutoff')`,
     * which would be the constitution XII bug in as many words: that key seeds
     * a `user_preferences` field, so reading the registry gives the
     * *installation* value and the card silently ignores what the member set.
     * The two agree for anybody who has not changed it, which is exactly what
     * makes the bug invisible — this is the third time the project has had this
     * decision in front of it.
     */
    { provide: NextPracticeCutoffPort, useClass: ProfileNextPracticeCutoff },

    {
      /*
       * Ids for the exercises the materialiser copies out of a program
       * template. A token rather than a call inside the saga, because a spec
       * has to be able to substitute a counter — the same reason
       * `notifications.module.ts` provides `ALERT_ID`.
       */
      provide: 'EXERCISE_ID',
      useValue: newId satisfies ExerciseIdFactory,
    },
    {
      provide: SessionMaterialiserSaga,
      inject: [
        UnitOfWork,
        AthleteProfileRepository,
        SessionRepository,
        ProgramRepository,
        MemberContextPort,
        SettingsService,
        HeartbeatService,
        'EXERCISE_ID',
      ],
      useFactory: (
        uow: UnitOfWork,
        profiles: AthleteProfileRepository,
        sessions: SessionRepository,
        programs: ProgramRepository,
        member: MemberContextPort,
        settings: SettingsService,
        heartbeats: HeartbeatService,
        nextId: ExerciseIdFactory,
      ) =>
        new SessionMaterialiserSaga(
          uow,
          profiles,
          sessions,
          programs,
          member,
          settings,
          heartbeats,
          nextId,
        ),
    },

    // Every handler takes its dependencies by class token, so Nest builds them
    // without a factory. Listed rather than glob-imported so a slice added
    // without being provided fails at boot instead of at the first request.
    ChooseSportsHandler,
    SetSlotsHandler,
    BootstrapAthleteProfileHandler,
    CreateSessionHandler,
    UpdateSessionHandler,
    LogSessionHandler,
    CompleteSessionHandler,
    CancelSessionHandler,
    SkipSessionHandler,
    ReopenSessionHandler,
    DeleteSessionHandler,
    RestoreSessionHandler,
    PurgeSessionHandler,
    CreateProgramHandler,
    UpdateProgramHandler,
    ApplyProgramHandler,
    ArchiveProgramHandler,
    ActivateProgramHandler,
    DeleteProgramHandler,
    RestoreProgramHandler,
    PurgeProgramHandler,
    CreateWorkoutHandler,
    UpdateWorkoutHandler,
    DeleteWorkoutHandler,
    RestoreWorkoutHandler,
    PurgeWorkoutHandler,
    ApplyWorkoutToSessionHandler,
    TrainingPurgeOnDeletedHandler,
    PurgeTrainingTombstonesHandler,

    NextPracticeQueryHandler,
    SessionsQueryHandler,
    SessionQueryHandler,
    SessionsInRangeQueryHandler,
    AthleteProfileQueryHandler,
    ProgramsQueryHandler,
    ProgramQueryHandler,
    WorkoutsQueryHandler,
    TrainingSummaryQueryHandler,

    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    AthleteProfileRepository,
    SessionRepository,
    ProgramRepository,
    WorkoutRepository,

    /*
     * The published read surface, and it has more callers than any other
     * context's — which is the point of the phase.
     *
     * `SessionsInRangeQueryHandler` answers the two ports that have been held
     * open by null-returning stubs since P3 and P5: Rhythm's `NextSessionPort`
     * (through its day-shaped `onDate`) and Meetings' `TrainingSessionsPort`
     * (through `between`). `TrainingSummaryQueryHandler` feeds the coach
     * prompt. All three are reached through a port bound in the *consumer's*
     * `infrastructure/`, which is why what is exported is a query handler and
     * never a repository — the repositories are exported for this context's own
     * sync adapters, assembled in `sync.module.ts`, and no other context should
     * inject them.
     */
    SessionsInRangeQueryHandler,
    NextPracticeQueryHandler,
    SessionsQueryHandler,
    SessionQueryHandler,
    AthleteProfileQueryHandler,
    ProgramsQueryHandler,
    ProgramQueryHandler,
    WorkoutsQueryHandler,
    TrainingSummaryQueryHandler,

    /*
     * Every command handler, because the four controllers are declared by
     * `AppModule` and Nest resolves a controller's dependencies from the module
     * that declares it. The failure mode is an `UnknownDependenciesException` at
     * boot that no typecheck sees, and `app.module.spec.ts` resolving the whole
     * graph in both roles is what turns it into a red test. `SetSlotsHandler`,
     * `LogSessionHandler` and `CompleteSessionHandler` are additionally the
     * chat's `set_slots` and `log_session`, bound through a port in
     * Conversations' `infrastructure/`.
     */
    ChooseSportsHandler,
    SetSlotsHandler,
    CreateSessionHandler,
    UpdateSessionHandler,
    LogSessionHandler,
    CompleteSessionHandler,
    CancelSessionHandler,
    SkipSessionHandler,
    ReopenSessionHandler,
    DeleteSessionHandler,
    RestoreSessionHandler,
    PurgeSessionHandler,
    CreateProgramHandler,
    UpdateProgramHandler,
    ApplyProgramHandler,
    ArchiveProgramHandler,
    ActivateProgramHandler,
    DeleteProgramHandler,
    RestoreProgramHandler,
    PurgeProgramHandler,
    CreateWorkoutHandler,
    UpdateWorkoutHandler,
    DeleteWorkoutHandler,
    RestoreWorkoutHandler,
    PurgeWorkoutHandler,
    ApplyWorkoutToSessionHandler,

    // For the relay's dispatch table and the nightly sweep.
    SessionMaterialiserSaga,
    BootstrapAthleteProfileHandler,
    TrainingPurgeOnDeletedHandler,
    PurgeTrainingTombstonesHandler,
  ],
})
export class TrainingModule {}
