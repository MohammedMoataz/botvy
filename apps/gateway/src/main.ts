import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Read through ConfigService, not process.env: the schema in config.module
  // is what documents and defaults these, and bypassing it is how TZ came to
  // be read from a variable nobody had validated or passed to the container.
  const config = app.get(ConfigService);

  // In production the admin SPA is served by this same gateway, so it is
  // same-origin and needs no CORS. In development it runs on Vite's own
  // port, so allow exactly the origins listed in CORS_ORIGINS (comma
  // separated) — never a wildcard, since requests carry bearer tokens.
  const corsOrigins = config
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (corsOrigins?.length) {
    app.enableCors({ origin: corsOrigins, credentials: true });
  }

  const openapi = new DocumentBuilder()
    .setTitle('Botvy Gateway')
    .setDescription('Botvy platform API — auth, chat, reminders, workflows, admin')
    .setVersion('0.4.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openapi);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.get<number>('PORT')!);
}
await bootstrap();
