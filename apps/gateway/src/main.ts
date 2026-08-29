import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // In production the admin SPA is served by this same gateway, so it is
  // same-origin and needs no CORS. In development it runs on Vite's own
  // port, so allow exactly the origins listed in CORS_ORIGINS (comma
  // separated) — never a wildcard, since requests carry bearer tokens.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  if (corsOrigins?.length) {
    app.enableCors({ origin: corsOrigins, credentials: true });
  }

  const config = new DocumentBuilder()
    .setTitle('Botvy Gateway')
    .setDescription('Botvy platform API — auth, chat, reminders, workflows, admin')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 8080);
}
await bootstrap();
