import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { FilesystemStorageProvider } from './filesystem-storage.provider.js';
import { StorageProvider } from './storage.provider.js';

/**
 * The one storage provider, bound once. Global for the same reason the two
 * persistence modules are: an attachment can belong to any context, and a
 * context importing a module to reach a shared port is the dependency
 * pointing backwards.
 *
 * The filesystem adapter today; phase 029 makes this factory the one place
 * that decides between it and an object store.
 */
@Global()
@Module({
  providers: [
    {
      provide: StorageProvider,
      inject: [ENV],
      useFactory: (env: Env) =>
        new FilesystemStorageProvider(env.MEDIA_DIR, env.MEDIA_SIGNING_SECRET),
    },
  ],
  exports: [StorageProvider],
})
export class StorageModule {}
