import { Module } from '@nestjs/common';
import { CoachingController } from './coaching.controller.js';
import { CoachingService } from './coaching.service.js';
import { NightlyService } from './nightly.service.js';
import { ProgramGenerator } from './program-generator.js';
import { PushModule } from '../push/push.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { ConversationsModule } from '../chat/conversations.module.js';

@Module({
  // ConversationsModule, not ChatModule — ChatModule imports this one, so the
  // nightly cycle reaches conversations through the small module both share.
  imports: [PushModule, LlmModule, ConversationsModule],
  controllers: [CoachingController],
  providers: [CoachingService, NightlyService, ProgramGenerator],
  exports: [CoachingService, NightlyService, ProgramGenerator],
})
export class CoachingModule {}
