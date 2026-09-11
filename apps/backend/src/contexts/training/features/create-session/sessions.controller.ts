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
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
import {
  MAX_EXERCISES,
  MAX_EXERCISE_NAME,
  MAX_SETS_PER_EXERCISE,
  type Exercise,
  type MediaRef,
  type SetEntry,
} from '../../domain/set-entry.js';
import {
  MAX_FOCUS,
  MAX_NOTES,
  MAX_SESSION_MIN,
  MAX_TITLE,
  SessionRuleError,
} from '../../domain/session.aggregate.js';
import { CancelSessionHandler } from '../cancel-session/cancel-session.handler.js';
import { CompleteSessionHandler } from '../complete-session/complete-session.handler.js';
import { DeleteSessionHandler } from '../delete-session/delete-session.handler.js';
import { LogSessionHandler } from '../log-session/log-session.handler.js';
import { PurgeSessionHandler } from '../purge-session/purge-session.handler.js';
import { ReopenSessionHandler } from '../reopen-session/reopen-session.handler.js';
import { RestoreSessionHandler } from '../restore-session/restore-session.handler.js';
import { SkipSessionHandler } from '../skip-session/skip-session.handler.js';
import {
  SessionNotFound,
  UpdateSessionHandler,
} from '../update-session/update-session.handler.js';
import {
  CreateSessionHandler,
  InvalidSessionId,
} from './create-session.handler.js';

// ------------------------------------------------------------------- the DTOs

/**
 * One set, in every sport (`set-entry.ts` argues why there is one shape).
 *
 * Every measure is optional and `done` is not, because a member can tick a set
 * off without typing numbers and a set with a weight typed and not ticked is one
 * they are part way through. Weights are `IsNumber` — 62.5 kg is a real plate
 * combination — and everything else is an integer.
 *
 * Nothing here validates which *pair* of fields the sport implies.
 * `setShapeFor` is a hint about what the editor draws, deliberately not a
 * constraint: a member doing weighted carries for distance is not wrong, and a
 * rule here would be a DTO deciding what somebody's sport is.
 */
class SetEntryDto {
  @IsOptional() @IsInt() @Min(0) @Max(10_000) targetReps?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(2_000) targetWeightKg?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(86_400) targetDurationSec?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) targetDistanceM?: number | null;

  @IsOptional() @IsInt() @Min(0) @Max(10_000) actualReps?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(2_000) actualWeightKg?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(86_400) actualDurationSec?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) actualDistanceM?: number | null;

  @IsBoolean()
  done!: boolean;
}

class MediaRefDto {
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @IsString()
  @MaxLength(2_000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string | null;
}

/**
 * One exercise with its sets in order.
 *
 * `id` arrives from the client because the editor reorders exercises and a
 * member logging a set has to say *which* one — an array index is not a name,
 * and reordering while a set is being typed would move the numbers under their
 * fingers.
 */
class ExerciseDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsString()
  @MaxLength(MAX_EXERCISE_NAME)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MediaRefDto)
  mediaRefs?: MediaRefDto[];

  @IsArray()
  @ArrayMaxSize(MAX_SETS_PER_EXERCISE)
  @ValidateNested({ each: true })
  @Type(() => SetEntryDto)
  sets!: SetEntryDto[];
}

/**
 * `rest-commands.md`: `{ id, plannedAt, durationMin, sport, title, focus?,
 * exercises? }`. There is no `slotId`, no `programId` and no `weekIndex`, and
 * `create-session.handler.ts` carries the reason — a session the member typed
 * belongs to no slot, which is exactly what keeps the materialiser's reconcile
 * from rewriting or removing it.
 */
export class CreateSessionDto {
  @IsString()
  id!: string;

  @IsDateString()
  plannedAt!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_SESSION_MIN)
  durationMin!: number;

  @IsString()
  @MaxLength(40)
  sport!: string;

  @IsString()
  @MaxLength(MAX_TITLE)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_FOCUS)
  focus?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EXERCISES)
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  exercises?: ExerciseDto[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  notes?: string | null;
}

