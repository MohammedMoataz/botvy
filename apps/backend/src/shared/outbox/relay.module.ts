import { Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { IdentityOutboxRepository } from '../../contexts/identity/domain/identity-outbox.repository.js';
import { IdentityModule } from '../../contexts/identity/identity.module.js';
import { AdminPasswordFlagHandler } from '../../contexts/operations/features/admin-password-flag/admin-password-flag.handler.js';
import { BootstrapOnRegisteredHandler } from '../../contexts/profile/features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { PurgeOnDeletedHandler } from '../../contexts/profile/features/purge-on-deleted/purge-on-deleted.handler.js';
import { PlanAlertsSaga } from '../../contexts/notifications/features/plan-alerts-saga/plan-alerts.saga.js';
import { NotificationsPurgeOnDeletedHandler } from '../../contexts/notifications/features/purge-on-deleted/purge-on-deleted.handler.js';
import { PlanningPurgeOnDeletedHandler } from '../../contexts/planning/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RemindersPurgeOnDeletedHandler } from '../../contexts/reminders/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RemindersModule } from '../../contexts/reminders/reminders.module.js';
import { NudgeOnChangesHandler } from '../../contexts/sync/features/nudge-on-changes/nudge-on-changes.handler.js';
import { ConversationsBootstrapHandler } from '../../contexts/conversations/features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { ConversationsPurgeOnDeletedHandler } from '../../contexts/conversations/features/purge-on-deleted/purge-on-deleted.handler.js';
import { ConversationsModule } from '../../contexts/conversations/conversations.module.js';
import { RhythmBootstrapHandler } from '../../contexts/rhythm/features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { RhythmPreferencesChangedHandler } from '../../contexts/rhythm/features/preferences-changed/preferences-changed.handler.js';
import { MealLineChangedHandler } from '../../contexts/rhythm/features/meal-line-changed/meal-line-changed.handler.js';
import { RhythmPurgeOnDeletedHandler } from '../../contexts/rhythm/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RhythmModule } from '../../contexts/rhythm/rhythm.module.js';
import { RolloverOnEndOfDaySaga } from '../../contexts/planning/features/rollover/rollover-on-end-of-day.saga.js';
import { SyncModule } from '../../contexts/sync/sync.module.js';
import { NotificationsModule } from '../../contexts/notifications/notifications.module.js';
import { LabelSnapshotHandler } from '../../contexts/planning/features/label-snapshot/label-snapshot.handler.js';
import { PlanningModule } from '../../contexts/planning/planning.module.js';
import { OperationsModule } from '../../contexts/operations/operations.module.js';
import { ProfileModule } from '../../contexts/profile/profile.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import type { DomainEvent } from '../cqrs/domain-event.js';
import { HeartbeatService } from '../health/heartbeat.service.js';
import { RELAY_LIVENESS } from '../health/healthz.controller.js';
import { MODEL_NAMES } from '../persistence/mongo/schemas.js';
import { SettingsService } from '../settings/settings.service.js';
import { IdentityOutboxForwarder } from './identity-outbox-forwarder.js';
import {
  MongoOutboxStore,
  type OutboxDoc,
  type RelayStateDoc,
} from './mongo-outbox.store.js';
import { OutboxModule } from './outbox.module.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxWriter } from './outbox-writer.js';
import { RelayRuntime } from './relay.runtime.js';
import { HTTP_POST, WebhookFanout, type HttpPost } from './webhook-fanout.js';

export const RELAY_JOB = 'outbox.relay';

/**
 * `profile.ProfileUpdated` has more than one reaction in this table, and this
 * is the seam where a second one would be added.
 *
 * Kept as a named function rather than inlined so that adding the next
 * subscriber is an edit to one place with an obvious ordering, instead of a
 * second `case` for a name that already has one — which the language would
 * accept as a duplicate-case error only if they were literally adjacent, and
 * otherwise silently prefer the first.
 */
