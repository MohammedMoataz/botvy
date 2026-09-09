import { Module } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { OutboxInsert } from '../persistence/mongo/mongo-repository.base.js';
import { MODEL_NAMES, OutboxSchema, RelayStateSchema } from '../persistence/mongo/schemas.js';
import { OutboxWriter } from './outbox-writer.js';

/**
 * The outbox collection and its writer, for both roles. The relay that reads
 * it is the worker's alone and lives in RelayModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MODEL_NAMES.outbox, schema: OutboxSchema },
      { name: MODEL_NAMES.relayState, schema: RelayStateSchema },
    ]),
  ],
  providers: [
    {
      provide: OutboxWriter,
      inject: [getModelToken(MODEL_NAMES.outbox)],
      useFactory: (outbox: Model<OutboxInsert>) => new OutboxWriter(outbox),
    },
  ],
  exports: [OutboxWriter, MongooseModule],
})
export class OutboxModule {}
