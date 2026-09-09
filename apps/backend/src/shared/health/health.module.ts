import { Module } from '@nestjs/common';
import { OperationsModule } from '../../contexts/operations/operations.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { OllamaClient } from '../llm/ollama.client.js';
import { HealthController } from './health.controller.js';

/**
 * `GET /health` for the backend role. The worker has its own, narrower
 * `/healthz`, because the two processes answer different questions.
 */
@Module({
  imports: [OperationsModule],
  controllers: [HealthController],
  providers: [
    {
      provide: OllamaClient,
      inject: [ENV],
      useFactory: (env: Env) => new OllamaClient(env.OLLAMA_BASE_URL),
    },
  ],
  exports: [OllamaClient],
})
export class HealthModule {}
