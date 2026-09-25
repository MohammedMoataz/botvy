import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import {
  MODEL_NAMES,
  PreferencesSchema,
  ProfileSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { MemberBootstrapPort } from '../../shared/member/member-bootstrap.port.js';
import { MemberContextPort } from '../../shared/member/member-context.port.js';
import { MemberPreferencesPort } from '../../shared/member/member-preferences.port.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { OperationsModule } from '../operations/operations.module.js';
import {
  PhotoStore,
  PreferencesRepository,
  ProfileRepository,
} from './domain/profile.repository.js';
import { BootstrapOnRegisteredHandler } from './features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { ProfileQueryHandler } from './features/profile-query/profile.query.js';
import { PurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { UpdatePreferencesHandler } from './features/update-preferences/update-preferences.handler.js';
import { UpdateProfileHandler } from './features/update-profile/update-profile.handler.js';
import { StorageProvider } from '../../shared/storage/storage.provider.js';
import { StoredPhotoStore } from './infrastructure/stored-photo.store.js';
import {
  ProfileMemberBootstrap,
  ProfileMemberContext,
  ProfileMemberPreferences,
} from './infrastructure/profile-member-context.adapter.js';
import {
  MongoPreferencesRepository,
  MongoProfileRepository,
  type PreferencesDoc,
  type ProfileDoc,
} from './infrastructure/mongo-profile.repositories.js';

/**
 * Profile: the member's own facts and the knobs they may turn, on MongoDB.
 *
 * Providers only. The controller is declared by the backend role in
 * `AppModule`, so the worker can import this module for the two event handlers
 * — `bootstrap-on-registered` and `purge-on-deleted`, both of which run where
 * the relay runs — without gaining an HTTP surface it should not have.
 *
 * `OperationsModule` is imported for `SettingsService`, which is where every
 * default this context seeds a new member from comes from. That is a query
 * across a context boundary in the permitted direction: the registry is
 * Operations' own read model, exposed as a service, not a collection this
 * context opens.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.profile, schema: ProfileSchema },
      { name: MODEL_NAMES.preferences, schema: PreferencesSchema },
    ]),
  ],
  providers: [
    {
      provide: ProfileRepository,
      inject: [
        getModelToken(MODEL_NAMES.profile),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<ProfileDoc>, outbox: Model<OutboxInsert>) =>
        new MongoProfileRepository(model, outbox),
    },
    {
      provide: PreferencesRepository,
      inject: [
        getModelToken(MODEL_NAMES.preferences),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<PreferencesDoc>, outbox: Model<OutboxInsert>) =>
        new MongoPreferencesRepository(model, outbox),
    },
    {
      // The bytes live wherever the platform's storage provider puts them —
      // the media volume today, an object store when 029 binds one. This
      // adapter owns only what a photo becomes before it is kept.
      provide: PhotoStore,
      inject: [StorageProvider],
      useFactory: (storage: StorageProvider) => new StoredPhotoStore(storage),
    },
    {
      provide: BootstrapOnRegisteredHandler,
      inject: [
        UnitOfWork,
        ProfileRepository,
        PreferencesRepository,
        SettingsService,
      ],
      useFactory: (
        uow: UnitOfWork,
        profiles: ProfileRepository,
        preferences: PreferencesRepository,
        settings: SettingsService,
      ) =>
        new BootstrapOnRegisteredHandler(uow, profiles, preferences, settings),
    },
    UpdateProfileHandler,
    UpdatePreferencesHandler,
    ProfileQueryHandler,
    PurgeOnDeletedHandler,
    {
      // The one implementation of "the member's row, else the installation
      // default" (E-020). Five contexts had their own copy of those four lines
      // and its fallback; they ask this by field name now.
      provide: MemberPreferencesPort,
      inject: [PreferencesRepository, SettingsService],
      useFactory: (
        preferences: PreferencesRepository,
        settings: SettingsService,
      ) => new ProfileMemberPreferences(preferences, settings),
    },
    {
      // Profile owns the facts; the port lives in `shared/` so that Planning,
      // Reminders and Notifications can ask the scheduling questions without
      // any of them importing this context. See `member-context.port.ts`.
      provide: MemberContextPort,
      inject: [ProfileRepository, MemberPreferencesPort, SettingsService],
      useFactory: (
        profiles: ProfileRepository,
        preferences: MemberPreferencesPort,
        settings: SettingsService,
      ) => new ProfileMemberContext(profiles, preferences, settings),
    },
    {
      // "Has the relay written this member's furniture yet" (E-019). Identity's
      // auth responses carry the answer so a first-run client waits instead of
      // meeting a 404 it cannot act on; the token is in `shared/` and the
      // binding here, because Profile owns the two documents.
      provide: MemberBootstrapPort,
      inject: [ProfileRepository, PreferencesRepository],
      useFactory: (
        profiles: ProfileRepository,
        preferences: PreferencesRepository,
      ) => new ProfileMemberBootstrap(profiles, preferences),
    },
    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    ProfileRepository,
    PreferencesRepository,
    PhotoStore,
    ProfileQueryHandler,
    UpdateProfileHandler,
    UpdatePreferencesHandler,
    BootstrapOnRegisteredHandler,
    PurgeOnDeletedHandler,
    MemberContextPort,
    MemberPreferencesPort,
    MemberBootstrapPort,
  ],
})
export class ProfileModule {}

/**
 * What this context asks the outbox relay for (E-005).
 *
 * Declared here, beside the handlers themselves, and asserted against the
 * dispatch table in `shared/outbox/dispatch-table.ts` while the relay is built
 * — a name with no case in that switch fails the boot instead of being
 * silently never delivered, which is how every account once got no profile.
 */
export const PROFILE_SUBSCRIPTIONS = {
  'identity.UserRegistered': 'BootstrapOnRegisteredHandler',
  'identity.UserDeleted': 'PurgeOnDeletedHandler',
} as const;
