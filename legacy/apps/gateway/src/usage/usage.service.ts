import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Sum of today's (UTC calendar day) prompt+completion tokens for a user. */
  async tokensUsedToday(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const rows = await this.prisma.usageLog.findMany({
      where: { userId, createdAt: { gte: startOfDay } },
      select: { promptTokens: true, completionTokens: true },
    });
    return rows.reduce((sum, r) => sum + r.promptTokens + r.completionTokens, 0);
  }

  dailyQuota(): number {
    return this.config.get<number>('CHAT_DAILY_QUOTA_TOKENS')!;
  }

  async hasQuotaRemaining(userId: string): Promise<boolean> {
    const used = await this.tokensUsedToday(userId);
    return used < this.dailyQuota();
  }

  async record(params: {
    userId: string;
    kind: 'chat' | 'task';
    model: string;
    promptTokens: number;
    completionTokens: number;
  }) {
    await this.prisma.usageLog.create({ data: params });
  }
}
