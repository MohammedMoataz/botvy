import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RemindersService } from './reminders.service.js';
import { CreateReminderDto, ReactivateReminderDto, UpdateReminderDto } from './dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

@ApiTags('reminders')
@ApiBearerAuth()
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: 'active' | 'done' | 'cancelled',
    @Query('deleted') deleted?: string,
  ) {
    // Deleted reminders are a separate list, not a status: one can be deleted
    // while it was done, cancelled or still waiting, and which it was is what
    // the undo list has to show.
    if (deleted === 'true') return this.reminders.listDeleted(user.userId);
    return this.reminders.list(user.userId, status);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReminderDto) {
    return this.reminders.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.reminders.update(user.userId, id, dto);
  }

  /** Soft removal: it leaves the list but stays undoable until the sweep. */
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reminders.remove(user.userId, id);
  }

  /** Undo. Comes back with the status it had, and rings again if it still can. */
  @Post(':id/restore')
  restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reminders.restore(user.userId, id);
  }

  /**
   * Back, and active again whatever it was — for a reminder the user wants to
   * do over. `remindAt` gives it a new moment; without one it returns overdue.
   */
  @Post(':id/reactivate')
  reactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReactivateReminderDto,
  ) {
    return this.reminders.reactivate(user.userId, id, dto.remindAt);
  }

  /** Erases one deleted reminder for good, ahead of the sweep. */
  @Delete(':id/purge')
  purge(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reminders.purge(user.userId, id);
  }

  /** Empties the undo list. */
  @Delete('deleted/all')
  purgeAll(@CurrentUser() user: AuthenticatedUser) {
    return this.reminders.purgeAllDeleted(user.userId);
  }
}
