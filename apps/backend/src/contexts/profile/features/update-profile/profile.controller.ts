import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentPrincipal, UsersOnly } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { PhotoStore } from '../../domain/profile.repository.js';
import {
  ProfileQueryHandler,
  type PreferencesView,
  type ProfileView,
} from '../profile-query/profile.query.js';
import {
  InvalidPreference,
  PreferencesNotFound,
  UnknownPreference,
  UpdatePreferencesHandler,
} from '../update-preferences/update-preferences.handler.js';
import {
  ACCEPTED_PHOTO_TYPES,
  InvalidMetric,
  InvalidTimezone,
  MAX_PHOTO_BYTES,
  PhotoRejected,
  ProfileNotFound,
  UpdateProfileHandler,
} from './update-profile.handler.js';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: string;

  @IsOptional()
  @IsDateString()
  onboardingCompletedAt?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  foodLikes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  foodDislikes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];
}

export class RecordMetricDto {
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  // Ranges wide enough for any real person and narrow enough to catch a unit
  // mistake: a weight in pounds typed into a kilograms field is the common one.
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(400)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(260)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(75)
  bodyFatPct?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * The member's own profile and preferences.
 *
 * Reads are REST here rather than GraphQL, and that is a deferral rather than a
 * decision: the GraphQL edge is not wired yet, and a profile screen with
 * nowhere to fetch from is worse than a read on the command surface. When the
 * edge lands these two `@Get`s move and the handlers do not change — which is
 * why the query handler exists separately from this controller at all.
 *
 * Preferences are patched by `PATCH /preferences` rather than nested under
 * `/profile`, because they are a different aggregate with a different event and
 * a different set of consumers.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class ProfileController {
  constructor(
    private readonly profiles: UpdateProfileHandler,
    private readonly preferences: UpdatePreferencesHandler,
    private readonly queries: ProfileQueryHandler,
    private readonly photos: PhotoStore,
  ) {}

  @Get('profile')
  async profile(@CurrentPrincipal() principal: Principal): Promise<ProfileView> {
    const view = await this.queries.profile(principal.id);
    if (!view) throw new NotFoundException('this account has no profile yet');
    return view;
  }

  @Patch('profile')
  @HttpCode(200)
  async patch(
    @Body() body: UpdateProfileDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProfileView> {
    try {
      // The date is destructured out before the spread rather than overwritten
      // after it: spreading first leaves the string in the object's type, and
      // the only way to reconcile that with a `Date` field is a cast.
      const { onboardingCompletedAt, ...rest } = body;
      await this.profiles.handle(principal.id, {
        ...rest,
        ...(onboardingCompletedAt === undefined
          ? {}
          : {
              onboardingCompletedAt:
                onboardingCompletedAt === null ? null : new Date(onboardingCompletedAt),
            }),
      });
    } catch (error) {
      throw this.translate(error);
    }
    // The stored view, not the patch: the server normalises the tag lists and
    // trims the name, and a client that kept its own copy would show `Peanuts`
    // where the store holds `peanuts`.
    return this.profile(principal);
  }

  @Post('profile/metrics')
  async recordMetric(
    @Body() body: RecordMetricDto,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProfileView> {
    try {
      await this.profiles.recordMetric(principal.id, {
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
        ...(body.weightKg === undefined ? {} : { weightKg: body.weightKg }),
        ...(body.heightCm === undefined ? {} : { heightCm: body.heightCm }),
        ...(body.bodyFatPct === undefined ? {} : { bodyFatPct: body.bodyFatPct }),
        ...(body.note === undefined ? {} : { note: body.note }),
      });
    } catch (error) {
      throw this.translate(error);
    }
    return this.profile(principal);
  }

  /**
   * The photo. `limits.fileSize` refuses an oversized upload before the bytes
   * are buffered — the handler checks the size too, but by then a 50 MB file is
   * already in memory.
   */
  @Post('profile/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  async uploadPhoto(
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ProfileView> {
    if (!file) throw new BadRequestException('no photo was uploaded');
    try {
      await this.profiles.setPhoto(principal.id, file.buffer, file.mimetype);
    } catch (error) {
      throw this.translate(error);
    }
    return this.profile(principal);
  }

  /**
   * Serves the member's own photo.
   *
   * Streamed through the API rather than served from the volume by the edge,
   * because it is the member's face: a path on a public directory is readable
   * by anyone who learns it, and the content hash in the filename is not a
   * secret. Admin access to another member's photo arrives with the portal.
   */
  @Get('profile/photo')
  async photo(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ): Promise<Buffer> {
    const view = await this.queries.profile(principal.id);
    if (!view?.photoPath) throw new NotFoundException('no photo');

    const bytes = await this.photos.read(view.photoPath);
    if (!bytes) throw new NotFoundException('no photo');

    response.setHeader('content-type', 'image/webp');
    // Immutable because the name carries a content hash: a replaced photo has a
    // different path, so this copy can never become the wrong one.
    response.setHeader('cache-control', 'private, max-age=31536000, immutable');
    return bytes;
  }

  @Get('preferences')
  async preferences_(@CurrentPrincipal() principal: Principal): Promise<PreferencesView> {
    const view = await this.queries.preferencesFor(principal.id);
    if (!view) throw new NotFoundException('this account has no preferences yet');
    return view;
  }

  /**
   * Patches preferences. The body is deliberately untyped beyond "an object":
   * the handler validates every field against the zod schema of its own
   * registry default, and a DTO here would be a second copy of those rules that
   * drifts from the first.
   */
  @Patch('preferences')
  @HttpCode(200)
  async patchPreferences(
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ changed: string[] }> {
    try {
      return await this.preferences.handle(principal.id, body);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): Error {
    if (error instanceof ProfileNotFound || error instanceof PreferencesNotFound) {
      return new NotFoundException(error.message);
    }
    if (
      error instanceof InvalidTimezone ||
      error instanceof InvalidMetric ||
      error instanceof InvalidPreference ||
      error instanceof UnknownPreference
    ) {
      return new BadRequestException(error.message);
    }
    if (error instanceof PhotoRejected) {
      return new BadRequestException(
        `${error.message}. Accepted types: ${ACCEPTED_PHOTO_TYPES.join(', ')}.`,
      );
    }
    return error as Error;
  }
}
