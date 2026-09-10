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
import { Type } from 'class-transformer';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { LabelRuleError } from '../../domain/label.aggregate.js';
import type { Priority, TaskSource } from '../../domain/task.aggregate.js';
import { TaskRuleError } from '../../domain/task.aggregate.js';
import { CancelTaskHandler } from '../cancel-task/cancel-task.handler.js';
import { CompleteTaskHandler } from '../complete-task/complete-task.handler.js';
import {
  CreateLabelHandler,
  DuplicateLabelName,
} from '../create-label/create-label.handler.js';
import { DeferTaskHandler } from '../defer-task/defer-task.handler.js';
import { DeleteLabelHandler } from '../delete-label/delete-label.handler.js';
import { DeleteTaskHandler } from '../delete-task/delete-task.handler.js';
import { PurgeTaskHandler } from '../purge-task/purge-task.handler.js';
import { ReopenTaskHandler } from '../reopen-task/reopen-task.handler.js';
import { RestoreTaskHandler } from '../restore-task/restore-task.handler.js';
import { RolloverHandler } from '../rollover/rollover.handler.js';
import { SkipOccurrenceHandler } from '../skip-occurrence/skip-occurrence.handler.js';
import {
  LabelNotFound,
  UpdateLabelHandler,
} from '../update-label/update-label.handler.js';
import {
  TaskNotFound,
  UpdateTaskHandler,
} from '../update-task/update-task.handler.js';
import { CreateTaskHandler, InvalidTaskId } from './create-task.handler.js';
import { InvalidLabelId } from '../create-label/create-label.handler.js';

class RecurrenceDto {
  @IsDateString()
  dtstart!: string;

  @IsString()
  @MaxLength(500)
  rrule!: string;

  @IsIn(['schedule', 'completion'])
  mode!: 'schedule' | 'completion';

  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  exdates?: string[];
}

export class CreateTaskDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priority?: Priority;

  @IsOptional()
  @IsString()
  labelId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_080)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsIn(['app', 'chat', 'extension', 'rhythm'])
  source?: TaskSource;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priority?: Priority;

  @IsOptional()
  @IsString()
  labelId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_080)
  estimatedMinutes?: number | null;
}

export class AtDto {
  @IsOptional()
  @IsDateString()
  at?: string;
}

export class DeferDto {
  @IsDateString()
  toDate!: string;
}

export class RolloverDto {
  @IsDateString()
  toDate!: string;

  @IsArray()
  @IsString({ each: true })
  taskIds!: string[];
}

export class CreateLabelDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

/**
 * The commands. Reads are GraphQL and the sync pull — nothing here returns a
 * view, only an acknowledgement or an id, which is principle X as a rule about
 * what a controller may return.
 *
 * Domain errors are translated here and only here. The handlers and aggregates
 * throw their own types — `TaskRuleError`, `TaskNotFound`, `DuplicateLabelName`
 * — because a domain object that threw `ConflictException` would have imported
 * a web framework to express a rule about tasks. The mapping is at the edge,
 * which is also the only place that knows there is an HTTP status to pick.
 *
 * One controller for tasks and labels because they are one context and one
 * screen: the label editor is a sheet inside the task list, and splitting the
 * routes across two files would put one member interaction in two places.
 */
