import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateReminderDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  remindAt!: Date;

  @ApiProperty({ required: false, example: ['1h', '0m'], description: 'Lead times, e.g. "1h", "30m", "0m"' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadTimes?: string[];

  @ApiProperty({
    required: false,
    description: 'Client-generated id for a reminder composed offline; retries are deduplicated by it',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  clientId?: string;
}

export class UpdateReminderDto {
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

  @ApiProperty({ required: false, example: ['1h', '0m'], description: 'Replaces the reminder\'s lead times and re-plans its pings' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadTimes?: string[];

  @ApiProperty({ required: false, enum: ['active', 'done', 'cancelled'] })
  @IsOptional()
  @IsEnum(['active', 'done', 'cancelled'])
  status?: 'active' | 'done' | 'cancelled';
}

export class ReactivateReminderDto {
  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'A new moment for it. Without one the reminder comes back at its original time, which for a past one means active and overdue.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  remindAt?: Date;
}

export class RegisterDeviceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  installId!: string;

  @ApiProperty()
  @IsString()
  platform!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, description: 'FCM registration token' })
  @IsOptional()
  @IsString()
  fcmToken?: string;
}
