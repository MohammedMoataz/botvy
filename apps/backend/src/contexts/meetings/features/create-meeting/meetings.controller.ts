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
  IsDateString,
  IsIn,
  IsInt,
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
import type { MeetingSource } from '../../domain/meeting.aggregate.js';
import { MeetingRuleError } from '../../domain/meeting.aggregate.js';
import type {
  MeetingRecurrence,
  OccurrenceOverride,
} from '../../domain/recurrence-expander.js';
import { CancelMeetingHandler } from '../cancel-meeting/cancel-meeting.handler.js';
import { CompleteMeetingHandler } from '../complete-meeting/complete-meeting.handler.js';
import { DeleteMeetingHandler } from '../delete-meeting/delete-meeting.handler.js';
import { MoveMeetingOccurrenceHandler } from '../move-occurrence/move-occurrence.handler.js';
import { PurgeMeetingHandler } from '../purge-meeting/purge-meeting.handler.js';
import { RestoreMeetingHandler } from '../restore-meeting/restore-meeting.handler.js';
import { SkipMeetingOccurrenceHandler } from '../skip-occurrence/skip-occurrence.handler.js';
import {
  MeetingNotFound,
  UpdateMeetingHandler,
} from '../update-meeting/update-meeting.handler.js';
import {
  CreateMeetingHandler,
  InvalidMeetingId,
} from './create-meeting.handler.js';

class LocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  onlineLink?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
}

class OverrideDto {
  @IsDateString()
  originalStart!: string;

  @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  durationMin?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto | null;
}

class RecurrenceDto {
  /** Optional in the body; the meeting's own start is the natural anchor. */
  @IsOptional()
  @IsDateString()
  dtstart?: string;

  @IsString()
  @MaxLength(500)
  rrule!: string;

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  exdates?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OverrideDto)
  overrides?: OverrideDto[];
}

export class CreateMeetingDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsDateString()
  startAt!: string;

  /** Absent means the member's own default length (FR-001). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  durationMin?: number | null;

  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  prepNotes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  prepMinutes?: number | null;

  /** Absent means the member's own advance warnings (FR-003). */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderOffsets?: number[] | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lockTimezone?: string | null;

  @IsOptional()
  @IsIn(['app', 'chat', 'extension'])
  source?: MeetingSource;
}