async function profileTimezone(
  event: DomainEvent,
  alertPlanning: { onProfileUpdated(event: DomainEvent): Promise<void> },
): Promise<void> {
  await alertPlanning.onProfileUpdated(event);
}
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
  imports: [
    OutboxModule,
    IdentityModule,
    OperationsModule,
    ProfileModule,
    PlanningModule,
    RemindersModule,
    NotificationsModule,
    ConversationsModule,
    RhythmModule,
    SyncModule,
  ],
  providers: [
    {
      provide: MongoOutboxStore,
      inject: [
        getModelToken(MODEL_NAMES.outbox),
        getModelToken(MODEL_NAMES.relayState),
      ],
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
      useFactory: (env: Env, post: HttpPost) =>
        new WebhookFanout(env.AUTOMATION_WEBHOOK_SECRET, post),
    },
    {
      provide: OutboxRelay,
      inject: [
        MongoOutboxStore,
        WebhookFanout,
        SettingsService,
        AdminPasswordFlagHandler,
        BootstrapOnRegisteredHandler,
        PurgeOnDeletedHandler,
        LabelSnapshotHandler,
        PlanAlertsSaga,
        NudgeOnChangesHandler,
        PlanningPurgeOnDeletedHandler,
        RemindersPurgeOnDeletedHandler,
        NotificationsPurgeOnDeletedHandler,
        ConversationsBootstrapHandler,
        ConversationsPurgeOnDeletedHandler,
        RhythmBootstrapHandler,
        RhythmPreferencesChangedHandler,
        MealLineChangedHandler,
        RhythmPurgeOnDeletedHandler,
        RolloverOnEndOfDaySaga,
        HeartbeatService,
      ],
      useFactory: (
        store: MongoOutboxStore,
        fanout: WebhookFanout,
        settings: SettingsService,
        passwordFlag: AdminPasswordFlagHandler,
        profileBootstrap: BootstrapOnRegisteredHandler,
        profilePurge: PurgeOnDeletedHandler,
        labelSnapshots: LabelSnapshotHandler,
        alertPlanning: PlanAlertsSaga,
        syncNudges: NudgeOnChangesHandler,
        planningPurge: PlanningPurgeOnDeletedHandler,
        remindersPurge: RemindersPurgeOnDeletedHandler,
        notificationsPurge: NotificationsPurgeOnDeletedHandler,
        conversationsBootstrap: ConversationsBootstrapHandler,
        conversationsPurge: ConversationsPurgeOnDeletedHandler,
        rhythmBootstrap: RhythmBootstrapHandler,
        rhythmPreferences: RhythmPreferencesChangedHandler,
        mealLine: MealLineChangedHandler,
        rhythmPurge: RhythmPurgeOnDeletedHandler,
        rollover: RolloverOnEndOfDaySaga,
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
          /**
           * Where a domain event reaches an in-process handler.
           *
           * An explicit table rather than `@EventsHandler` discovery, and the
           * price of that is this: a handler that is provided but not named
           * here is never called, and nothing fails — it simply does not
           * happen. `bootstrap-on-registered` and `purge-on-deleted` were both
           * in exactly that state, so every account created got no profile and
           * every deleted one left its photo on the volume.
           *
           * The `default` is deliberate: most events exist for n8n, which the
           * fanout above already handled. But adding a handler means adding a
           * case, and the spec below is what remembers that.
           */
          publish: async (event: DomainEvent) => {
            switch (event.name) {
              // Profile reacts to Identity. Two stores, so no transaction can
              // span them — the event is the only way across, and it is why
              // both handlers are idempotent on re-delivery.
              /*
               * Three contexts bootstrap from one registration, and the
               * order is the dependency: Profile writes the preferences the
               * rhythm reads, and Conversations writes the coach chat the
               * rhythm's first touch is written into. Sequential, so a
               * failure in one does not silently skip the rest and the
               * relay's own retry brings the whole event back rather than a
               * fragment of it. All three are idempotent, which is what
               * makes replaying all three after a partial failure the
               * correct recovery rather than a second problem.
               *
               * `RhythmBootstrapHandler` is last for a reason beyond
               * tidiness: it reads the member's zone and their three times
               * to decide which of today's touches to suppress, and a
               * member who registers at 23:00 gets the right answer only if
               * Profile has already written their preferences. It falls back
               * to the installation defaults if not, so the order is a
               * correctness preference and not a correctness requirement.
               */
              case 'identity.UserRegistered':
                await profileBootstrap.handle(event);
                await conversationsBootstrap.handle(event);
                await rhythmBootstrap.handle(event);
                return;
              /*
               * Four contexts hold something about a member, and all four are
               * called here — sequentially, so one failing does not silently
               * skip the rest, and the relay's own retry brings the whole
               * event back rather than a fragment of it. Every handler is
               * idempotent, which is what makes replaying all four after a
               * partial failure the correct recovery rather than a second
               * problem.
               *
               * The list growing is the point of the table. A context added in
               * P5 that forgets this line leaves a deleted member's meetings on
               * disk for ever, and nothing fails — which is E-005's whole
               * argument.
               */
              case 'identity.UserDeleted':
                await profilePurge.handle(event);
                await planningPurge.handle(event);
                await remindersPurge.handle(event);
                await notificationsPurge.handle(event);
                await rhythmPurge.handle(event);
                await conversationsPurge.handle(event);
                return;
              case 'operations.SettingChanged':
                settings.invalidate(
                  String((event.payload as { key?: string })?.key ?? ''),
                );
                return;
              // Identity raises it, Operations owns the key. The event is how
              // the two meet without either opening the other's store.
              case 'identity.PasswordChanged':
                await passwordFlag.onPasswordChanged(event);
                return;
              // Planning reacting to Planning. The boundary is not the reason
              // for the hop — the rename writes one row and returns, and the
              // several hundred tasks that show the label are caught up here in
              // one bulk write rather than inline while the member waits.
              case 'planning.LabelUpdated':
                await labelSnapshots.onUpdated(event);
                return;
              case 'planning.LabelDeleted':
                await labelSnapshots.onDeleted(event);
                return;

              // ---- the alert pipeline ------------------------------------
              //
              // Thirteen names, and every one of them is a case in this switch
              // rather than a decorator, which is the trade this table makes:
              // the whole subscription list is readable in one place, at the
              // cost of a handler being silently inert if somebody forgets a
              // row. E-005 in `enhancements/` proposes closing that half
              // without giving up the readability.
              case 'planning.TaskScheduled':
              case 'planning.TaskRescheduled':
                await alertPlanning.onTaskScheduled(event);
                return;
              case 'planning.TaskCompleted':
              case 'planning.TaskCancelled':
              case 'planning.TaskDeleted':
                await alertPlanning.onTaskClosed(event);
                return;
              case 'reminders.ReminderScheduled':
              case 'reminders.ReminderRescheduled':
              case 'reminders.ReminderSnoozed':
                await alertPlanning.onReminderScheduled(event);
                return;
              case 'reminders.ReminderCompleted':
              case 'reminders.ReminderCancelled':
              case 'reminders.ReminderDeleted':
              case 'reminders.ReminderPurged':
                await alertPlanning.onReminderClosed(event);
                return;

              // The events from outside Planning and Reminders. An alert's
              // correct instant depends on facts those contexts do not own:
              // the member's zone is Profile's, and whether they are banned or
              // have a phone at all is Identity's.
              case 'profile.ProfileUpdated':
                await profileTimezone(event, alertPlanning);
                return;
              case 'profile.PreferencesChanged':
                await alertPlanning.onPreferencesChanged(event);
                await rhythmPreferences.handle(event);
                return;
              case 'identity.UserBanned':
                await alertPlanning.onUserBanned(event);
                return;
              case 'identity.UserUnbanned':
                await alertPlanning.onUserUnbanned(event);
                return;
              case 'identity.DeviceRegistered':
              case 'identity.DeviceRemoved':
                await alertPlanning.onDevicesChanged(event);
                return;

              /*
               * ---- the rhythm's three touches --------------------------
               *
               * Each becomes one member-chosen alert, at the moment of the
               * touch, with no lead times and untouched by quiet hours — a
               * member whose quiet window covers their own 08:00 briefing
               * asked for that briefing at 08:00 (spec FR-013).
               *
               * The end-of-day summary has a second subscriber, and it is
               * the one that would have been easy to leave out: Planning
               * carries the day's unfinished tasks into the plan that was
               * just set. Planning reacting to the rhythm's event rather
               * than the rhythm dispatching a Planning command is
               * constitution IX read carefully — a handler that dispatched
               * another context's command would be the same violation
               * wearing a bus.
               */
              case 'rhythm.PlanTomorrowPrompted':
              case 'rhythm.MorningBriefingSent':
                await alertPlanning.onRhythmTouch(event);
                return;
              case 'rhythm.EndOfDaySummarySent':
                await alertPlanning.onRhythmTouch(event);
                await rollover.handle(event);
                return;

              /*
               * Nutrition raises neither of these until P8. The handler
               * lands here with the rest of the context rather than in that
               * phase, because "a capability three phases each credit to
               * another phase is a capability nobody builds" — and because
               * a member who regenerates their meals at nine in the morning
               * has already had their briefing, so the plan the Home card
               * reads has to follow.
               */
              case 'nutrition.MealPlanReady':
              case 'nutrition.MealPlanWithheld':
                await mealLine.handle(event);
                return;

              // One device pushed; the member's others are told. This is what
              // makes a task completed in the extension reach the phone in
              // seconds without either of them polling.
              case 'sync.ChangesApplied':
                await syncNudges.handle(event);
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
      inject: [
        OutboxRelay,
        IdentityOutboxForwarder,
        MongoOutboxStore,
        HeartbeatService,
      ],
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
