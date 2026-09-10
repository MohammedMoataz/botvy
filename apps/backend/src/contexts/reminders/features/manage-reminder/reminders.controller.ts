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
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CurrentPrincipal,
  UsersOnly,
} from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import {
  ReminderRuleError,
  type ReminderSource,
} from '../../domain/reminder.aggregate.js';
import { ReminderLifecycleHandler } from '../reminder-lifecycle/reminder-lifecycle.handler.js';
import {
  InvalidReminderId,
  ManageReminderHandler,
  ReminderNotFound,
  UnresolvableMoment,
} from './manage-reminder.handler.js';

/** `YYYY-MM-DDTHH:mm`, with no zone. See `ReminderMoment` for why it exists. */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

export class CreateReminderDto {
  @IsString()
  id!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @IsOptional()
  @Matches(WALL_CLOCK, {
    message: 'remindAtLocal must look like 2026-09-12T18:00',
  })
  remindAtLocal?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadTimes?: string[];

  @IsOptional()
  @IsIn(['app', 'chat', 'extension'])
  source?: ReminderSource;
}

export class UpdateReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @IsOptional()
  @Matches(WALL_CLOCK, {
    message: 'remindAtLocal must look like 2026-09-12T18:00',
  })
  remindAtLocal?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  leadTimes?: string[];
}

/**
 * `{ minutes }` or `{ until }`, exactly as `contracts/rest-commands.md` has it.
 *
 * Both, because the two callers want different things: a notification action
 * says "20 minutes" and has no idea what time it is, while the editor says
 * "tomorrow at nine" and does. Converting minutes on the server rather than the
 * client also means the snooze is measured from when the request *arrived*,
 * which is the honest reading of "in twenty minutes".
 */
export class SnoozeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 30)
  minutes?: number;

  @IsOptional()
  @IsDateString()
  until?: string;
}

export class ReactivateDto {
  @IsOptional()
  @IsDateString()
  remindAt?: string;

  @IsOptional()
  @Matches(WALL_CLOCK, {
    message: 'remindAtLocal must look like 2026-09-12T18:00',
  })
  remindAtLocal?: string;
}

@Controller('api/v1')
@UsersOnly()
@ApiBearerAuth()
export class RemindersController {
  constructor(
    private readonly manage: ManageReminderHandler,
    private readonly lifecycle: ReminderLifecycleHandler,
  ) {}

  @Post('reminders')
  @HttpCode(200)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateReminderDto,
  ) {
    return this.translate(() =>
      this.manage.create(principal.id, {
        id: body.id,
        title: body.title,
        remindAt: body.remindAt ? new Date(body.remindAt) : undefined,
        remindAtLocal: body.remindAtLocal,
        leadTimes: body.leadTimes,
        source: body.source,
      }),
    );
  }

  @Patch('reminders/:id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: UpdateReminderDto,
  ) {
    return this.translate(() =>
      this.manage.update(principal.id, id, {
        title: body.title,
        remindAt: body.remindAt ? new Date(body.remindAt) : undefined,
        remindAtLocal: body.remindAtLocal,
        leadTimes: body.leadTimes,
      }),
    );
  }

  @Post('reminders/:id/snooze')
  @HttpCode(200)
  async snooze(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: SnoozeDto,
  ) {
    const now = new Date();
    const until = body.until
      ? new Date(body.until)
      : body.minutes
        ? new Date(now.getTime() + body.minutes * 60_000)
        : null;
    if (!until) {
      throw new BadRequestException({
        code: 'snooze_needs_a_moment',
        message: 'Send either { minutes } or { until }.',
      });
    }
    return this.translate(() =>
      this.lifecycle.snooze(principal.id, id, until, now),
    );
  }

  @Post('reminders/:id/complete')
  @HttpCode(200)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.lifecycle.complete(principal.id, id));
  }

  @Post('reminders/:id/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.lifecycle.cancel(principal.id, id));
  }

  @Post('reminders/:id/reactivate')
  @HttpCode(200)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: ReactivateDto,
  ) {
    // The aggregate requires a moment, so the route does too. Reactivating with
    // the old one would put an already-overdue reminder back on the list.
    if (!body.remindAt && !body.remindAtLocal) {
      throw new BadRequestException({
        code: 'reactivate_needs_a_moment',
        message: 'Reactivating needs a new remindAt: the old one has passed.',
      });
    }
    // Resolved through the same resolver a create uses, so a wall clock is read
    // against the member's own zone here too rather than against the server's.
    return this.translate(async () => {
      const remindAt = await this.manage.resolveMoment(principal.id, {
        remindAt: body.remindAt ? new Date(body.remindAt) : undefined,
        remindAtLocal: body.remindAtLocal,
      });
      return this.lifecycle.reactivate(principal.id, id, remindAt);
    });
  }

  @Delete('reminders/deleted')
  @HttpCode(200)
  async clearDeleted(@CurrentPrincipal() principal: Principal) {
    return this.translate(() => this.lifecycle.clearDeleted(principal.id));
  }

  @Delete('reminders/:id')
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.lifecycle.remove(principal.id, id));
  }

  @Post('reminders/:id/restore')
  @HttpCode(200)
  async restore(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.translate(() => this.lifecycle.restore(principal.id, id));
  }

  @Post('reminders/:id/purge')
  @HttpCode(204)
  async purge(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    await this.translate(() => this.lifecycle.purge(principal.id, id));
  }

  /**
   * Domain vocabulary to HTTP.
   *
   * `remind_at_past` is a 400 rather than a 409: the row is in no particular
   * state, the *request* is wrong, and the client's job is to ask the member
   * for a different time rather than to retry. `not_deleted` is a 409, because
   * the request would be fine once the row is deleted.
   */
  private async translate<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ReminderNotFound)
        throw new NotFoundException(error.message);
      if (error instanceof ReminderRuleError) {
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
      if (
        error instanceof InvalidReminderId ||
        error instanceof UnresolvableMoment
      ) {
        throw new BadRequestException({
          code: 'invalid',
          message: error.message,
        });
      }
      throw error;
    }
  }
}
