import { Body, Controller, Get, HttpException, HttpStatus, Post, Query, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { ChatService } from './chat.service.js';
import { SendMessageDto } from './dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { UsageService } from '../usage/usage.service.js';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly usage: UsageService,
  ) {}

  @Post()
  @Sse()
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ): Promise<Observable<MessageEvent>> {
    if (!(await this.usage.hasQuotaRemaining(user.userId))) {
      throw new HttpException(
        { reason: 'daily_quota_exceeded', quota: this.usage.dailyQuota() },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.chat.streamReply(user.userId, dto.message);
  }

  @Get('history')
  async getHistory(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : undefined;
    return this.chat.history(user.userId, parsed);
  }
}
