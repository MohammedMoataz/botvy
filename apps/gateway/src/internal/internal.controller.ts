import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SweepService } from '../reminders/sweep.service.js';
import { NightlyService } from '../coaching/nightly.service.js';
import { ProgramGenerator } from '../coaching/program-generator.js';
import { ServiceTokenGuard } from './service-token.guard.js';
import { Public } from '../auth/public.decorator.js';

/**
 * Machine-to-machine endpoints called by n8n workflows. Excluded from the
 * public OpenAPI document — the mobile and admin clients never call these.
 * @Public() only bypasses the user-JWT guard; ServiceTokenGuard still runs,
 * and it deliberately rejects user JWTs.
 */
@ApiExcludeController()
@Public()
@UseGuards(ServiceTokenGuard)
@Controller('internal')
export class InternalController {
  constructor(
    private readonly sweep: SweepService,
    private readonly nightly: NightlyService,
    private readonly programs: ProgramGenerator,
  ) {}

  @Post('reminders/sweep')
  runSweep() {
    return this.sweep.run();
  }

  @Post('alerts')
  alert(@Body() body: { workflow?: string; error?: string }) {
    return this.sweep.alertAdmins(body);
  }

  @Post('coaching/checkin')
  askCheckins() {
    return this.nightly.askCheckins();
  }

  @Post('coaching/program')
  pushPrograms() {
    return this.nightly.pushPrograms((input) => this.programs.generate(input));
  }
}
