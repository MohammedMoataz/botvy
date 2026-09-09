import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { WorkerModule } from './worker.module.js';
import { PrismaService } from './shared/persistence/prisma/prisma.service.js';
import { MODEL_NAMES } from './shared/persistence/mongo/schemas.js';

/**
 * Both roles' dependency graphs resolve.
 *
 * This spec exists because its absence let a broken graph ship. Every other
 * test in this repository hand-constructs its providers — which is the right
 * way to test a handler's behaviour, and completely blind to whether Nest can
 * assemble the application at all. `IdentityModule` injected `AuditPort`,
 * `SettingsService` and an Operations feature handler while declaring no
 * imports, and the process died at boot in both roles:
 *
 *   UnknownDependenciesException: Nest can't resolve dependencies of the
 *   IdentityBootstrap (Symbol(ENV), AdminSeedService, ServiceClientSeedService, ?)
 *
 * 416 tests passed the whole time. This one would have failed the moment the
 * dependency was added, which is the only kind of test that could have.
 *
 * It compiles rather than starts: `compile()` builds the injector and resolves
 * every provider, and `init()` would additionally run `onApplicationBootstrap`
 * — the seeds, the relay — which needs real stores. The graph is what breaks,
 * so the graph is what this checks.
 *
 * What it therefore cannot see, and did not: a driver that loads part of itself
 * only while serving. `@nestjs/apollo` resolves `@as-integrations/express5`
 * during `init()`, not during `compile()`, so a missing peer dependency passed
 * here and killed the container on boot with
 * `The "@as-integrations/express5" package is missing`. A compiling graph and a
 * serving one are two different claims; this file makes only the first one, and
 * `infra/verify.mjs` is what makes the second.
 */

/** Every environment variable `loadEnv` demands, with values it will accept. */
const ENV_FOR_BOOT: Record<string, string> = {
  DATABASE_URL: 'postgresql://botvy:secret@postgres:5432/botvy',
  MONGO_URL: 'mongodb://mongo:27017/botvy?replicaSet=rs0',
  JWT_ACCESS_SECRET: 'a-test-secret-long-enough',
  JWT_REFRESH_SECRET: 'a-test-secret-long-enough',
  INTERNAL_SERVICE_TOKEN: 'a-test-token-long-enough',
  AUTOMATION_WEBHOOK_SECRET: 'a-test-secret-long-enough',
  MEDIA_SIGNING_SECRET: 'a-test-secret-long-enough',
  ADMIN_EMAIL: 'admin',
  ADMIN_PASSWORD: 'admin',
};

/**
 * Stands in for a Mongoose model.
 *
 * The graph only needs the tokens to resolve to *something*; no query runs
 * during `compile()`. A real connection here would make this a store test.
 */
const fakeModel = () => ({ findOne: () => undefined, watch: () => undefined });

async function compileGraph(module: unknown) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(ENV_FOR_BOOT)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  // Generation mode: `PrismaService` skips `$connect` and the relay runtime
  // does not start, so nothing reaches for a store while the graph is built.
  previous.BOTVY_GEN = process.env.BOTVY_GEN;
  process.env.BOTVY_GEN = '1';

  try {
    const builder = Test.createTestingModule({
      imports: [module as never],
    })
      .overrideProvider(PrismaService)
      .useValue({ ping: async () => true, $connect: async () => undefined })
      .overrideProvider(getConnectionToken())
      // `close` because `enableShutdownHooks` is on and Mongoose's core module
    // calls it on teardown; without it every run printed a TypeError from a
    // shutdown hook, which is exactly the sort of noise that trains a reader
    // to ignore this file's output.
    .useValue({ db: undefined, close: async () => undefined });

    for (const name of Object.values(MODEL_NAMES)) {
      builder.overrideProvider(getModelToken(name)).useValue(fakeModel());
    }

    return await builder.compile();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('the application graph', () => {
  it('resolves every provider in the backend role', async () => {
    const app = await compileGraph(AppModule);

    expect(app).toBeDefined();
    await app.close();
  });

  /**
   * The worker shares the image and most of the modules, and it broke
   * separately: a `@Global()` module still has to be imported *once* to be
   * registered, and the worker never imported `AuthModule` — so `JwtSigner`
   * would have been the next failure after the four that came first.
   */
  it('resolves every provider in the worker role', async () => {
    const app = await compileGraph(WorkerModule);

    expect(app).toBeDefined();
    await app.close();
  });
});
