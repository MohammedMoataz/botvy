import { Body, Controller, Post } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Scopes, ServiceOnly } from '../../../../shared/auth/decorators.js';
import { HeartbeatService } from '../../../../shared/health/heartbeat.service.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';

/** The name the nightly run stamps. One job, because it is one run. */
export const BACKUP_JOB = 'backup';

/**
 * What the row is stamped with when the report does not say (E-018).
 *
 * The container declares its own cadence and that is what wins; this covers the
 * backup image that predates the field. It is not a second copy of the schedule
 * so much as a floor under the one failure this whole change exists to stop: an
 * undeclared row is judged by `ops.staleAfterMinutes`, which for a job that
 * runs at 03:00 means `/health` reports the platform degraded for the rest of
 * every day — the defect, restored, by the fallback that is safe for every
 * other job.
 */
export const BACKUP_EVERY_MINUTES = 24 * 60;

export class BackupArchiveDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsInt()
  @Min(0)
  bytes!: number;

  /** Present for the media copy, where the checksum is the verification. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sha256?: string;

  /** Present for the media copy: how many files were counted. */
  @IsOptional()
  @IsInt()
  @Min(0)
  files?: number;
}

export class BackupReportDto {
  @IsBoolean()
  ok!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;

  /**
   * What was written, one entry per archive.
   *
   * Recorded in the heartbeat's error field when the run failed, and otherwise
   * only counted: the point of the list is that a run reporting success with
   * **no** archives is a run that verified nothing, and that is a failure
   * wearing a success. The night the media copy silently stops being taken is
   * the night nobody notices until a restore.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BackupArchiveDto)
  archives?: BackupArchiveDto[];

  /**
   * How often the container is scheduled to run, in minutes (E-018).
   *
   * The container owns this rather than the API, because `BACKUP_CRON` in
   * compose is what actually decides it: an installation that backs up twice a
   * day says so once, in the place that makes it true, rather than in two
   * places one of which nobody can edit.
   *
   * Optional, so a backup image older than this column still reports
   * successfully — it falls back to `BACKUP_EVERY_MINUTES` above rather than to
   * the minute window, for the reason given there. Decorated because the global
   * pipe runs `forbidNonWhitelisted` — an undecorated property is a 400 for the
   * whole report, which would turn a good backup into a missing one.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  everyMinutes?: number;
}

/**
 * How the nightly backup reports what it did (P11, T1104).
 *
 * ## Why the container cannot write this itself
 *
 * Constitution I: the API is the only writer to either store. The backup
 * container reads both — that is its whole job — and writes nothing, so its
 * account of the night comes over HTTP with the service token and the API
 * stamps the heartbeat. The same freshness rule then applies to it as to every
 * in-process job, which is what puts a missed backup on the overview beside a
 * missed rhythm tick.
 *
 * ## Two things are written, not one
 *
 * The heartbeat answers "did it run", and `/health` calls it stale after
 * `backup.staleHours`. `ops.lastBackupAt` answers "when was the last one that
 * *worked*", which is the question an Owner asks before deciding whether they
 * can afford to restore. A failed run advances the first and must not advance
 * the second — writing both together would make a week of failures look like a
 * backup taken last night.
 *
 * ## The response carries the retention
 *
 * The pruning window is `backup.retentionDays`, an operator knob in the
 * registry, and the script doing the pruning runs in a container that cannot
 * read the registry. Rather than duplicate the number into an environment
 * variable — which is constitution XII's mistake, a knob in two places where
 * only one of them is editable — the report answers with it, so the run learns
 * the current value from the same call that reports the result.
 */
@Controller('internal/backups')
@ServiceOnly()
@Scopes('internal:ops')
@ApiSecurity('service-token')
export class InternalBackupsController {
  constructor(
    private readonly heartbeats: HeartbeatService,
    private readonly settings: SettingsService,
  ) {}

  @Post('report')
  async report(@Body() body: BackupReportDto): Promise<{
    job: string;
    ok: boolean;
    at: string;
    retentionDays: number;
  }> {
    const at = new Date();
    const archives = body.archives ?? [];

    // A run that says it succeeded and names nothing it wrote did not succeed.
    // Treated as a failure here rather than trusted, because the alternative is
    // a green heartbeat standing in for an empty directory.
    const ok = body.ok && archives.length > 0;
    const error =
      body.ok && !ok ? 'reported success with no archives' : body.error;

    await this.heartbeats.stamp(
      BACKUP_JOB,
      ok,
      error || undefined,
      body.durationMs,
      body.everyMinutes ?? BACKUP_EVERY_MINUTES,
    );

    if (ok) {
      await this.settings.setSystem('ops.lastBackupAt', at.toISOString());
    }

    return {
      job: BACKUP_JOB,
      ok,
      at: at.toISOString(),
      retentionDays: await this.settings.get('backup.retentionDays'),
    };
  }
}
