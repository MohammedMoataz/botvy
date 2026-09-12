import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { LlmModule } from '../../shared/llm/llm.module.js';
import { OllamaClient } from '../../shared/llm/ollama.client.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  MODEL_NAMES,
  MealSchema,
  MealSuggestionSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { TrainingModule } from '../training/training.module.js';
import {
  DayTrainingPort,
  MealDrafterPort,
  MealModePort,
  MemberFoodsPort,
} from './domain/nutrition.ports.js';
import {
  MealRepository,
  MealSuggestionRepository,
} from './domain/nutrition.repositories.js';
import {
  AddMealHandler,
  DeleteMealHandler,
  PurgeMealHandler,
  RestoreMealHandler,
  UpdateMealHandler,
} from './features/add-meal/add-meal.handler.js';
import { BuildMealLineHandler } from './features/build-meal-line/build-meal-line.handler.js';
import { MealsQueryHandler } from './features/meals/meals.query.js';
import {
  NutritionPurgeOnDeletedHandler,
  PurgeMealTombstonesHandler,
} from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { RegenerateOnProfileUpdatedHandler } from './features/regenerate-on-profile-updated/regenerate-on-profile-updated.handler.js';
import { RegenerateTodayHandler } from './features/regenerate-today/regenerate-today.handler.js';
import { ReplaceTodayMealHandler } from './features/replace-today-meal/replace-today-meal.handler.js';
import { LlmMealDrafter } from './infrastructure/llm-meal-drafter.js';
import {
  MongoMealRepository,
  MongoMealSuggestionRepository,
  type MealDoc,
  type MealSuggestionDoc,
} from './infrastructure/mongo-nutrition.repositories.js';
import {
  ProfileMealMode,
  ProfileMemberFoods,
  TrainingDayTraining,
} from './infrastructure/nutrition.adapters.js';

/**
 * Nutrition: the member's own meals, and what the day says about food.
 *
 * Providers only. The controller is declared by the backend role in
 * `AppModule`, so the worker can import this module for the profile consumer —
 * which runs where the relay runs — without gaining an HTTP surface it should
 * not have. Which is also why every command handler is exported: Nest resolves
 * a controller's dependencies from the module that *declares* it, and a handler
 * merely provided here would be an `UnknownDependenciesException` at boot that
 * no typecheck sees.
 *
 * ## Three imported context modules, and each is one binding
 *
 * `OperationsModule` for `SettingsService` and the shared Mongoose connection;
 * `ProfileModule` for the member's allergies, their likes and their meal mode;
 * `TrainingModule` for whether they train on the day. Nothing under `domain/`
 * or `features/` imports any of them — the three cross-context facts come
 * through `MemberFoodsPort`, `MealModePort` and `DayTrainingPort`, all bound in
 * this context's own `infrastructure/`. That is the seam constitution IX
 * sanctions, and `no-restricted-imports` refuses it anywhere else: `nutrition`
 * was added to that rule's pattern list in this phase, and the rule was probed
 * by writing a file that should fail and watching it do so.
 *
 * ## Nothing here imports Daily Rhythm, in either direction at build time
 *
 * The rhythm reads this context's half through its own `TodayMealsPort`, bound
 * in **its** infrastructure, and hears about every later change through
 * `nutrition.MealPlanReady` and `MealPlanWithheld`. So there is no cycle and no
 * `forwardRef` — unlike the genuine Rhythm↔Conversations pair, where the rhythm
 * composes chat copy and the chat reads the plan.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    TrainingModule,
    LlmModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.meal, schema: MealSchema },
      { name: MODEL_NAMES.mealSuggestion, schema: MealSuggestionSchema },
    ]),
  ],
  providers: [
    {
      provide: MealRepository,
      inject: [getModelToken(MODEL_NAMES.meal), getModelToken(MODEL_NAMES.outbox)],
      useFactory: (model: Model<MealDoc>, outbox: Model<OutboxInsert>) =>
        new MongoMealRepository(model, outbox),
    },
    {
      provide: MealSuggestionRepository,
      inject: [
        getModelToken(MODEL_NAMES.mealSuggestion),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (
        model: Model<MealSuggestionDoc>,
        outbox: Model<OutboxInsert>,
      ) => new MongoMealSuggestionRepository(model, outbox),
    },

    // ---- the model --------------------------------------------------------
    //
    // A factory rather than `useClass`, matching every other LLM adapter in the
    // codebase: the two collaborators are class tokens, so this one could be
    // `useClass`, and keeping the shape uniform is what stops the next adapter
    // — the one that takes `fetch` — from being written as `useClass` and
    // failing at boot with an `UnknownDependenciesException` no typecheck sees.
    {
      provide: MealDrafterPort,
      inject: [OllamaClient, SettingsService],
      useFactory: (llm: OllamaClient, settings: SettingsService) =>
        new LlmMealDrafter(llm, settings),
    },

    // ---- other contexts' facts -------------------------------------------
    { provide: MemberFoodsPort, useClass: ProfileMemberFoods },
    { provide: DayTrainingPort, useClass: TrainingDayTraining },
    { provide: MealModePort, useClass: ProfileMealMode },

    // Every handler below takes its dependencies by class token, so Nest builds
    // them without a factory. Listed rather than glob-imported so a slice added
    // without being provided fails at boot instead of at the first request.
    AddMealHandler,
    UpdateMealHandler,
    DeleteMealHandler,
    RestoreMealHandler,
    PurgeMealHandler,
    BuildMealLineHandler,
    RegenerateTodayHandler,
    ReplaceTodayMealHandler,
    RegenerateOnProfileUpdatedHandler,
    NutritionPurgeOnDeletedHandler,
    PurgeMealTombstonesHandler,
    MealsQueryHandler,

    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    MealRepository,
    MealSuggestionRepository,

    // The published read surface. What leaves this context is a `*.query.ts`
    // handler, never a repository — the repositories are exported for this
    // context's own sync adapter, assembled in `sync.module.ts`, and no other
    // context should inject them.
    MealsQueryHandler,

    // The commands the controller in `AppModule` resolves.
    AddMealHandler,
    UpdateMealHandler,
    DeleteMealHandler,
    RestoreMealHandler,
    PurgeMealHandler,
    RegenerateTodayHandler,
    ReplaceTodayMealHandler,

    // For the relay's dispatch table, the rhythm's port and the nightly sweep.
    BuildMealLineHandler,
    RegenerateOnProfileUpdatedHandler,
    NutritionPurgeOnDeletedHandler,
    PurgeMealTombstonesHandler,
  ],
})
export class NutritionModule {}