/**
 * The editor's form. Every field optional, because a patch is what changed.
 *
 * The REST contract lists `baseUpdatedAt` beside this route; it is deliberately
 * absent. The optimistic-concurrency rule belongs to the `/sync` push, where the
 * phone has a server version to compare against — a member editing a session in
 * the app has just read it, and making the app hold a base version to send would
 * put the sync protocol into a screen that has no offline queue behind it.
 */
export class UpdateSessionDto {
  @IsOptional()
  @IsDateString()
  plannedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SESSION_MIN)
  durationMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_FOCUS)
  focus?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EXERCISES)
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  exercises?: ExerciseDto[];
}

/** One exercise's sets, coming back from the logger. */
class LoggedExerciseDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsArray()
  @ArrayMaxSize(MAX_SETS_PER_EXERCISE)
  @ValidateNested({ each: true })
  @Type(() => SetEntryDto)
  sets!: SetEntryDto[];
}

/**
 * `{ exercises: [{ id, sets }], notes? }` — the whole session in one request.
 *
 * The batch shape is the contract's and the reason is SC-003: a six-exercise gym
 * session logged in under ninety seconds cannot afford six round trips over a
 * gym's wifi. `Session.log` stays per-exercise underneath, because that is the
 * granularity the phone's logger edits in.
 */
export class LogSessionDto {
  @IsArray()
  @ArrayMaxSize(MAX_EXERCISES)
  @ValidateNested({ each: true })
  @Type(() => LoggedExerciseDto)
  exercises!: LoggedExerciseDto[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES)
  notes?: string | null;
}

/** `{ at? }` — when the member says it happened, defaulting to now. */
export class AtDto {
  @IsOptional()
  @IsDateString()
  at?: string;
}

// -------------------------------------------------------------- the controller

