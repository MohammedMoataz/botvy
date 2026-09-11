import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AuditPort } from '../../shared/audit/audit.port.js';
import { ENV } from '../../shared/config/config.module.js';
import type { Env } from '../../shared/config/env.schema.js';
import { newId } from '../../shared/cqrs/ids.js';
import { HeartbeatService } from '../../shared/health/heartbeat.service.js';
import { LlmModule } from '../../shared/llm/llm.module.js';
import { OllamaClient } from '../../shared/llm/ollama.client.js';
import { MemberContextPort } from '../../shared/member/member-context.port.js';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  KnowledgeDocSchema,
  LinkSchema,
  MODEL_NAMES,
  SuggestionSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import {
  AiSuggestionsPort,
  CONTENT_EXTRACTORS,
  ContentExtractor,
  KnowledgeTranscriptPort,
  SOURCE_FETCHERS,
  SourceFetcher,
  SuggestionDrafterPort,
  SummariserPort,
} from './domain/knowledge.ports.js';
import {
  LinkRepository,
  ReadingRepository,
  SuggestionRepository,
} from './domain/knowledge.repositories.js';
import { AddLinkHandler } from './features/add-link/add-link.handler.js';
import {
  AcceptSuggestionHandler,
  DismissSuggestionHandler,
  RecordSuggestionOutcomeHandler,
} from './features/accept-suggestion/accept-suggestion.handler.js';
import { AdminClearLinkHandler } from './features/admin-clear-link/admin-clear-link.handler.js';
import { ExpandPlaylistHandler } from './features/expand-playlist/expand-playlist.handler.js';
import { GenerateSuggestionSaga } from './features/generate-suggestion/generate-suggestion.saga.js';
import { IngestLinkSaga } from './features/ingest-link/ingest-link.saga.js';
import { LinksQueryHandler } from './features/links/links.query.js';
import {
  KnowledgePurgeOnDeletedHandler,
  PurgeKnowledgeTombstonesHandler,
} from './features/purge-on-deleted/purge-on-deleted.handler.js';
import {
  PurgeLinkHandler,
  RemoveLinkHandler,
  RestoreLinkHandler,
} from './features/remove-link/remove-link.handler.js';
import { RetryLinkHandler } from './features/retry-link/retry-link.handler.js';
import { SuggestionsQueryHandler } from './features/suggestions/suggestions.query.js';
import { HttpSourceFetcher } from './infrastructure/http-source-fetcher.js';
import {
  ConversationsKnowledgeTranscript,
  ProfileAiSuggestions,
} from './infrastructure/knowledge.adapters.js';
import { LlmSuggestionDrafter } from './infrastructure/llm-suggestion-drafter.js';
import { LlmSummariser } from './infrastructure/llm-summariser.js';
import {
  MongoLinkRepository,
  MongoReadingRepository,
  MongoSuggestionRepository,
  newServerId,
  type LinkDoc,
  type ReadingDoc,
  type SuggestionDoc,
} from './infrastructure/mongo-knowledge.repositories.js';
import { ReadabilityExtractor } from './infrastructure/readability-extractor.js';
import {
  YoutubeExtractor,
  YoutubeSourceFetcher,
} from './infrastructure/youtube-source.js';

/**
 * Knowledge: what the member saved to read, and what came of it.
 *
 * Providers only. The four controllers are declared by the backend role in
 * `AppModule`, so the worker can import this module for the pipeline — which
 * runs where the relay runs — without gaining an HTTP surface it should not
 * have.
 *
 * ## Three imported context modules, and each is one binding
 *
 * `OperationsModule` for `SettingsService`, the audit trail and the shared
 * Mongoose connection; `ProfileModule` for the member's zone and their
 * `aiSuggestions` preference; `ConversationsModule` for the coach message that
 * is the plain-reply fallback. Nothing under `domain/` or `features/` here
 * imports any of them: the preference comes through `AiSuggestionsPort` and the
 * chat through `KnowledgeTranscriptPort`, both bound in this context's own
 * `infrastructure/`. That is the seam constitution IX sanctions, and
 * `no-restricted-imports` refuses it anywhere else — `knowledge` was added to
 * that rule's pattern list in this phase, and the rule was probed by writing a
 * file that should fail and watching it do so.
 *
 * ## Nothing here imports Training
 *
 * The suggestion saga reacts to `training.SessionScheduled` and reads
 * everything it needs from the payload; the accepted draft goes back as
 * `knowledge.SuggestionAccepted`, which **Training's** own handler consumes.
 * Both directions are events, so the two contexts never see each other's types
 * and there is no `forwardRef` — unlike the genuine Rhythm↔Conversations pair.
 *
 * ## The two capability lists
 *
 * `SOURCE_FETCHERS` and `CONTENT_EXTRACTORS` are assembled here because a
 * multi-provider token has to be assembled somewhere, and this is the module
 * that knows the full set. Adding a source type — a PDF, a podcast feed — is a
 * new adapter and one entry in each list, with no change to the pipeline.
 */
