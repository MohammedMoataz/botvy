import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { newId } from '../../../../shared/cqrs/ids.js';
import { SessionRuleError } from '../../domain/session.aggregate.js';
import type { Exercise } from '../../domain/set-entry.js';
import { WorkoutRuleError } from '../../domain/workout.aggregate.js';
import {
  ApplyWorkoutToSessionHandler,
  TargetSessionNotFound,
} from '../apply-workout-to-session/apply-workout-to-session.handler.js';
import { DeleteWorkoutHandler } from '../delete-workout/delete-workout.handler.js';
import { PurgeWorkoutHandler } from '../purge-workout/purge-workout.handler.js';
import { RestoreWorkoutHandler } from '../restore-workout/restore-workout.handler.js';
import {
  UpdateWorkoutHandler,
  WorkoutNotFound,
} from '../update-workout/update-workout.handler.js';
import {
  CreateWorkoutHandler,
  InvalidWorkoutId,
} from './create-workout.handler.js';

/**
 * One set, both halves.
 *
 * A library entry carries `actual*` as well as `target*` and `Workout`'s class
 * comment says why: a workout is most often saved from the session just
 * finished, so the numbers the member actually lifted are there to become next
 * time's targets. Refusing them here would make saving a session into a
 * projection instead of a copy.
 */
class SetEntryDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000)
  targetReps?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  targetWeightKg?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  targetDurationSec?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  targetDistanceM?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000)
  actualReps?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  actualWeightKg?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  actualDurationSec?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  actualDistanceM?: number | null;

  /**
   * Separate from having an actual value, and `SetEntry`'s comment says why: a
   * member can tick a set off without typing numbers, and a set with a weight
   * typed but not ticked is one they are part way through.
   */
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

class MediaRefDto {
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @IsString()
  @MaxLength(2_000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string | null;
}

class ExerciseDto {
  /** Minted by whoever added the row; defaulted when a client sends none. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaRefDto)
  mediaRefs?: MediaRefDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetEntryDto)
  sets!: SetEntryDto[];
}

export class CreateWorkoutDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(40)
  sport!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  exercises!: ExerciseDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateWorkoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sport?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  exercises?: ExerciseDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ApplyWorkoutDto {
  @IsString()
  workoutId!: string;
}

/**
 * The workout library's commands (story 5). Reads are GraphQL and the sync
 * pull; nothing here returns a view.
 *
 * ## Why `POST /sessions/:id/apply-workout` is on this controller
 *
 * The path names the session because the session is what changes, and the
 * *command* belongs to the library: it reads a workout and copies it. Putting
 * it with the session commands would have the sessions slice holding a
 * `WorkoutRepository`, which is the dependency this arrangement avoids. Nest
 * routes by path, so two controllers under `api/v1` are only a problem when
 * they claim the same one, and nothing else claims this.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class WorkoutsController {
  constructor(
    private readonly create: CreateWorkoutHandler,
    private readonly update: UpdateWorkoutHandler,
    private readonly remove: DeleteWorkoutHandler,
    private readonly restore: RestoreWorkoutHandler,
    private readonly purge: PurgeWorkoutHandler,
    private readonly applyToSession: ApplyWorkoutToSessionHandler,
  ) {}

  /** 200 rather than 201 for a replay: a duplicate create is the protocol working. */
  @Post('workouts')
  @HttpCode(200)
  async createWorkout(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateWorkoutDto,
  ) {
    return this.translate(() =>
      this.create.handle(principal.id, {
        id: body.id,
        name: body.name,
        sport: body.sport,
        exercises: exercises(body.exercises),
        tags: body.tags,
      }),
    );
  }

  @Patch('workouts/:id')
  async updateWorkout(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateWorkoutDto,
  ) {
    return this.translate(() =>
      this.update.handle(principal.id, id, {
        name: body.name,
        sport: body.sport,
        exercises:
          body.exercises === undefined ? undefined : exercises(body.exercises),
        tags: body.tags,
      }),
    );
  }

  @Delete('workouts/:id')
  async deleteWorkout(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.remove.handle(principal.id, id));
  }

  @Post('workouts/:id/restore')
  @HttpCode(200)
  async restoreWorkout(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.restore.handle(principal.id, id));
  }

  @Delete('workouts/:id/purge')
  @HttpCode(204)
  async purgeWorkout(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /** The library entry dropped into a session, as fresh copies (FR-009). */
  @Post('sessions/:id/apply-workout')
  @HttpCode(200)
  async applyWorkout(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: ApplyWorkoutDto,
  ) {
    return this.translate(() =>
      this.applyToSession.handle(principal.id, id, body.workoutId),
    );
  }

  /**
   * Domain vocabulary to HTTP, in one place.
   *
   * Two rule errors rather than one, because applying a workout crosses into a
   * session and the session has its own limits — `too_many_exercises` from a
   * library entry that outgrew what a session may hold is a `SessionRuleError`,
   * and it is the member's problem to see rather than a 500.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof WorkoutNotFound ||
        error instanceof TargetSessionNotFound
      ) {
        throw new NotFoundException(error.message);
      }
      if (
        error instanceof WorkoutRuleError ||
        error instanceof SessionRuleError
      ) {
        if (error.code === 'not_deleted') {
          throw new ConflictException({
            code: error.code,
            message: error.message,
          });
        }
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      if (error instanceof InvalidWorkoutId) {
        throw new BadRequestException({
          code: 'invalid_id',
          message: error.message,
        });
      }
      throw error;
    }
  }
}

/**
 * The body's exercises as the domain's.
 *
 * A missing `id` is minted here rather than refused: the id exists so the
 * logger can name an exercise and so reordering does not move numbers under the
 * member's fingers, and a client that has not needed one yet has not done
 * anything wrong. `done` defaults to false, which is the honest reading of a
 * set nobody said anything about.
 */
function exercises(list: ExerciseDto[]): Exercise[] {
  return list.map((exercise) => ({
    id: exercise.id ?? newId(),
    name: exercise.name,
    notes: exercise.notes ?? null,
    mediaRefs: (exercise.mediaRefs ?? []).map((ref) => ({
      type: ref.type,
      url: ref.url,
      caption: ref.caption ?? null,
    })),
    sets: exercise.sets.map((set) => ({
      targetReps: set.targetReps ?? null,
      targetWeightKg: set.targetWeightKg ?? null,
      targetDurationSec: set.targetDurationSec ?? null,
      targetDistanceM: set.targetDistanceM ?? null,
      actualReps: set.actualReps ?? null,
      actualWeightKg: set.actualWeightKg ?? null,
      actualDurationSec: set.actualDurationSec ?? null,
      actualDistanceM: set.actualDistanceM ?? null,
      done: set.done ?? false,
    })),
  }));
}
