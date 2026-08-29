import { Module } from '@nestjs/common';
import { CoachingController } from './coaching.controller.js';
import { CoachingService } from './coaching.service.js';
import { NightlyService } from './nightly.service.js';
import { ProgramGenerator } from './program-generator.js';
import { PushModule } from '../push/push.module.js';
import { LlmModule } from '../llm/llm.module.js';

@Module({
  imports: [PushModule, LlmModule],
  controllers: [CoachingController],
  providers: [CoachingService, NightlyService, ProgramGenerator],
  exports: [CoachingService, NightlyService, ProgramGenerator],
})
export class CoachingModule {}
