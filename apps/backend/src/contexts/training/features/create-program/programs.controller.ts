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
  Matches,
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
import {
  ProgramRuleError,
  type ProgramSource,
  type ProgramWeek,
} from '../../domain/program.aggregate.js';
import { ActivateProgramHandler } from '../activate-program/activate-program.handler.js';
import {
  ApplyProgramHandler,
  InvalidStartDate,
} from '../apply-program/apply-program.handler.js';
import { ArchiveProgramHandler } from '../archive-program/archive-program.handler.js';
import { DeleteProgramHandler } from '../delete-program/delete-program.handler.js';
import { PurgeProgramHandler } from '../purge-program/purge-program.handler.js';
import { RestoreProgramHandler } from '../restore-program/restore-program.handler.js';
import {
  ProgramNotFound,
  UpdateProgramHandler,
} from '../update-program/update-program.handler.js';
import {
  CreateProgramHandler,
  InvalidProgramId,
} from './create-program.handler.js';

class TemplateSetDto {
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

class TemplateExerciseDto {
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
  @Type(() => TemplateSetDto)
  sets!: TemplateSetDto[];
}

class SessionTemplateDto {
  /**
   * Optional, and defaulted server-side.
   *
   * The id only has to be stable *within* the program — nothing outside it
   * refers to a template, because the materialiser copies templates rather than
   * pointing at them — so a member arranging weeks in an editor has no reason
   * to have minted one, and refusing the body over it would be a 400 about a
   * value they never chose.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateId?: string;

  /**
   * 1 (Monday) to 7 (Sunday), or absent.
   *
   * Absent is the portable case and the aggregate's comment says why: a
   * template with no weekday fills whichever slot comes next in order, so one
   * four-week plan works for a member who trains Monday/Wednesday/Friday and
   * for one who trains Tuesday/Thursday/Saturday.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekday?: number | null;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  focus?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateExerciseDto)
  exercises!: TemplateExerciseDto[];
}

class ProgramWeekDto {
  @IsInt()
  @Min(0)
  @Max(51)
  index!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionTemplateDto)
  sessions!: SessionTemplateDto[];
}

export class CreateProgramDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(40)
  sport!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramWeekDto)
  weeks!: ProgramWeekDto[];

  /** `suggestion` and `link` gain producers in P7; nothing sends them yet. */
  @IsOptional()
  @IsIn(['user', 'suggestion', 'link'])
  source?: ProgramSource;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceLinkIds?: string[];
}

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sport?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProgramWeekDto)
  weeks?: ProgramWeekDto[];
}

export class ApplyProgramDto {
  /**
   * The member's own local date, `YYYY-MM-DD`.
   *
   * A date and not an instant: "the fourteenth" is a statement about the
   * member's calendar, and sent as an instant it would arrive shifted by
   * whatever the sending device's clock read — putting every week index the
   * materialiser computes later out by that shift, for the life of the program.
   */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  /** Agreed to replace the planned content the 409 listed. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/**
 * Programs' commands (story 4). Reads are GraphQL and the sync pull, so nothing
 * here returns a view — only an acknowledgement, an id, or the one answer that
 * is a *warning*, which is principle X as a rule about what a controller may
 * return.
 *
 * Domain errors are translated here and only here. The handlers and aggregates
 * throw `ProgramRuleError`, `ProgramNotFound`, `InvalidProgramId`,
 * `InvalidStartDate`, because a domain object that threw `ConflictException`
 * would have imported a web framework to express a rule about training.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class ProgramsController {
  constructor(
    private readonly create: CreateProgramHandler,
    private readonly update: UpdateProgramHandler,
    private readonly apply: ApplyProgramHandler,
    private readonly archive: ArchiveProgramHandler,
    private readonly activate: ActivateProgramHandler,
    private readonly remove: DeleteProgramHandler,
    private readonly restore: RestoreProgramHandler,
    private readonly purge: PurgeProgramHandler,
  ) {}

  /**
   * 200 rather than 201 for a replay, so a retrying client can tell whether it
   * was the one that created the row. Both are successes and neither is an
   * error: a duplicate create is the offline protocol working.
   */
  @Post('programs')
  @HttpCode(200)
  async createProgram(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateProgramDto,
  ) {
    return this.translate(() =>
      this.create.handle(principal.id, {
        id: body.id,
        title: body.title,
        sport: body.sport,
        weeks: weeks(body.weeks),
        source: body.source,
        sourceLinkIds: body.sourceLinkIds,
      }),
    );
  }

