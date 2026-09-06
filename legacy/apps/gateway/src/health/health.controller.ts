import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { PushService } from '../push/push.service.js';
import { opsStatus } from '../ops/ops-status.js';
import { Public } from '../auth/public.decorator.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly push: PushService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, ollama, ops] = await Promise.all([
      this.checkDatabase(),
      this.llm.ping(),
      opsStatus(this.prisma),
    ]);
    const ok = database && ollama && !ops.sweepStale;
    return {
      status: ok ? 'ok' : 'degraded',
      database,
      ollama,
      push: this.push.isConfigured,
      ...ops,
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
