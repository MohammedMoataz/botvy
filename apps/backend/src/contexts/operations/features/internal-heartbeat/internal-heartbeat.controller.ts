import { Body, Controller, Post } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Scopes, ServiceOnly } from '../../../../shared/auth/decorators.js';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';

export class HeartbeatDto {
  @IsString()
  job!: string;

  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;
}

/**
 * How a job that runs outside the interface reports in. The backup container
 * is the first: it must never open a store itself, so it tells the API what it
 * did and the API writes the heartbeat. The same freshness rule then applies
 * to it as to every in-process job.
 */
@Controller('internal/ops/heartbeat')
@ServiceOnly()
@Scopes('internal:ops')
@ApiSecurity('service-token')
export class InternalHeartbeatController {
  constructor(private readonly heartbeats: HeartbeatService) {}

  @Post()
  async stamp(@Body() body: HeartbeatDto): Promise<{ job: string; ok: boolean; at: string }> {
    const at = new Date();
    await this.heartbeats.stamp(body.job, body.ok, body.error || undefined, body.durationMs);
    return { job: body.job, ok: body.ok, at: at.toISOString() };
  }
}
