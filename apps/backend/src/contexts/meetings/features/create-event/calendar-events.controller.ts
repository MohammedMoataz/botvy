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
import { CalendarEventRuleError } from '../../domain/calendar-event.aggregate.js';
import type {
  MeetingRecurrence,
  OccurrenceOverride,
} from '../../domain/recurrence-expander.js';
import { DeleteCalendarEventHandler } from '../delete-event/delete-event.handler.js';
import { MoveCalendarEventOccurrenceHandler } from '../move-event-occurrence/move-event-occurrence.handler.js';
import { PurgeCalendarEventHandler } from '../purge-event/purge-event.handler.js';
import { RestoreCalendarEventHandler } from '../restore-event/restore-event.handler.js';
import { SkipCalendarEventOccurrenceHandler } from '../skip-event-occurrence/skip-event-occurrence.handler.js';
import {
  CalendarEventNotFound,
  UpdateCalendarEventHandler,
} from '../update-event/update-event.handler.js';
import {
  CreateCalendarEventHandler,
  InvalidCalendarEventId,
} from './create-event.handler.js';

class EventOverrideDto {
  @IsDateString()
  originalStart!: string;

  @IsOptional()
  @IsDateString()
  startAt?: string | null;
}

class EventRecurrenceDto {
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
  @Type(() => EventOverrideDto)
  overrides?: EventOverrideDto[];
}

export class CreateCalendarEventDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string | null;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventRecurrenceDto)
  recurrence?: EventRecurrenceDto | null;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EventRecurrenceDto)
  recurrence?: EventRecurrenceDto | null;
}

export class MoveEventOccurrenceDto {
  @IsDateString()
  startAt!: string;

  /**
   * Accepted and unused, so a client that shares its occurrence-move code with
   * meetings is not refused. An event's length comes from its own window —
   * `move-event-occurrence.handler.ts` says why one date cannot have its own.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(480)
  durationMin?: number | null;
}

/**
 * Personal events (FR-011): a birthday, a holiday, a block of focus time.
 *
 * Seven routes rather than the meeting's nine, and the two that are missing are
 * missing on purpose: there is no complete and no cancel, because a personal
 * event has no outcome. "Did your birthday happen" is not a question the
 * product asks, and a status here would be a field every client had to render
 * and no member would ever set.
 *
 * Its own controller rather than more routes on `MeetingsController`, because
 * the two aggregates share a *repeat* and nothing else — the error vocabularies
 * differ, and one `translate` that knew both would be a switch over two error
 * types pretending to be one.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class CalendarEventsController {
  constructor(
    private readonly create: CreateCalendarEventHandler,
    private readonly update: UpdateCalendarEventHandler,
    private readonly skip: SkipCalendarEventOccurrenceHandler,
    private readonly move: MoveCalendarEventOccurrenceHandler,
    private readonly remove: DeleteCalendarEventHandler,
    private readonly restore: RestoreCalendarEventHandler,
    private readonly purge: PurgeCalendarEventHandler,
  ) {}

  @Post('calendar-events')
  @HttpCode(200)
  async createEvent(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateCalendarEventDto,
  ) {
    const startAt = requireDate(body.startAt, 'startAt');
    return this.translate(() =>
      this.create.handle(principal.id, {
        id: body.id,
        title: body.title,
        notes: body.notes ?? null,
        startAt,
        endAt: requireDate(body.endAt, 'endAt'),
        allDay: body.allDay,
        color: body.color ?? null,
        recurrence: recurrence(body.recurrence, startAt),
      }),
    );
  }

  @Patch('calendar-events/:id')
  async updateEvent(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateCalendarEventDto,
  ) {
    const startAt =
      body.startAt === undefined
        ? undefined
        : requireDate(body.startAt, 'startAt');
    return this.translate(() =>
      this.update.handle(principal.id, id, {
        title: body.title,
        notes: body.notes,
        startAt,
        endAt:
          body.endAt === undefined
            ? undefined
            : requireDate(body.endAt, 'endAt'),
        allDay: body.allDay,
        color: body.color,
        recurrence:
          body.recurrence === undefined
            ? undefined
            : recurrence(body.recurrence, startAt),
      }),
    );
  }

  @Post('calendar-events/:id/occurrences/:originalStart/skip')
  @HttpCode(200)
  async skipOccurrence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('originalStart') originalStart: string,
  ) {
    const moment = requireDate(originalStart, 'originalStart');
    return this.translate(() => this.skip.handle(principal.id, id, moment));
  }

  @Post('calendar-events/:id/occurrences/:originalStart/move')
  @HttpCode(200)
  async moveOccurrence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('originalStart') originalStart: string,
    @Body() body: MoveEventOccurrenceDto,
  ) {
    const moment = requireDate(originalStart, 'originalStart');
    const startAt = requireDate(body.startAt, 'startAt');
    return this.translate(() =>
      this.move.handle(principal.id, id, moment, startAt),
    );
  }

  @Delete('calendar-events/:id')
  async deleteEvent(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.remove.handle(principal.id, id));
  }

  @Post('calendar-events/:id/restore')
  @HttpCode(200)
  async restoreEvent(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.restore.handle(principal.id, id));
  }

  @Delete('calendar-events/:id/purge')
  @HttpCode(204)
  async purgeEvent(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /**
   * `not_deleted` is a 409 rather than a 400 — the request is well-formed and
   * allowed, and the row is simply in the wrong state, which is what 409 means.
   * There is no `orphaned_overrides` here because `CalendarEvent.edit` does not
   * raise one; if events ever gain the meeting's warning, it maps the same way
   * and for the same reason.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof CalendarEventNotFound) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof CalendarEventRuleError) {
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
      if (error instanceof InvalidCalendarEventId) {
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

/** See the meetings controller's copy: a path segment no DTO ever validates. */
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
 * The body's repeat as the domain's — the second copy of the meetings
 * controller's, narrower because an event's override carries only a moment.
 *
 * Duplicated rather than shared: the constitution prices the second copy as
 * cheaper than an abstraction that has to be true of both, and the two differ
 * exactly where the aggregates do.
 */
function recurrence(
  dto: EventRecurrenceDto | null | undefined,
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
    exdates: (dto.exdates ?? []).map((value, index) =>
      requireDate(value, `exdates[${index}]`),
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
      return entry;
    }),
  };
}
