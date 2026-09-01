import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RemindersService } from './reminders.service.js';
import { CreateReminderDto, UpdateReminderDto } from './dto.js';
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
  ) {
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

  /** Permanent removal — how a finished reminder leaves the list for good. */
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reminders.remove(user.userId, id);
  }
}
