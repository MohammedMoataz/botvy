import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ENV } from '../../shared/config/config.module.js';
import type { Env } from '../../shared/config/env.schema.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  MODEL_NAMES,
  PreferencesSchema,
  ProfileSchema,
} from '../../shared/persistence/mongo/schemas.js';
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
import { FilesystemPhotoStore } from './infrastructure/filesystem-photo.store.js';
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
      inject: [getModelToken(MODEL_NAMES.profile), getModelToken(MODEL_NAMES.outbox)],
      useFactory: (model: Model<ProfileDoc>, outbox: Model<OutboxInsert>) =>
        new MongoProfileRepository(model, outbox),
    },
    {
      provide: PreferencesRepository,
      inject: [getModelToken(MODEL_NAMES.preferences), getModelToken(MODEL_NAMES.outbox)],
      useFactory: (model: Model<PreferencesDoc>, outbox: Model<OutboxInsert>) =>
        new MongoPreferencesRepository(model, outbox),
    },
    {
      // The bytes live on the media volume, whose path is an environment
      // variable because it is a mount point, not a knob.
      provide: PhotoStore,
      inject: [ENV],
      useFactory: (env: Env) => new FilesystemPhotoStore(env.MEDIA_DIR),
    },
    {
      provide: BootstrapOnRegisteredHandler,
      inject: [ProfileRepository, PreferencesRepository, SettingsService],
      useFactory: (
        profiles: ProfileRepository,
        preferences: PreferencesRepository,
        settings: SettingsService,
      ) => new BootstrapOnRegisteredHandler(profiles, preferences, settings),
    },
    UpdateProfileHandler,
    UpdatePreferencesHandler,
    ProfileQueryHandler,
    PurgeOnDeletedHandler,
    MongoUnitOfWork,
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
  ],
})
export class ProfileModule {}
