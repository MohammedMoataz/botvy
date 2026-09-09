import { Controller, Get, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { HeartbeatRepository } from '../../contexts/operations/domain/heartbeat.repository.js';
import { Public } from '../auth/decorators.js';
import { OllamaClient } from '../llm/ollama.client.js';
import { PrismaService } from '../persistence/prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { definitionOf } from '../settings/settings.registry.js';
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
    const [
      postgres,
      mongo,
      ollama,
      heartbeats,
      staleAfterMinutes,
      backupStaleHours,
      defaultAdminPassword,
    ] =
      await Promise.all([
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
        this.setting('ops.staleAfterMinutes'),
        // The nightly jobs get their own window. `backup.staleHours` has been in
        // the registry since the phase began with nothing reading it, which is
        // how a job that runs at 03:00 came to be judged by a fifteen-minute
        // rule and reported the platform degraded for the rest of every day.
        this.setting('backup.staleHours'),
        // Written by the system at boot and cleared by identity.PasswordChanged.
        // Read here rather than recomputed: only Identity can answer the
        // question, and /health must not reach into another context to ask it.
        this.flag('ops.adminPasswordIsDefault'),
      ]);

    return {
      ...assessHealth({
        postgres,
        mongo,
        ollama,
        pushConfigured: this.push.isConfigured(),
        heartbeats,
        staleAfterMinutes,
        backupStaleHours,
        defaultAdminPassword,
      }),
      version: BOTVY_VERSION,
    };
  }

  /**
   * A settings value, falling back to the registry's own default if the store
   * cannot be read.
   *
   * The fallback is the registry entry rather than a number written here. A
   * literal in this file is a second default that nobody maintains, and it
   * diverges silently the first time the registry's changes — which is what
   * principle XII means by "a hard-coded default is a bug".
   */
  private async setting<K extends 'ops.staleAfterMinutes' | 'backup.staleHours'>(
    key: K,
  ): Promise<number> {
    try {
      return (await this.settings.get(key)) as number;
    } catch (error) {
      this.logger.warn(`${key} unreadable, using the registry default: ${(error as Error).message}`);
      return definitionOf(key).default as number;
    }
  }

  /**
   * A boolean settings value, defaulting to the registry entry.
   *
   * The registry's default for `ops.adminPasswordIsDefault` is `true`, which is
   * the safe direction: an unreadable store shows the warning rather than
   * hiding it.
   */
  private async flag(key: 'ops.adminPasswordIsDefault'): Promise<boolean> {
    try {
      return await this.settings.get(key);
    } catch (error) {
      this.logger.warn(`${key} unreadable, assuming the warning applies: ${(error as Error).message}`);
      return definitionOf(key).default as boolean;
    }
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
