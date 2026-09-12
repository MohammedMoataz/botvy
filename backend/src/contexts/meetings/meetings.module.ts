import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  CalendarEventSchema,
  MeetingSchema,
  MODEL_NAMES,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { OperationsModule } from '../operations/operations.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { SessionsInRangeQueryHandler } from '../training/features/sessions/sessions-in-range.query.js';
import { TrainingModule } from '../training/training.module.js';
import {
  MeetingDefaultsPort,
  TimedTasksPort,
  TrainingSessionsPort,
} from './domain/meetings.ports.js';
import {
  CalendarEventRepository,
  MeetingRepository,
} from './domain/meetings.repositories.js';
import { AgendaQueryHandler } from './features/agenda/agenda.query.js';
import { CancelMeetingHandler } from './features/cancel-meeting/cancel-meeting.handler.js';
import { CompleteMeetingHandler } from './features/complete-meeting/complete-meeting.handler.js';
import { CreateCalendarEventHandler } from './features/create-event/create-event.handler.js';
import { CreateMeetingHandler } from './features/create-meeting/create-meeting.handler.js';
import { DeleteCalendarEventHandler } from './features/delete-event/delete-event.handler.js';
import { DeleteMeetingHandler } from './features/delete-meeting/delete-meeting.handler.js';
import { MeetingQueryHandler } from './features/meeting/meeting.query.js';
import { MeetingOccurrencesQueryHandler } from './features/meeting-occurrences/meeting-occurrences.query.js';
import { MeetingsQueryHandler } from './features/meetings/meetings.query.js';
import { MonthOverviewQueryHandler } from './features/month-overview/month-overview.query.js';
import { MoveCalendarEventOccurrenceHandler } from './features/move-event-occurrence/move-event-occurrence.handler.js';
import { MoveMeetingOccurrenceHandler } from './features/move-occurrence/move-occurrence.handler.js';
import { PurgeCalendarEventHandler } from './features/purge-event/purge-event.handler.js';
import { PurgeMeetingHandler } from './features/purge-meeting/purge-meeting.handler.js';
import { MeetingsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { RestoreCalendarEventHandler } from './features/restore-event/restore-event.handler.js';
import { RestoreMeetingHandler } from './features/restore-meeting/restore-meeting.handler.js';
import { SkipCalendarEventOccurrenceHandler } from './features/skip-event-occurrence/skip-event-occurrence.handler.js';
import { SkipMeetingOccurrenceHandler } from './features/skip-occurrence/skip-occurrence.handler.js';
import { UpdateCalendarEventHandler } from './features/update-event/update-event.handler.js';
import { UpdateMeetingHandler } from './features/update-meeting/update-meeting.handler.js';
import {
  MongoCalendarEventRepository,
  MongoMeetingRepository,
  type CalendarEventDoc,
  type MeetingDoc,
} from './infrastructure/mongo-meetings.repositories.js';
import {
  PlanningTimedTasks,
  ProfileMeetingDefaults,
  TrainingSessions,
} from './infrastructure/meetings.adapters.js';

/**
 * Meetings & Calendar: where the member has to be, and the one screen that
 * shows a day as it actually is.
 *
 * Providers only. The two controllers are declared by the backend role in
 * `AppModule`, so the worker can import this module for its handlers — the
 * alert reconciliation runs where the relay runs, and the sweep dispatches
 * `PurgeMeetingHandler.purgeTombstones` — without gaining an HTTP surface it
 * should not have. One image, two roles.
 *
 * ## Three imported context modules, and each is one binding
 *
 * `PlanningModule` for `TasksDueQueryHandler`, `ProfileModule` for
 * `ProfileQueryHandler` and `MemberContextPort`, `OperationsModule` for
 * `SettingsService` and the shared Mongoose connection. Nothing under
 * `domain/` or `features/` here imports any of them: the agenda takes
 * `TimedTasksPort` and `TrainingSessionsPort`, the editor's default length
 * comes through `MeetingDefaultsPort`, and all three are bound in this
 * context's own `infrastructure/`. That is the seam constitution IX sanctions,
 * and `no-restricted-imports` refuses it anywhere else — `meetings` was added
 * to that rule's pattern list in this phase, and the rule was probed by writing
 * a file that should fail and watching it do so.
 *
 * ## What this module does *not* provide
 *
 * `MeetingSyncAdapter` and `CalendarEventSyncAdapter` live in this context's
 * `infrastructure/` but are constructed in `sync.module.ts`, because a
 * multi-provider token has to be assembled somewhere and the facade is the only
 * place that knows the full list. `CalendarResolver` is provided by
 * `GraphQLModule`'s `RESOLVERS` array, for the same reason and so the worker
 * gains no read edge. Both are deliberate one-line seams in a visible place
 * rather than five modules importing the facade.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    PlanningModule,
    // The agenda's fourth source, from P6. One-directional; no `forwardRef`.
    TrainingModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.meeting, schema: MeetingSchema },
      { name: MODEL_NAMES.calendarEvent, schema: CalendarEventSchema },
    ]),
  ],
  providers: [
    {
      provide: MeetingRepository,
      inject: [
        getModelToken(MODEL_NAMES.meeting),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<MeetingDoc>, outbox: Model<OutboxInsert>) =>
        new MongoMeetingRepository(model, outbox),
    },
    {
      provide: CalendarEventRepository,
      inject: [
        getModelToken(MODEL_NAMES.calendarEvent),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (
        model: Model<CalendarEventDoc>,
        outbox: Model<OutboxInsert>,
      ) => new MongoCalendarEventRepository(model, outbox),
    },

    // ---- the three outward ports, bound in this context's infrastructure ---
    { provide: TimedTasksPort, useClass: PlanningTimedTasks },
    /*
     * **P6 replaced the stub**, exactly as the comment here promised it would.
     *
     * The agenda has been asking `TrainingSessionsPort.between` since P5 and
     * getting an empty list; it now gets the member's sessions, and not one
     * line of the agenda changed. The spec that asserted the stub contributes
     * nothing rather than throwing is now three cases — the session lands
     * beside the meeting in time order, a day without one renders meeting-only,
     * and one outside the window is left out — and the "a thrower would take
     * the whole agenda down" guard survives in the middle case.
     */
    {
      provide: TrainingSessionsPort,
      inject: [SessionsInRangeQueryHandler],
      useFactory: (sessions: SessionsInRangeQueryHandler) =>
        new TrainingSessions(sessions),
    },
    { provide: MeetingDefaultsPort, useClass: ProfileMeetingDefaults },

    // Every handler takes its dependencies by class token, so Nest builds them
    // without a factory. They are listed rather than glob-imported so a slice
    // added without being provided fails at boot instead of at the first
    // request.
    CreateMeetingHandler,
    UpdateMeetingHandler,
    SkipMeetingOccurrenceHandler,
    MoveMeetingOccurrenceHandler,
    CompleteMeetingHandler,
    CancelMeetingHandler,
    DeleteMeetingHandler,
    RestoreMeetingHandler,
    PurgeMeetingHandler,
    MeetingsPurgeOnDeletedHandler,
    CreateCalendarEventHandler,
    UpdateCalendarEventHandler,
    SkipCalendarEventOccurrenceHandler,
    MoveCalendarEventOccurrenceHandler,
    DeleteCalendarEventHandler,
    RestoreCalendarEventHandler,
    PurgeCalendarEventHandler,

    MeetingQueryHandler,
    MeetingsQueryHandler,
    MeetingOccurrencesQueryHandler,
    AgendaQueryHandler,
    MonthOverviewQueryHandler,

    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    MeetingRepository,
    CalendarEventRepository,
    /*
     * The published read surface.
     *
     * `MeetingOccurrencesQueryHandler` is exported because two other contexts
     * ask this one where an occurrence falls: Notifications' alert saga, which
     * owns `alerts` and may not read `meetings`, and P3's rhythm, whose evening
     * proposal and morning briefing name the day's meetings. Both reach it
     * through a port bound in *their* `infrastructure/`, which is why the
     * export is a query handler and not a repository — the repository is
     * exported for this context's own sync adapters, assembled in
     * `sync.module.ts`, and no other context should inject it.
     */
    MeetingOccurrencesQueryHandler,
    MeetingQueryHandler,
    MeetingsQueryHandler,
    AgendaQueryHandler,
    MonthOverviewQueryHandler,
    /*
     * Every command handler, because the two controllers are declared by
     * `AppModule` and Nest resolves a controller's dependencies from the module
     * that declares it.
     *
     * That is the price of keeping the routes out of this module so the worker
     * can import it without gaining an HTTP surface — and it is worth naming,
     * because the failure mode is a boot-time `UnknownDependenciesException`
     * that no typecheck sees. `app.module.spec.ts` resolves the whole graph in
     * both roles, so a handler provided and not exported fails there rather
     * than in production. `CreateMeetingHandler` is also the chat's
     * `set_meeting`, bound through a port in Conversations' `infrastructure/`.
     */
    CreateMeetingHandler,
    UpdateMeetingHandler,
    SkipMeetingOccurrenceHandler,
    MoveMeetingOccurrenceHandler,
    CompleteMeetingHandler,
    CancelMeetingHandler,
    DeleteMeetingHandler,
    RestoreMeetingHandler,
    CreateCalendarEventHandler,
    UpdateCalendarEventHandler,
    SkipCalendarEventOccurrenceHandler,
    MoveCalendarEventOccurrenceHandler,
    DeleteCalendarEventHandler,
    RestoreCalendarEventHandler,
    PurgeCalendarEventHandler,
    // For the relay's dispatch table and the sweep's tombstone horizon.
    MeetingsPurgeOnDeletedHandler,
    PurgeMeetingHandler,
  ],
})
export class MeetingsModule {}
