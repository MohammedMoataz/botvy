import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SETTINGS,
  type SettingKey,
  type SettingValue,
  isOpsKey,
  isSettingKey,
} from './settings.registry.js';

/**
 * Runtime configuration, stored in the `settings` table.
 *
 * A stored value wins over the coded default so an operator can retune the
 * system from the admin portal without a redeploy — which is the whole point
 * of the table. Reads are cached briefly because they sit on hot paths (every
 * sweep, every chat turn); a write busts the cache immediately, so the only
 * staleness is between two gateway processes, and there is one.
 */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, unknown>();
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    await this.refreshIfStale();
    const stored = this.cache.get(key);
    if (stored === undefined) return SETTINGS[key].default as SettingValue<K>;

    const parsed = SETTINGS[key].schema.safeParse(stored);
    if (!parsed.success) {
      // A row that no longer fits its schema (a hand-edited value, a shape
      // that changed in a release) must not take the gateway down.
      this.logger.warn(`setting ${key} is invalid, using the default: ${parsed.error.message}`);
      return SETTINGS[key].default as SettingValue<K>;
    }
    return parsed.data as SettingValue<K>;
  }

  /** Every key with its effective value, for the admin portal. */
  async list() {
    await this.refreshIfStale(true);
    const rows = Object.entries(SETTINGS).map(([key, def]) => ({
      key,
      value: this.cache.has(key) ? this.cache.get(key) : def.default,
      overridden: this.cache.has(key),
      default: def.default,
      description: def.description,
    }));

    const ops = await this.prisma.setting.findMany({ where: { key: { startsWith: 'ops.' } } });
    return {
      settings: rows,
      ops: ops.map((o) => ({ key: o.key, value: o.value, updatedAt: o.updatedAt })),
    };
  }

  async set(key: string, value: unknown) {
    if (isOpsKey(key)) {
      throw new BadRequestException(`${key} is written by the gateway and cannot be set`);
    }
    if (!isSettingKey(key)) {
      throw new BadRequestException(
        `Unknown setting "${key}". Known keys: ${Object.keys(SETTINGS).join(', ')}`,
      );
    }

    const parsed = SETTINGS[key].schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid value for ${key}: ${parsed.error.message}`);
    }

    const stored = parsed.data as object;
    const row = await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: stored },
      update: { value: stored },
    });
    this.cache.set(key, parsed.data);
    this.logger.log(`setting ${key} updated`);
    return { key: row.key, value: row.value, updatedAt: row.updatedAt };
  }

  private async refreshIfStale(force = false): Promise<void> {
    if (!force && Date.now() - this.loadedAt < CACHE_TTL_MS) return;
    const rows = await this.prisma.setting.findMany();
    this.cache = new Map(rows.filter((r) => !isOpsKey(r.key)).map((r) => [r.key, r.value]));
    this.loadedAt = Date.now();
  }
}
