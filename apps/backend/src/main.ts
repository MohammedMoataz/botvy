import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { WorkerModule } from './worker.module.js';
import { corsOrigins, loadEnv } from './shared/config/env.schema.js';

/**
 * One entry point, two roles.
 *
 * `backend` serves the edge: REST commands, GraphQL queries and the socket.
 * `worker` runs the relay and the jobs and exposes nothing but `/healthz`.
 * They are the same image, so shared code cannot be at two versions at once.
 */
async function bootstrap(): Promise<void> {
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
      new DocumentBuilder().setTitle('Botvy').setVersion('2.0.0').addBearerAuth().build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`backend listening on ${env.PORT}`);
}

bootstrap().catch((error: unknown) => {
  // Nest's own logger may not exist yet if configuration failed, and a
  // configuration error that prints nothing is the worst possible start.
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