@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly create: CreateTaskHandler,
    private readonly update: UpdateTaskHandler,
    private readonly complete: CompleteTaskHandler,
    private readonly reopen: ReopenTaskHandler,
    private readonly cancelTask: CancelTaskHandler,
    private readonly defer: DeferTaskHandler,
    private readonly remove: DeleteTaskHandler,
    private readonly restore: RestoreTaskHandler,
    private readonly purge: PurgeTaskHandler,
    private readonly skip: SkipOccurrenceHandler,
    private readonly rollover: RolloverHandler,
    private readonly createLabel: CreateLabelHandler,
    private readonly updateLabel: UpdateLabelHandler,
    private readonly deleteLabel: DeleteLabelHandler,
  ) {}

  /**
   * 200 rather than 201 for a replay, so a retrying client can tell whether it
   * was the one that created the row. Both are successes and neither is an
   * error, which is the point: a duplicate create is the protocol working.
   */
  @Post('tasks')
  @HttpCode(200)
  async createTask(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateTaskDto,
  ) {
    return this.translate(() =>
      this.create.handle(principal.id, {
        id: body.id,
        title: body.title,
        notes: body.notes ?? null,
        dueAt: date(body.dueAt),
        allDay: body.allDay,
        priority: body.priority,
        labelId: body.labelId ?? null,
        recurrence: recurrence(body.recurrence),
        estimatedMinutes: body.estimatedMinutes ?? null,
        source: body.source,
      }),
    );
  }

  @Patch('tasks/:id')
  async updateTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.translate(() =>
      this.update.handle(principal.id, id, {
        title: body.title,
        notes: body.notes,
        dueAt: body.dueAt === undefined ? undefined : date(body.dueAt),
        allDay: body.allDay,
        priority: body.priority,
        labelId: body.labelId,
        recurrence:
          body.recurrence === undefined
            ? undefined
            : recurrence(body.recurrence),
        estimatedMinutes: body.estimatedMinutes,
      }),
    );
  }

  @Post('tasks/:id/complete')
  async completeTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.complete.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  @Post('tasks/:id/reopen')
  async reopenTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.reopen.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  @Post('tasks/:id/cancel')
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: AtDto,
  ) {
    return this.translate(() =>
      this.cancelTask.handle(principal.id, id, date(body.at) ?? new Date()),
    );
  }

  @Post('tasks/:id/defer')
  async deferTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: DeferDto,
  ) {
    return this.translate(() =>
      this.defer.handle(principal.id, id, new Date(body.toDate)),
    );
  }

  @Delete('tasks/:id')
  async deleteTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.remove.handle(principal.id, id));
  }

  @Post('tasks/:id/restore')
  async restoreTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.restore.handle(principal.id, id));
  }

  @Post('tasks/:id/purge')
  @HttpCode(204)
  async purgeTask(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.purge.handle(principal.id, id));
  }

  /**
   * "Not this one." Shaped like the meetings route in `contracts/rest-commands.md`
   * (`/occurrences/:originalStart/skip`) rather than inventing a second spelling,
   * because a member skipping a repeating task and a member skipping a repeating
   * meeting are doing the same thing and the API should say so.
   */
  @Post('tasks/:id/occurrences/:occurrence/skip')
  async skipOccurrence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('occurrence') occurrence: string,
  ) {
    const at = date(occurrence);
    if (!at) throw new BadRequestException(`"${occurrence}" is not a date`);
    return this.translate(() => this.skip.handle(principal.id, id, at));
  }

  @Post('tasks/rollover')
  async rolloverTasks(
    @CurrentPrincipal() principal: Principal,
    @Body() body: RolloverDto,
  ) {
    return this.translate(() =>
      this.rollover.handle(principal.id, body.taskIds, new Date(body.toDate)),
    );
  }

  @Post('labels')
  @HttpCode(200)
  async newLabel(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateLabelDto,
  ) {
    return this.translate(() =>
      this.createLabel.handle(principal.id, {
        id: body.id,
        name: body.name,
        color: body.color,
        sortOrder: body.sortOrder,
      }),
    );
  }

  @Patch('labels/:id')
  async patchLabel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateLabelDto,
  ) {
    return this.translate(() =>
      this.updateLabel.handle(principal.id, id, body),
    );
  }

  @Delete('labels/:id')
  async removeLabel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.deleteLabel.handle(principal.id, id));
  }

  /**
   * Domain vocabulary to HTTP, in one place.
   *
   * `not_deleted` is a 409 rather than a 400: the request was well-formed and
   * the member is allowed to make it — the row is simply in the wrong state,
   * which is what 409 means. Sending 400 would tell a client to stop retrying
   * something that will succeed once the task is deleted.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof TaskNotFound || error instanceof LabelNotFound) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof DuplicateLabelName) {
        throw new ConflictException({
          code: 'duplicate_label_name',
          message: error.message,
        });
      }
      if (error instanceof TaskRuleError || error instanceof LabelRuleError) {
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
      if (error instanceof InvalidTaskId || error instanceof InvalidLabelId) {
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

function recurrence(dto: RecurrenceDto | null | undefined) {
  if (!dto) return null;
  return {
    dtstart: new Date(dto.dtstart),
    rrule: dto.rrule,
    mode: dto.mode,
    exdates: (dto.exdates ?? []).map((value) => new Date(value)),
  };
}