@Module({
  imports: [
    OutboxModule,
    OperationsModule,
    ProfileModule,
    ConversationsModule,
    LlmModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.link, schema: LinkSchema },
      { name: MODEL_NAMES.knowledgeDoc, schema: KnowledgeDocSchema },
      { name: MODEL_NAMES.suggestion, schema: SuggestionSchema },
    ]),
  ],
  providers: [
    {
      provide: LinkRepository,
      inject: [getModelToken(MODEL_NAMES.link), getModelToken(MODEL_NAMES.outbox)],
      useFactory: (model: Model<LinkDoc>, outbox: Model<OutboxInsert>) =>
        new MongoLinkRepository(model, outbox),
    },
    {
      provide: ReadingRepository,
      inject: [
        getModelToken(MODEL_NAMES.knowledgeDoc),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<ReadingDoc>, outbox: Model<OutboxInsert>) =>
        new MongoReadingRepository(model, outbox),
    },
    {
      provide: SuggestionRepository,
      inject: [
        getModelToken(MODEL_NAMES.suggestion),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<SuggestionDoc>, outbox: Model<OutboxInsert>) =>
        new MongoSuggestionRepository(model, outbox),
    },

    // ---- acquisition ------------------------------------------------------
    //
    // Both fetchers are built by a factory rather than by `useClass`, because
    // each takes a collaborator Nest cannot resolve from its type: the HTTP one
    // takes `fetch` and the YouTube one takes a session factory. A parameter
    // typed `typeof fetch` emits `Function` as its design type, so a default
    // value does not save it — the failure would be an
    // `UnknownDependenciesException` at boot that no typecheck sees, which is
    // the class of defect `app.module.spec.ts` exists to turn red.
    { provide: HttpSourceFetcher, useFactory: () => new HttpSourceFetcher() },
    { provide: YoutubeSourceFetcher, useFactory: () => new YoutubeSourceFetcher() },
    ReadabilityExtractor,
    YoutubeExtractor,
    {
      provide: SOURCE_FETCHERS,
      inject: [HttpSourceFetcher, YoutubeSourceFetcher],
      useFactory: (...fetchers: SourceFetcher[]) => fetchers,
    },
    {
      provide: CONTENT_EXTRACTORS,
      inject: [ReadabilityExtractor, YoutubeExtractor],
      useFactory: (...extractors: ContentExtractor[]) => extractors,
    },

    // ---- the model --------------------------------------------------------
    {
      provide: SummariserPort,
      inject: [OllamaClient, SettingsService],
      useFactory: (llm: OllamaClient, settings: SettingsService) =>
        new LlmSummariser(llm, settings),
    },
    {
      provide: SuggestionDrafterPort,
      inject: [OllamaClient, SettingsService],
      useFactory: (llm: OllamaClient, settings: SettingsService) =>
        new LlmSuggestionDrafter(llm, settings),
    },

    // ---- other contexts' facts -------------------------------------------
    { provide: AiSuggestionsPort, useClass: ProfileAiSuggestions },
    { provide: KnowledgeTranscriptPort, useClass: ConversationsKnowledgeTranscript },

    // ---- ids --------------------------------------------------------------
    //
    // Two factories, and they mint different kinds on purpose. A **link** is
    // something the phone can create offline, so its id is a client-minted
    // UUIDv7 and the server mints one only for a playlist's children. A
    // **document** and a **suggestion** are server-only, so they get ObjectIds —
    // the rule CLAUDE.md states and `newAlertId` already follows.
    { provide: 'LINK_ID', useValue: newId },
    { provide: 'SERVER_ID', useValue: newServerId },

    {
      provide: ExpandPlaylistHandler,
      inject: [UnitOfWork, LinkRepository, 'LINK_ID'],
      useFactory: (
        uow: UnitOfWork,
        links: LinkRepository,
        nextId: () => string,
      ) => new ExpandPlaylistHandler(uow, links, nextId),
    },
    {
      provide: IngestLinkSaga,
      inject: [
        UnitOfWork,
        LinkRepository,
        ReadingRepository,
        SOURCE_FETCHERS,
        CONTENT_EXTRACTORS,
        SummariserPort,
        ExpandPlaylistHandler,
        SettingsService,
        HeartbeatService,
        'SERVER_ID',
      ],
      useFactory: (
        uow: UnitOfWork,
        links: LinkRepository,
        readings: ReadingRepository,
        fetchers: SourceFetcher[],
        extractors: ContentExtractor[],
        summariser: SummariserPort,
        playlists: ExpandPlaylistHandler,
        settings: SettingsService,
        heartbeats: HeartbeatService,
        nextId: () => string,
      ) =>
        new IngestLinkSaga(
          uow,
          links,
          readings,
          fetchers,
          extractors,
          summariser,
          playlists,
          settings,
          heartbeats,
          nextId,
        ),
    },
    {
      provide: GenerateSuggestionSaga,
      inject: [
        UnitOfWork,
        LinkRepository,
        ReadingRepository,
        SuggestionRepository,
        AiSuggestionsPort,
        SuggestionDrafterPort,
        KnowledgeTranscriptPort,
        MemberContextPort,
        'SERVER_ID',
      ],
      useFactory: (
        uow: UnitOfWork,
        links: LinkRepository,
        readings: ReadingRepository,
        suggestions: SuggestionRepository,
        preference: AiSuggestionsPort,
        drafter: SuggestionDrafterPort,
        transcript: KnowledgeTranscriptPort,
        member: MemberContextPort,
        nextId: () => string,
      ) =>
        new GenerateSuggestionSaga(
          uow,
          links,
          readings,
          suggestions,
          preference,
          drafter,
          transcript,
          member,
          nextId,
        ),
    },
    {
      provide: LinksQueryHandler,
      inject: [LinkRepository, ReadingRepository, ENV],
      useFactory: (
        links: LinkRepository,
        readings: ReadingRepository,
        env: Env,
      ) => new LinksQueryHandler(links, readings, env.MEDIA_SIGNING_SECRET),
    },
    {
      provide: AdminClearLinkHandler,
      inject: [UnitOfWork, LinkRepository, ReadingRepository, AuditPort],
      useFactory: (
        uow: UnitOfWork,
        links: LinkRepository,
        readings: ReadingRepository,
        audit: AuditPort,
      ) => new AdminClearLinkHandler(uow, links, readings, audit),
    },

    // Every handler below takes its dependencies by class token, so Nest builds
    // them without a factory. Listed rather than glob-imported so a slice added
    // without being provided fails at boot instead of at the first request.
    AddLinkHandler,
    RetryLinkHandler,
    RemoveLinkHandler,
    RestoreLinkHandler,
    PurgeLinkHandler,
    AcceptSuggestionHandler,
    DismissSuggestionHandler,
    RecordSuggestionOutcomeHandler,
    KnowledgePurgeOnDeletedHandler,
    PurgeKnowledgeTombstonesHandler,
    SuggestionsQueryHandler,

    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    LinkRepository,
    ReadingRepository,
    SuggestionRepository,

    // The published read surface. What leaves this context is a `*.query.ts`
    // handler, never a repository — the repositories are exported for this
    // context's own sync adapter, assembled in `sync.module.ts`, and no other
    // context should inject them.
    LinksQueryHandler,
    SuggestionsQueryHandler,

    // Every command handler, because the four controllers are declared by
    // `AppModule` and Nest resolves a controller's dependencies from the module
    // that declares it. The failure is an `UnknownDependenciesException` at boot
    // that no typecheck sees, and `app.module.spec.ts` resolving the whole graph
    // in both roles is what turns it into a red test instead of a red deploy.
    AddLinkHandler,
    RetryLinkHandler,
    RemoveLinkHandler,
    RestoreLinkHandler,
    PurgeLinkHandler,
    AcceptSuggestionHandler,
    DismissSuggestionHandler,
    AdminClearLinkHandler,

    // For the relay's dispatch table, the internal routes and the nightly sweep.
    IngestLinkSaga,
    GenerateSuggestionSaga,
    RecordSuggestionOutcomeHandler,
    KnowledgePurgeOnDeletedHandler,
    PurgeKnowledgeTombstonesHandler,
  ],
})
export class KnowledgeModule {}
