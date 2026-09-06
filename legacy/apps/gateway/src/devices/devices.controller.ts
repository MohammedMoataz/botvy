import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDeviceDto } from '../reminders/dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.device.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Idempotent per installId: the app calls this on every launch. */
  @Post()
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.prisma.device.upsert({
      where: { installId: dto.installId },
      create: {
        userId: user.userId,
        installId: dto.installId,
        platform: dto.platform,
        name: dto.name,
        fcmToken: dto.fcmToken,
        lastSeenAt: new Date(),
      },
      update: {
        // Re-assign to the current user: the same handset can be handed to
        // a different account, and the token must follow the live session.
        userId: user.userId,
        platform: dto.platform,
        name: dto.name,
        fcmToken: dto.fcmToken,
        lastSeenAt: new Date(),
      },
    });
  }

  @Delete(':installId')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('installId') installId: string) {
    await this.prisma.device.deleteMany({ where: { installId, userId: user.userId } });
    return { deleted: true };
  }
}