export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  durationMin?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  prepNotes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  prepMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderOffsets?: number[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lockTimezone?: string | null;

  /** Discard the moved occurrences this change would orphan. See `translate`. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class MoveOccurrenceDto {
  @IsDateString()
  startAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  durationMin?: number | null;
}

export class AtDto {
  @IsOptional()
  @IsDateString()
  at?: string;
}

/**
 * Meetings' commands. Reads are GraphQL and the sync pull — nothing here
 * returns a view, only an acknowledgement or an id, which is principle X as a
 * rule about what a controller may return.
 *
 * Domain errors are translated here and only here. The handlers and aggregates
 * throw `MeetingRuleError`, `MeetingNotFound`, `InvalidMeetingId`, because a
 * domain object that threw `ConflictException` would have imported a web
 * framework to express a rule about meetings. The mapping is at the edge, which
 * is also the only place that knows there is an HTTP status to pick.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class MeetingsController {
  constructor(
    private readonly create: CreateMeetingHandler,
    private readonly update: UpdateMeetingHandler,
    private readonly skip: SkipMeetingOccurrenceHandler,
    private readonly move: MoveMeetingOccurrenceHandler,
    private readonly complete: CompleteMeetingHandler,
    private readonly cancelMeeting: CancelMeetingHandler,
    private readonly remove: DeleteMeetingHandler,
    private readonly restore: RestoreMeetingHandler,
    private readonly purge: PurgeMeetingHandler,
  ) {}

  /**
   * 200 rather than 201 for a replay, so a retrying client can tell whether it
   * was the one that created the row. Both are successes and neither is an
   * error, which is the point: a duplicate create is the protocol working.
   */
  @Post('meetings')
  @HttpCode(200)
  async createMeeting(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateMeetingDto,
  ) {
    const startAt = requireDate(body.startAt, 'startAt');
    return this.translate(() =>
      this.create.handle(principal.id, {
        id: body.id,
        title: body.title,
        description: body.description ?? null,
        startAt,
        durationMin: body.durationMin ?? null,
        location: {
          onlineLink: body.location?.onlineLink ?? null,
          address: body.location?.address ?? null,
        },
        prepNotes: body.prepNotes ?? null,
        prepMinutes: body.prepMinutes ?? null,
        reminderOffsets: body.reminderOffsets ?? null,
        recurrence: recurrence(body.recurrence, startAt),
        lockTimezone: body.lockTimezone ?? null,
        source: body.source,
      }),
    );
  }

  /** The series edit. `force` discards the overrides it would orphan. */
  @Patch('meetings/:id')
  async updateMeeting(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateMeetingDto,
  ) {
    const startAt =
      body.startAt === undefined
        ? undefined
        : requireDate(body.startAt, 'startAt');
    return this.translate(() =>
      this.update.handle(principal.id, id, {
        title: body.title,
        description: body.description,
        startAt,
        durationMin: body.durationMin,
        location:
          body.location === undefined
            ? undefined
            : {
                onlineLink: body.location.onlineLink ?? null,
                address: body.location.address ?? null,
              },
        prepNotes: body.prepNotes,
        prepMinutes: body.prepMinutes,
        reminderOffsets: body.reminderOffsets,
        recurrence:
          body.recurrence === undefined
            ? undefined
            : recurrence(body.recurrence, startAt),
        lockTimezone: body.lockTimezone,
        force: body.force,
      }),
    );
  }

  @Post('meetings/:id/occurrences/:originalStart/skip')
  @HttpCode(200)
  async skipOccurrence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('originalStart') originalStart: string,
  ) {
    const moment = requireDate(originalStart, 'originalStart');
    return this.translate(() => this.skip.handle(principal.id, id, moment));
  }

  @Post('meetings/:id/occurrences/:originalStart/move')
  @HttpCode(200)
  async moveOccurrence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('originalStart') originalStart: string,
    @Body() body: MoveOccurrenceDto,
  ) {
    const moment = requireDate(originalStart, 'originalStart');
    const startAt = requireDate(body.startAt, 'startAt');
    return this.translate(() =>
      this.move.handle(
        principal.id,
        id,
        moment,
        startAt,
        body.durationMin ?? null,
      ),
    );
  }

  /**
   * Complete and cancel are meeting-level, and there is deliberately no
   * `/occurrences/:originalStart/complete` or `/cancel` beside them (FR-013).
   * An outcome belongs to the meeting; the member's two statements about one
   * date are the skip and the move above.
   */
  @Post('meetings/:id/complete')
  @HttpCode(200)
  async completeMeeting(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.complete.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  @Post('meetings/:id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.cancelMeeting.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  @Delete('meetings/:id')
  async deleteMeeting(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.remove.handle(principal.id, id));
  }

  @Post('meetings/:id/restore')
  @HttpCode(200)
  async restoreMeeting(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.restore.handle(principal.id, id));
  }

  @Delete('meetings/:id/purge')
  @HttpCode(204)
  async purgeMeeting(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /**
   * Domain vocabulary to HTTP, in one place.
   *
   * `orphaned_overrides` is a **409 with the moments in the body**, and that is
   * the one mapping here worth arguing for. The request is not malformed — a
   * 400 would tell the client it had sent something wrong and should stop — it
   * is a well-formed request that would *destroy* something the member decided
   * about a particular date. So the answer is "your request conflicts with the
   * state of this series, and here are the occurrences at stake", the client
   * turns that into "discard them?", and the retry with `force: true` is a
   * different request that says something the first one did not.
   *
   * `not_deleted` is a 409 for the same family of reasons: the request is
   * allowed and the row is simply in the wrong state, and it will succeed once
   * the meeting is deleted.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof MeetingNotFound) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof MeetingRuleError) {
        if (error.code === 'orphaned_overrides') {
          throw new ConflictException({
            code: error.code,
            message: error.message,
            orphans: error.orphans.map((moment) => moment.toISOString()),
          });
        }
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
      if (error instanceof InvalidMeetingId) {
        throw new BadRequestException({
          code: 'invalid_id',
          message: error.message,
        });
      }
      throw error;
    }
  }
}

function date(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A date the request cannot do without.
 *
 * `IsDateString` accepts what the pipe validates, and `:originalStart` arrives
 * as a path segment that no DTO ever sees — so the one place both can be held
 * to the same rule is here, and an unparseable instant is a 400 rather than an
 * `Invalid Date` handed to the expander.
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
 * The body's repeat as the domain's.
 *
 * `dtstart` defaults to the meeting's own start, because the rule and the first
 * occurrence are the same moment for every repeat a client can express here,
 * and a client that had to send both could send two that disagree.
 */
function recurrence(
  dto: RecurrenceDto | null | undefined,
  startAt: Date | undefined,
): MeetingRecurrence | null {
  if (!dto) return null;
  const dtstart = date(dto.dtstart) ?? startAt;
  if (!dtstart) {
    throw new BadRequestException({
      code: 'invalid_date',
      message: 'a repeat needs a dtstart, or a startAt to anchor it',
    });
  }
  return {
    dtstart,
    rrule: dto.rrule,
    exdates: (dto.exdates ?? []).map(
      (value, index) => requireDate(value, `exdates[${index}]`),
    ),
    overrides: (dto.overrides ?? []).map((override, index) => {
      const entry: OccurrenceOverride = {
        originalStart: requireDate(
          override.originalStart,
          `overrides[${index}].originalStart`,
        ),
      };
      if (override.startAt !== undefined) {
        entry.startAt = date(override.startAt);
      }
      if (override.durationMin !== undefined) {
        entry.durationMin = override.durationMin;
      }
      if (override.title !== undefined) entry.title = override.title;
      if (override.location !== undefined) {
        entry.location = override.location
          ? {
              onlineLink: override.location.onlineLink ?? null,
              address: override.location.address ?? null,
            }
          : null;
      }
      return entry;
    }),
  };
}
