import { Controller, Get, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { HeartbeatRepository } from '../../contexts/operations/domain/heartbeat.repository.js';
import { Public } from '../auth/decorators.js';
import { OllamaClient } from '../llm/ollama.client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { assessHealth, type HealthReport } from './health.assess.js';

export const BOTVY_VERSION = '2.0.0';

/**
 * Liveness, readiness and job freshness in one public answer.
 *
 * Always 200: the container runtime asks "is the process serving", and a
 * degraded system that can still say so is serving. The verdict is in the
 * body, where `verify.mjs`, the admin overview and a person all read it.
 * Every probe is guarded so one store timing out reads as `false`, never as an
 * exception that hides the state of the other three.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectConnection() private readonly mongo: Connection,
    private readonly ollama: OllamaClient,
    private readonly push: PushService,
    private readonly heartbeats: HeartbeatRepository,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @Public()
  async report(): Promise<HealthReport & { version: string }> {
    const [postgres, mongo, ollama, heartbeats, staleAfterMinutes] = await Promise.all([
      this.probe('postgres', () => this.prisma.ping()),
      this.probe('mongo', async () => {
        const result = await this.mongo.db?.admin().ping();
        return result?.ok === 1;
      }),
      this.probe('ollama', () => this.ollama.isReachable()),
      this.heartbeats.listAll().catch((error: Error) => {
        this.logger.warn(`heartbeats unreadable: ${error.message}`);
        return [];
      }),
      this.settings.get('ops.staleAfterMinutes').catch(() => 15),
    ]);

    return {
      ...assessHealth({
        postgres,
        mongo,
        ollama,
        pushConfigured: this.push.isConfigured(),
        heartbeats,
        staleAfterMinutes,
      }),
      version: BOTVY_VERSION,
    };
  }

  private async probe(name: string, check: () => Promise<boolean>): Promise<boolean> {
    try {
      return await check();
    } catch (error) {
      this.logger.warn(`${name} probe failed: ${(error as Error).message}`);
      return false;
    }
  }
}