  @Patch('programs/:id')
  async updateProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateProgramDto,
  ) {
    return this.translate(() =>
      this.update.handle(principal.id, id, {
        title: body.title,
        sport: body.sport,
        weeks: body.weeks === undefined ? undefined : weeks(body.weeks),
      }),
    );
  }

  /**
   * Apply, or say what applying would cost (FR-008).
   *
   * ## A refusal is a **409 with the list**, not a 400
   *
   * The request is not malformed — a 400 would tell the client it had sent
   * something wrong and should stop. It is a well-formed request that would
   * *destroy* content the member has in their week, so the answer is "your
   * request conflicts with what is already there, and here is exactly what is
   * at stake". The client turns that into "replace these?", and the retry with
   * `force: true` is a **different request**: it says something the first one
   * did not. Meetings' `orphaned_overrides` is the same shape for the same
   * reason, which is the point of both being 409 — a client that learns the
   * pattern once handles the next one.
   *
   * The body carries `applied: false` beside the list, so a client reading only
   * the body reaches the same conclusion as one reading only the status.
   */
  @Post('programs/:id/apply')
  @HttpCode(200)
  async applyProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: ApplyProgramDto,
  ) {
    const result = await this.translate(() =>
      this.apply.handle(principal.id, id, {
        startDate: body.startDate,
        force: body.force,
      }),
    );

    if (!result.applied) {
      throw new ConflictException({
        code: 'would_replace',
        message:
          'Applying this program would replace planned content. Send force to go ahead.',
        applied: false,
        wouldReplace: result.wouldReplace.map((entry) => ({
          sessionId: entry.sessionId,
          plannedAt: entry.plannedAt.toISOString(),
          title: entry.title,
        })),
      });
    }

    return result;
  }

  @Post('programs/:id/archive')
  @HttpCode(200)
  async archiveProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.archive.handle(principal.id, id));
  }

  @Post('programs/:id/activate')
  @HttpCode(200)
  async activateProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.activate.handle(principal.id, id));
  }

  @Delete('programs/:id')
  async deleteProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.remove.handle(principal.id, id));
  }

  @Post('programs/:id/restore')
  @HttpCode(200)
  async restoreProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.restore.handle(principal.id, id));
  }

  @Delete('programs/:id/purge')
  @HttpCode(204)
  async purgeProgram(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /**
   * Domain vocabulary to HTTP, in one place.
   *
   * `not_active` is a 409 rather than a 400 for the family of reasons the apply
   * refusal is: the request is allowed and the program is simply in the wrong
   * state, and it will succeed once the member activates it. Everything else a
   * `ProgramRuleError` says is about the *body* — an empty title, no weeks, a
   * weekday that is not a day — and that is a 400.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProgramNotFound) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ProgramRuleError) {
        if (error.code === 'not_active' || error.code === 'not_deleted') {
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
      if (error instanceof InvalidProgramId) {
        throw new BadRequestException({
          code: 'invalid_id',
          message: error.message,
        });
      }
      if (error instanceof InvalidStartDate) {
        throw new BadRequestException({
          code: 'invalid_date',
          message: error.message,
        });
      }
      throw error;
    }
  }
}

/**
 * The body's weeks as the domain's.
 *
 * The only thing this fills in is a missing `templateId`, and the `SessionTemplateDto`
 * comment says why it may be missing. Everything else is trimmed, bounded and
 * refused by the aggregate — the validator here rejects the shapes that would
 * not survive the trip, and the rules stay in one place.
 */
function weeks(list: ProgramWeekDto[]): ProgramWeek[] {
  return list.map((week) => ({
    index: week.index,
    sessions: week.sessions.map((session) => ({
      templateId: session.templateId ?? newId(),
      weekday: session.weekday ?? null,
      title: session.title,
      focus: session.focus ?? null,
      exercises: session.exercises.map((exercise) => ({
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
        })),
      })),
    })),
  }));
}
