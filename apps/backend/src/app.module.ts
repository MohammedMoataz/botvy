import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from './shared/config/config.module.js';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard.js';
import { KindGuard } from './shared/auth/kind.guard.js';
import { RolesGuard } from './shared/auth/roles.guard.js';

/**
 * The backend role: the public edge.
 *
 * The three guards are registered globally and in this order. Authentication
 * decides who a caller is; the kind check decides whether that sort of caller
 * belongs on the route at all; the role check decides whether they are allowed
 * the particular thing. Registering them per-controller instead would protect
 * the controllers someone remembered, and the endpoint added in a hurry is the
 * one that ships open.
 */
@Module({
  imports: [ConfigModule, CqrsModule.forRoot()],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: KindGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
