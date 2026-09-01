import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { CoachingModule } from '../coaching/coaching.module.js';

@Module({
  imports: [RemindersModule, CoachingModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
