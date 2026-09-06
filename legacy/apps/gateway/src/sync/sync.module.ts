import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { CoachingModule } from '../coaching/coaching.module.js';
import { ConversationsModule } from '../chat/conversations.module.js';

@Module({
  imports: [RemindersModule, CoachingModule, ConversationsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
