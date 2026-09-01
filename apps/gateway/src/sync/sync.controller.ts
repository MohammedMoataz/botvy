import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service.js';
import { SyncRequestDto } from './dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /**
   * One round trip in both directions: the device's offline edits go up, and
   * everything that changed since its cursor comes back.
   *
   * Push and pull share a handler so the response already contains the server
   * rows for what was just sent — the real id for a reminder created offline,
   * and its re-planned pings.
   *
   * The global chat throttle (20/min) is far too tight here: resume,
   * regained connectivity, a push nudge and a post-batch resync can all land
   * within a minute of each other, and none of them costs a model call.
   */
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Post()
  run(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncRequestDto) {
    return this.sync.sync(user.userId, dto);
  }
}
