import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [totalUsers, totalDevices, messagesToday, usageToday] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.device.count(),
      this.prisma.message.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.usageLog.aggregate({
        where: { createdAt: { gte: startOfDay } },
        _sum: { promptTokens: true, completionTokens: true },
      }),
    ]);

    return {
      totalUsers,
      totalDevices,
      messagesToday,
      tokensToday:
        (usageToday._sum.promptTokens ?? 0) + (usageToday._sum.completionTokens ?? 0),
    };
  }

  listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listDevices() {
    return this.prisma.device.findMany({
      select: {
        id: true,
        userId: true,
        name: true,
        platform: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listSettings() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }
}
