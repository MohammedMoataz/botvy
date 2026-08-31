import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service.js';

/**
 * The subset of configuration a signed-in client needs to stop hardcoding its
 * own copies: default lead times, the fallback timezone. Operator-only values
 * (batch sizes, retry windows) stay on the admin surface.
 */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('defaults')
  async defaults() {
    const [timezone, leadTimes, checkinTime, programTime] = await Promise.all([
      this.settings.get('defaults.timezone'),
      this.settings.get('reminders.defaultLeadTimes'),
      this.settings.get('coaching.checkinTime'),
      this.settings.get('coaching.programTime'),
    ]);
    return { timezone, leadTimes, checkinTime, programTime };
  }
}
