import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { LlmModule } from '../llm/llm.module.js';
import { UsageModule } from '../usage/usage.module.js';
import { RemindersModule } from '../reminders/reminders.module.js';

@Module({
  imports: [LlmModule, UsageModule, RemindersModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
