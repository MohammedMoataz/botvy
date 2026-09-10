import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { OutboxModule } from '../../shared/outbox/outbox.module.js';
import type { OutboxInsert } from '../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../shared/persistence/mongo/mongo-unit-of-work.js';
import {
  ConversationSchema,
  CounterSchema,
  MODEL_NAMES,
  MessageSchema,
} from '../../shared/persistence/mongo/schemas.js';
import { UnitOfWork } from '../../shared/persistence/ports/unit-of-work.js';
import { NudgeService } from '../../ws/nudge.service.js';
import { WsModule } from '../../ws/ws.module.js';
import {
  ConversationRepository,
  MessageRepository,
  SeqPort,
} from './domain/conversations.repositories.js';
import {
  AppendMessageHandler,
  MESSAGE_ID,
  type MessageIdFactory,
} from './features/append-message/append-message.handler.js';
import { ConversationsBootstrapHandler } from './features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { ConversationsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import {
  MongoConversationRepository,
  MongoMessageRepository,
  newMessageId,
  type ConversationDoc,
  type MessageDoc,
} from './infrastructure/mongo-conversations.repositories.js';
import {
  MongoSeq,
  type CounterDoc,
} from './infrastructure/mongo-seq.adapter.js';

/**
 * Conversations: where a message is written down.
 *
 * Providers only, like `RemindersModule` — no controller and no resolver. In
 * this phase nothing outside the platform talks to this context: the writes
 * come from the rhythm's tick, which runs in the worker, and the reads arrive
 * in P4 with the chat surface. A module that exported an HTTP surface now would
 * be exporting one the worker also has to carry.
 *
 * Which is why `WsModule` being here is worth a note. It is the backend role's
 * module — the worker has no socket server — and `NudgeService.emit` is a no-op
 * with none attached, by design: a heartbeat from inside the worker is not a
 * failed nudge, it is a nudge nobody was watching for. So a touch written by
 * the worker reaches the member's devices on their next pull rather than on the
 * socket, which is the same guarantee every other row in this product has.
 *
 * Three models rather than two, because the counter is a collection of this
 * context's own: `counters` holds `"<userId>:messages"` and nothing else reads
 * it.
 */
@Module({
  imports: [
    OutboxModule,
    WsModule,
    MongooseModule.forFeature([
      { name: MODEL_NAMES.conversation, schema: ConversationSchema },
      { name: MODEL_NAMES.message, schema: MessageSchema },
      { name: MODEL_NAMES.counter, schema: CounterSchema },
    ]),
  ],
  providers: [
    {
      provide: ConversationRepository,
      inject: [
        getModelToken(MODEL_NAMES.conversation),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (
        model: Model<ConversationDoc>,
        outbox: Model<OutboxInsert>,
      ) => new MongoConversationRepository(model, outbox),
    },
    {
      provide: MessageRepository,
      inject: [
        getModelToken(MODEL_NAMES.message),
        getModelToken(MODEL_NAMES.outbox),
      ],
      useFactory: (model: Model<MessageDoc>, outbox: Model<OutboxInsert>) =>
        new MongoMessageRepository(model, outbox),
    },
    {
      provide: SeqPort,
      inject: [getModelToken(MODEL_NAMES.counter)],
      useFactory: (model: Model<CounterDoc>) => new MongoSeq(model),
    },
    {
      // Server-minted ObjectIds, so a token rather than a call inside the
      // handler: the in-memory adapter mints its own sortable ids and a spec
      // has to be able to substitute them.
      provide: MESSAGE_ID,
      useValue: newMessageId satisfies MessageIdFactory,
    },
    {
      /*
       * Every dependency named explicitly, and none of them inferred.
       *
       * `MessageIdFactory` is a type alias for a function — it emits no runtime
       * token at all — so a constructor parameter typed with it resolves to
       * `undefined` and Nest fails at boot with `UnknownDependenciesException`
       * rather than at build. The abstract-class ports above would in fact
       * reflect, but the factory is written out in full for all six so that the
       * list of what this handler needs is readable in one place.
       */
      provide: AppendMessageHandler,
      inject: [
        UnitOfWork,
        ConversationRepository,
        MessageRepository,
        SeqPort,
        NudgeService,
        MESSAGE_ID,
      ],
      useFactory: (
        uow: UnitOfWork,
        conversations: ConversationRepository,
        messages: MessageRepository,
        seq: SeqPort,
        nudges: NudgeService,
        nextId: MessageIdFactory,
      ) =>
        new AppendMessageHandler(
          uow,
          conversations,
          messages,
          seq,
          nudges,
          nextId,
        ),
    },
    ConversationsBootstrapHandler,
    ConversationsPurgeOnDeletedHandler,
    MongoUnitOfWork,
    { provide: UnitOfWork, useExisting: MongoUnitOfWork },
  ],
  exports: [
    ConversationsBootstrapHandler,
    ConversationsPurgeOnDeletedHandler,
    AppendMessageHandler,
    ConversationRepository,
    MessageRepository,
    SeqPort,
  ],
})
export class ConversationsModule {}
