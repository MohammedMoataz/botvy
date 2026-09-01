import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UpdateCoachingProfileDto } from '../coaching/coaching.controller.js';

/** One reminder edit a phone made, possibly while offline. */
export class PushedReminderDto {
  @ApiProperty({ required: false, description: 'Absent when the row was created offline.' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Client-generated; makes a retried create idempotent.' })
  @IsString()
  @MinLength(1)
  clientId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  remindAt?: Date;

  @ApiProperty({ required: false, example: ['1h', '0m'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadTimes?: string[];

  @ApiProperty({ required: false, enum: ['active', 'done', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: 'active' | 'done' | 'cancelled';

  @ApiProperty({ required: false, description: 'The device is asking for this to be removed.' })
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: "When the device made the edit, on its own clock. Clamped server-side.",
  })
  @Type(() => Date)
  @IsDate()
  updatedAt!: Date;

  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'The last server updatedAt this device holds. When it still matches, the edit is uncontested and no clock is consulted.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  baseUpdatedAt?: Date;
}

export class SyncPushDto {
  @ApiProperty({ type: [PushedReminderDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PushedReminderDto)
  reminders?: PushedReminderDto[];

  /**
   * Reusing the coaching DTO is the allowlist: `whitelist: true` strips
   * anything not declared on it, so the server-owned columns
   * (awaitingCheckin, awaitingSince, lastCheckinSentDate, lastProgramSentDate)
   * are unreachable from a client by construction rather than by a list
   * someone has to remember to update.
   */
  @ApiProperty({ type: UpdateCoachingProfileDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCoachingProfileDto)
  profile?: UpdateCoachingProfileDto;
}

export class SyncRequestDto {
  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'The `now` from the previous response, echoed verbatim. Always server-issued, so a wrong device clock cannot corrupt the cursor. Omit for a full snapshot.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  since?: Date;

  @ApiProperty({ required: false, description: 'Highest message id the device holds.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  lastMessageId?: number;

  @ApiProperty({ required: false, description: 'Refreshes this device\'s last-seen time.' })
  @IsOptional()
  @IsString()
  installId?: string;

  @ApiProperty({ type: SyncPushDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SyncPushDto)
  push?: SyncPushDto;
}
