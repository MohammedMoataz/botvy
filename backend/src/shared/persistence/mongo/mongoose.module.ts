import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { MongoUnitOfWork } from './mongo-unit-of-work.js';

/**
 * The Mongo connection, and the unit of work every non-Identity context runs
 * inside.
 *
 * The URL decides how the driver connects, and nothing here overrides it. The
 * local single-node replica set needs `directConnection=true` — without it the
 * driver discovers the set's advertised host name, which inside compose is the
 * container's own name and is not resolvable from wherever the client happens
 * to be — and `.env.example`'s local URL carries it in the query string. A
 * hosted cluster's `mongodb+srv://` URL must *not* carry it: the driver refuses
 * the pair outright (`MongoParseError`), which is why the flag used to be
 * hard-coded here was the one line that made Atlas unreachable. The set itself
 * is not optional — transactions and change streams both require one, and the
 * outbox needs both.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        uri: env.MONGO_URL,
        // A command that cannot reach the server should fail the request, not
        // hang it: a queued command holds the caller's connection open with no
        // way to tell it anything is wrong.
        serverSelectionTimeoutMS: 5_000,
        bufferCommands: false,
        autoIndex: false, // migrate-mongo owns indexes; see constitution IV.
        // Generation mode has no store to reach; defer the connection so the
        // module still initialises and the contracts can be written.
        lazyConnection: Boolean(env.BOTVY_GEN),
      }),
    }),
  ],
  providers: [MongoUnitOfWork],
  exports: [MongooseModule, MongoUnitOfWork],
})
export class MongoPersistenceModule {}
