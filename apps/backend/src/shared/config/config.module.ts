import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env.schema.js';

export const ENV = Symbol('ENV');

/**
 * Validates the environment once, at boot, and hands the result to everything
 * else. Global because nearly every module needs some of it, and threading a
 * config object through twelve constructors buys nothing.
 *
 * `loadEnv` throws on a bad value, which kills the process before it can serve
 * a request. That is deliberate: a process that starts with half its
 * configuration missing fails later, in a place whose error does not mention
 * the variable that caused it.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => loadEnv(),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