/**
 * Training's session commands. Reads are GraphQL and the sync pull — nothing
 * here returns a view, only an acknowledgement or an id, which is principle X
 * as a rule about what a controller may return.
 *
 * Domain errors are translated here and only here. The handlers and the
 * aggregate throw `SessionRuleError`, `SessionNotFound` and `InvalidSessionId`,
 * because a domain object that threw `ConflictException` would have imported a
 * web framework to express a rule about training.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class SessionsController {
  constructor(
    private readonly create: CreateSessionHandler,
    private readonly update: UpdateSessionHandler,
    private readonly logging: LogSessionHandler,
    private readonly complete: CompleteSessionHandler,
    private readonly cancelSession: CancelSessionHandler,
    private readonly skip: SkipSessionHandler,
    private readonly reopen: ReopenSessionHandler,
    private readonly remove: DeleteSessionHandler,
    private readonly restore: RestoreSessionHandler,
    private readonly purge: PurgeSessionHandler,
  ) {}

  /**
   * 200 rather than 201 for a replay, so a retrying client can tell whether it
   * was the one that created the row. Both are successes and neither is an
   * error: a duplicate create is the protocol working, because the phone minted
   * the id before the server had heard of the session.
   */
  @Post('sessions')
  @HttpCode(200)
  async createSession(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateSessionDto,
  ) {
    const plannedAt = requireDate(body.plannedAt, 'plannedAt');
    return this.translate(() =>
      this.create.handle(principal.id, {
        id: body.id,
        plannedAt,
        durationMin: body.durationMin,
        sport: body.sport,
        title: body.title,
        focus: body.focus ?? null,
        exercises: exercises(body.exercises),
        notes: body.notes ?? null,
      }),
    );
  }

  @Patch('sessions/:id')
  async updateSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateSessionDto,
  ) {
    return this.translate(() =>
      this.update.handle(principal.id, id, {
        plannedAt:
          body.plannedAt === undefined
            ? undefined
            : requireDate(body.plannedAt, 'plannedAt'),
        durationMin: body.durationMin,
        sport: body.sport,
        title: body.title,
        focus: body.focus,
        notes: body.notes,
        exercises:
          body.exercises === undefined ? undefined : exercises(body.exercises),
      }),
    );
  }

  /** What the member did. See `LogSessionDto` for why it is a batch. */
  @Post('sessions/:id/log')
  @HttpCode(200)
  async logSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: LogSessionDto,
  ) {
    return this.translate(() =>
      this.logging.handle(principal.id, id, {
        exercises: body.exercises.map((exercise) => ({
          id: exercise.id,
          sets: exercise.sets.map(setEntry),
        })),
        notes: body.notes,
      }),
    );
  }

  @Post('sessions/:id/complete')
  @HttpCode(200)
  async completeSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.complete.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  @Post('sessions/:id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.cancelSession.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  /** "Not this one". The row stays and is marked (FR-005). */
  @Post('sessions/:id/skip')
  @HttpCode(200)
  async skipSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.skip.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  /** The undo for the three above, for a member who ticked the wrong thing. */
  @Post('sessions/:id/reopen')
  @HttpCode(200)
  async reopenSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.reopen.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  @Delete('sessions/:id')
  async deleteSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.remove.handle(principal.id, id));
  }

  @Post('sessions/:id/restore')
  @HttpCode(200)
  async restoreSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.restore.handle(principal.id, id));
  }

  @Delete('sessions/:id/purge')
  @HttpCode(204)
  async purgeSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /**
   * Domain vocabulary to HTTP, in one place.
   *
   * `not_deleted` is a **409** and everything else a 400, and the split is the
   * one worth arguing for. A bad duration or an unknown exercise is a malformed
   * request the client should stop sending; a purge of a live session is a
   * well-formed request against a row in the wrong state, and it will succeed
   * once the session is deleted. Telling the client "you sent something wrong"
   * about the second would send it looking for a bug in its own payload.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SessionNotFound) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof SessionRuleError) {
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
      if (error instanceof InvalidSessionId) {
        throw new BadRequestException({
          code: 'invalid_id',
          message: error.message,
        });
      }
      throw error;
    }
  }
}

// ----------------------------------------------------------------- the mappers

function date(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A date the request cannot do without.
 *
 * `IsDateString` accepts what the pipe validates, so this is belt and braces for
 * the body — and the only guard there is for a value that arrives as a path
 * segment no DTO ever sees. An unparseable instant is a 400 rather than an
 * `Invalid Date` handed to the aggregate, which would store `NaN` as a
 * `plannedAt` and make every later comparison quietly false.
 */
function requireDate(value: string, field: string): Date {
  const parsed = date(value);
  if (!parsed) {
    throw new BadRequestException({
      code: 'invalid_date',
      message: `"${value}" is not a date (${field})`,
    });
  }
  return parsed;
}

/**
 * The body's sets as the domain's, with every absent measure explicitly `null`.
 *
 * `?? null` rather than passing the DTO through, because `undefined` and `null`
 * are the same absence to a member and are not the same value to Mongoose: a
 * document with `actualReps: undefined` and one with `actualReps: null` read
 * back differently, and `isLogged` checks both — so normalising at the boundary
 * is what keeps one shape in the store.
 */
function setEntry(dto: SetEntryDto): SetEntry {
  return {
    targetReps: dto.targetReps ?? null,
    targetWeightKg: dto.targetWeightKg ?? null,
    targetDurationSec: dto.targetDurationSec ?? null,
    targetDistanceM: dto.targetDistanceM ?? null,
    actualReps: dto.actualReps ?? null,
    actualWeightKg: dto.actualWeightKg ?? null,
    actualDurationSec: dto.actualDurationSec ?? null,
    actualDistanceM: dto.actualDistanceM ?? null,
    done: dto.done,
  };
}

function mediaRef(dto: MediaRefDto): MediaRef {
  return { type: dto.type, url: dto.url, caption: dto.caption ?? null };
}

function exercises(dtos: ExerciseDto[] | undefined): Exercise[] {
  return (dtos ?? []).map((dto) => ({
    id: dto.id,
    name: dto.name,
    notes: dto.notes ?? null,
    mediaRefs: (dto.mediaRefs ?? []).map(mediaRef),
    sets: dto.sets.map(setEntry),
  }));
}
