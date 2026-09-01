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

  /**
   * The coaching clock. n8n calls this every few minutes and the gateway
   * decides whose local check-in or program time has come — the only way to
   * honour a per-user time from a single schedule.
   */
  @Post('coaching/tick')
  tick() {
    return this.nightly.tick((input) => this.programs.generate(input));
  }
}
