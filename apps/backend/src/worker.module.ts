import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from './shared/config/config.module.js';
import { HealthzController } from './shared/health/healthz.controller.js';

/**
 * The worker role: the outbox relay, the identity forwarder and the scheduled
 * work, with no public edge.
 *
 * It carries no authentication guards because it serves exactly one route,
 * `/healthz`, to the container runtime on the Docker network. Everything else
 * it does is driven by the outbox and by n8n calling the *backend's*
 * `/internal/*` endpoints — never this process directly.
 */
@Module({
  imports: [ConfigModule, CqrsModule.forRoot()],
  controllers: [HealthzController],
})
export class WorkerModule {}
