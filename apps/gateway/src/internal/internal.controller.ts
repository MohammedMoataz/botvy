import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SweepService } from '../reminders/sweep.service.js';
import { ServiceTokenGuard } from './service-token.guard.js';
import { Public } from '../auth/public.decorator.js';

/**
 * Machine-to-machine endpoints called by n8n workflows. Excluded from the
 * public OpenAPI document — the mobile and admin clients never call these.
 * @Public() only bypasses the user-JWT guard; ServiceTokenGuard still runs.
 */
@ApiExcludeController()
@Public()
@UseGuards(ServiceTokenGuard)
@Controller('internal')
export class InternalController {
  constructor(private readonly sweep: SweepService) {}

  @Post('reminders/sweep')
  runSweep() {
    return this.sweep.run();
  }

  @Post('alerts')
  alert(@Body() body: { workflow?: string; error?: string }) {
    return this.sweep.alertAdmins(body);
  }
}
