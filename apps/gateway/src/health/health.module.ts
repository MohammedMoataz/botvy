import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { LlmModule } from '../llm/llm.module.js';

@Module({
  imports: [LlmModule],
  controllers: [HealthController],
})
export class HealthModule {}
