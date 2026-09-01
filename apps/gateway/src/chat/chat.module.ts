import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { LlmModule } from '../llm/llm.module.js';
import { UsageModule } from '../usage/usage.module.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { CoachingModule } from '../coaching/coaching.module.js';
import { SearchModule } from '../search/search.module.js';

@Module({
  imports: [LlmModule, UsageModule, RemindersModule, CoachingModule, SearchModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
