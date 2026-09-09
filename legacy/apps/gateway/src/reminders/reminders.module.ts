import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';
import { SweepService } from './sweep.service.js';
import { DevicesController } from '../devices/devices.controller.js';
import { InternalController } from '../internal/internal.controller.js';
import { PushModule } from '../push/push.module.js';
import { CoachingModule } from '../coaching/coaching.module.js';

@Module({
  imports: [PushModule, CoachingModule],
  controllers: [RemindersController, DevicesController, InternalController],
  providers: [RemindersService, SweepService],
  exports: [RemindersService],
})
export class RemindersModule {}
