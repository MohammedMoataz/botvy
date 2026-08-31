import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { LlmModule } from '../llm/llm.module.js';
import { PushModule } from '../push/push.module.js';

@Module({
  imports: [LlmModule, PushModule],
  controllers: [HealthController],
})
export class HealthModule {}
