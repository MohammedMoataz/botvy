import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { Public } from '../auth/public.decorator.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, ollama] = await Promise.all([this.checkDatabase(), this.llm.ping()]);
    const ok = database && ollama;
    return {
      status: ok ? 'ok' : 'degraded',
      database,
      ollama,
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
