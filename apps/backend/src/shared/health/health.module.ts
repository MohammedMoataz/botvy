import { Module } from '@nestjs/common';
import { OperationsModule } from '../../contexts/operations/operations.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { HealthController } from './health.controller.js';

/**
 * `GET /health` for the backend role. The worker has its own, narrower
 * `/healthz`, because the two processes answer different questions.
 */
@Module({
  // The client moved to `LlmModule` in P4, when the chat became a second
  // caller: `ConversationsModule` importing this one would have pointed the
  // dependency backwards and dragged a controller along with a client.
  imports: [OperationsModule, LlmModule],
  controllers: [HealthController],
})
export class HealthModule {}
