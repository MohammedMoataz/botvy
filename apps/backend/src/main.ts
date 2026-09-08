import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { WorkerModule } from './worker.module.js';
import { writeContracts } from './contracts.generate.js';
import { corsOrigins, loadEnv } from './shared/config/env.schema.js';

/**
 * One entry point, two roles.
 *
 * `backend` serves the edge: REST commands, GraphQL queries and the socket.
 * `worker` runs the relay and the jobs and exposes nothing but `/healthz`.
 * They are the same image, so shared code cannot be at two versions at once.
 */
async function bootstrap(): Promise<void> {
  // Generation mode writes the contract artefacts and exits. It runs in CI and
  // on a developer's machine, neither of which has a database — and it does not
  // need one, because the documents come from the application's own metadata
  // rather than from data. So it fills the environment it will not use rather
  // than demanding a real one.
  if (process.env.BOTVY_GEN) {
    await generateContracts();
    return;
  }

  const env = loadEnv();
  const logger = new Logger('bootstrap');

  if (env.BOTVY_ROLE === 'worker') {
    const worker = await NestFactory.create(WorkerModule, { bufferLogs: true });
    worker.enableShutdownHooks();
    await worker.listen(env.WORKER_PORT, '0.0.0.0');
    logger.log(`worker listening on ${env.WORKER_PORT} (health only)`);
    return;
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet({ contentSecurityPolicy: false }));

  const origins = corsOrigins(env);
  app.enableCors({
    // An empty list means same-origin only, which is what running behind the
    // edge gives you. It is never widened to a wildcard: credentials ride on
    // these requests.
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // A field nobody declared is a client and a server disagreeing about the
      // contract, and the disagreement should surface now rather than as a
      // silently ignored value.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (env.NODE_ENV !== 'production') {
    // Mounted openly in development, and behind the admin role in production —
    // the shape of every endpoint should not be a public document on a
    // tunnelled host.
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Botvy')
        .setVersion('2.0.0')
        .addBearerAuth()
        .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Service-Token' }, 'service-token')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`backend listening on ${env.PORT}`);
}

/**
 * Writes `openapi.json`, `schema.graphql` and the event schemas.
 *
 * The API document is built from the running application's decorators, which is
 * the point: a second tool that reconstructed it would be another place for the
 * domain to live, and v1 taught what happens when the domain lives in three
 * places at once.
 */
async function generateContracts(): Promise<void> {
  // Plain output, not a Nest logger: the application is created with logging
  // disabled so generation is quiet, and a logger that prints nothing is worse
  // than none at all when this runs in CI.
  // Placeholders for the boot-time validation. Nothing here connects.
  for (const [key, value] of Object.entries({
    DATABASE_URL: 'postgresql://gen:gen@localhost:5432/gen',
    MONGO_URL: 'mongodb://localhost:27017/gen',
    JWT_ACCESS_SECRET: 'generation-placeholder-secret',
    JWT_REFRESH_SECRET: 'generation-placeholder-secret',
    INTERNAL_SERVICE_TOKEN: 'generation-placeholder-secret',
    AUTOMATION_WEBHOOK_SECRET: 'generation-placeholder-secret',
    MEDIA_SIGNING_SECRET: 'generation-placeholder-secret',
    ADMIN_EMAIL: 'gen@example.test',
    ADMIN_PASSWORD: 'generation',
  })) {
    process.env[key] ??= value;
  }

  // Errors and warnings only — quiet enough for CI, but not silent. Nest exits
  // the process itself when a module fails to initialise, so `logger: false`
  // here turns a real failure into an exit code with no explanation at all.
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Botvy')
      .setDescription('Commands are REST; reads are GraphQL; the live connection is a socket.')
      .setVersion('2.0.0')
      .addBearerAuth()
      // Machine routes carry a header, not a bearer token. Declaring only the
      // bearer scheme left the two /internal operations published as though
      // anyone could call them, and the contracts package is what the other
      // three surfaces generate their clients from.
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Service-Token' }, 'service-token')
      .build(),
  );

  // The GraphQL schema is written by the module's own autoSchemaFile once
  // resolvers exist; until then the event contracts are what P0 has to publish.
  const written = await writeContracts(document, null);
  await app.close();

  console.log(`wrote ${written.length} contract artefacts:`);
  for (const file of written) console.log(`  ${file}`);
}

bootstrap().catch((error: unknown) => {
  // Nest's own logger may not exist yet if configuration failed, and a start-up
  // failure that prints nothing is the worst possible one to debug. The stack
  // goes out too: a message alone was not enough to find where this came from.
  if (error instanceof Error) {
    console.error(error.stack ?? error.message ?? String(error));
  } else {
    console.error(error);
  }
  // Not `process.exit(1)`. When stdout is a pipe — which it is under any CI
  // runner, and under pnpm — that call discards whatever has not yet flushed,
  // so the message above is written and then thrown away. Setting the code lets
  // Node exit on its own once the write has landed. This cost an hour of
  // debugging a start-up failure that printed nothing at all.
  process.exitCode = 1;
});
