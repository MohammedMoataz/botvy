import { Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { IdentityOutboxRepository } from '../../contexts/identity/domain/identity-outbox.repository.js';
import { IdentityModule } from '../../contexts/identity/identity.module.js';
import { AdminPasswordFlagHandler } from '../../contexts/operations/features/admin-password-flag/admin-password-flag.handler.js';
import { BootstrapOnRegisteredHandler } from '../../contexts/profile/features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { PurgeOnDeletedHandler } from '../../contexts/profile/features/purge-on-deleted/purge-on-deleted.handler.js';
import { PingedHandler } from '../../contexts/operations/features/ping/pinged.handler.js';
import { PlanAlertsSaga } from '../../contexts/notifications/features/plan-alerts-saga/plan-alerts.saga.js';
import { NotificationsPurgeOnDeletedHandler } from '../../contexts/notifications/features/purge-on-deleted/purge-on-deleted.handler.js';
import { PlanningPurgeOnDeletedHandler } from '../../contexts/planning/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RemindersPurgeOnDeletedHandler } from '../../contexts/reminders/features/purge-on-deleted/purge-on-deleted.handler.js';
import { RemindersModule } from '../../contexts/reminders/reminders.module.js';
import { NudgeOnChangesHandler } from '../../contexts/sync/features/nudge-on-changes/nudge-on-changes.handler.js';
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
        PingedHandler,
        AdminPasswordFlagHandler,
        BootstrapOnRegisteredHandler,
        PurgeOnDeletedHandler,
        LabelSnapshotHandler,
        PlanAlertsSaga,
        NudgeOnChangesHandler,
        PlanningPurgeOnDeletedHandler,
        RemindersPurgeOnDeletedHandler,
        NotificationsPurgeOnDeletedHandler,
        HeartbeatService,
      ],
      useFactory: (
        store: MongoOutboxStore,
        fanout: WebhookFanout,
        settings: SettingsService,
        pinged: PingedHandler,
        passwordFlag: AdminPasswordFlagHandler,
        profileBootstrap: BootstrapOnRegisteredHandler,
        profilePurge: PurgeOnDeletedHandler,
        labelSnapshots: LabelSnapshotHandler,
        alertPlanning: PlanAlertsSaga,
        syncNudges: NudgeOnChangesHandler,
        planningPurge: PlanningPurgeOnDeletedHandler,
        remindersPurge: RemindersPurgeOnDeletedHandler,
        notificationsPurge: NotificationsPurgeOnDeletedHandler,
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
              case 'operations.Pinged':
                await pinged.handle(event);
                return;
              // Profile reacts to Identity. Two stores, so no transaction can
              // span them — the event is the only way across, and it is why
              // both handlers are idempotent on re-delivery.
              case 'identity.UserRegistered':
                await profileBootstrap.handle(event);
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
