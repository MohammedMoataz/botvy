import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { CoachingService } from './coaching.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

export class UpdateCoachingProfileDto {
  @ApiProperty({ required: false, description: 'Coaching is opt-in; nothing is sent until this is true.' })
  @IsOptional()
  @IsBoolean()
  optedIn?: boolean;

  @ApiProperty({ required: false, example: 'Africa/Cairo' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  heightCm?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  experience?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  likedFoods?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dislikedFoods?: string[];

  @ApiProperty({ required: false, type: [String], description: 'Hard constraint: a plan containing any of these is withheld.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiProperty({ required: false, type: [Number], description: 'ISO weekdays (1=Mon). Days not listed are rest days.' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  trainingDays?: number[];

  @ApiProperty({ required: false, example: '19:00' })
  @IsOptional()
  @IsString()
  gymTime?: string;
}

@ApiTags('coaching')
@ApiBearerAuth()
@Controller('coaching')
export class CoachingController {
  constructor(private readonly coaching: CoachingService) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.coaching.getProfile(user.userId);
  }

  @Patch('profile')
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCoachingProfileDto) {
    return this.coaching.upsertProfile(user.userId, { ...dto });
  }

  @Get('context')
  context(@CurrentUser() user: AuthenticatedUser) {
    return this.coaching.context(user.userId);
  }
}
