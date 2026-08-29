import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule as AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LlmModule } from './llm/llm.module.js';
import { ChatModule } from './chat/chat.module.js';
import { UsageModule } from './usage/usage.module.js';
import { HealthModule } from './health/health.module.js';
import { AdminModule } from './admin/admin.module.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The admin SPA is built separately and copied in beside dist/. Serving it
// from the gateway keeps the whole system to one public surface
// (constitution V) and removes the cross-origin setup development needs.
// A missing build must not stop the API from starting, so the module is
// only registered when the files are actually there.
const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_DIST =
  // In the image the SPA is copied to /app/admin, beside dist/. Running
  // from the workspace it lives in apps/admin/dist, so both are checked
  // and local development serves the same routes as production.
  [join(HERE, '..', 'admin'), join(HERE, '..', '..', 'admin', 'dist')].find((candidate) =>
    existsSync(join(candidate, 'index.html')),
  ) ?? '';
const adminStatic = ADMIN_DIST
  ? [
      ServeStaticModule.forRoot({
        rootPath: ADMIN_DIST,
        serveRoot: '/admin',
        // Deep links like /admin/users are client-side routes, so unmatched
        // paths under /admin fall back to index.html. API routes are
        // unaffected because they live outside /admin.
        // API routes all live outside /admin (the admin API is under
        // /api/admin), so nothing here can shadow them.
        serveStaticOptions: { fallthrough: true },
      }),
    ]
  : [];

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: config.get<number>('CHAT_RATE_LIMIT_PER_MIN')!,
          },
        ],
      }),
    }),
    PrismaModule,
    AuthModule,
    LlmModule,
    UsageModule,
    ChatModule,
    HealthModule,
    AdminModule,
    RemindersModule,
    WorkflowsModule,
    ...adminStatic,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
