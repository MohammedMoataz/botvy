import type { SettingControl } from './setting-control.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Principal } from '../auth/principal.js';
import { AuditPort } from '../audit/audit.port.js';
import {
  SETTING_KEYS,
  definitionOf,
  describeRegistry,
  isSettingKey,
  type SettingKey,
  type SettingValue,
} from './settings.registry.js';
import { SettingsStore } from './settings.store.js';

/**
 * Cross-process staleness bound. A key that changed this would need the cache
 * to read it, so it is a constant rather than a setting (plan, "Constants and
 * keys").
 */
export const SETTINGS_CACHE_TTL_MS = 60_000;

export class SettingReadOnlyError extends Error {
  readonly code = 'setting_read_only';
  constructor(key: string) {
    super(`${key} is written by the system and cannot be edited.`);
    this.name = 'SettingReadOnlyError';
  }
}

export class UnknownSettingError extends Error {
  readonly code = 'unknown_setting';
  constructor(key: string) {
    super(`${key} is not in the settings registry.`);
    this.name = 'UnknownSettingError';
  }
}

export class InvalidSettingError extends Error {
  readonly code = 'invalid_setting';
  constructor(key: string, readonly detail: string) {
    super(`${key} was refused: ${detail}`);
    this.name = 'InvalidSettingError';
  }
}

interface CacheEntry {
  value: unknown;
  readAt: number;
}

/** What the service needs from the outbox, without depending on its module. */
export interface SettingsEventSink {
  publish(name: string, payload: unknown): Promise<void>;
}

export const SETTINGS_EVENT_SINK = Symbol('SETTINGS_EVENT_SINK');

@Injectable()
export class SettingsService {
  readonly #cache = new Map<string, CacheEntry>();

  constructor(
    private readonly store: SettingsStore,
    private readonly audit: AuditPort,
    @Optional() @Inject(SETTINGS_EVENT_SINK) private readonly events?: SettingsEventSink,
  ) {}

  /** Cache, then store, then the registry default. Never undefined. */
  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const cached = this.#cache.get(key);
    if (cached && Date.now() - cached.readAt < SETTINGS_CACHE_TTL_MS) {
      return cached.value as SettingValue<K>;
    }

    const stored = await this.store.get(key);
    const value = stored ? stored.value : definitionOf(key).default;
    this.#cache.set(key, { value, readAt: Date.now() });
    return value as SettingValue<K>;
  }

  /**
   * Validates against the key's own schema, refuses a read-only entry, stores,
   * announces the change and records who did it.
   *
   * A refused write still leaves an audit row. "Someone tried to change this and
   * was refused" is exactly the thing an Owner wants to see afterwards, and a
   * trail that records only successes cannot show it.
   */
  async set(key: string, value: unknown, actor: Principal): Promise<unknown> {
    if (!isSettingKey(key)) throw new UnknownSettingError(key);

    const definition = definitionOf(key);

    if (definition.readOnly === true) {
      await this.recordAttempt(actor, key, value, 'refused_read_only');
      throw new SettingReadOnlyError(key);
    }

    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
      await this.recordAttempt(actor, key, value, 'refused_invalid', detail);
      throw new InvalidSettingError(key, detail);
    }

    await this.store.set(key, parsed.data, actor.id);
    this.#cache.set(key, { value: parsed.data, readAt: Date.now() });

    // Both roles hold their own cache, so the change has to travel.
    await this.events?.publish('operations.SettingChanged', { key });
    await this.recordAttempt(actor, key, parsed.data, 'applied');

    return parsed.data;
  }

  /**
   * A write the platform makes about itself, not one an operator asked for.
   *
   * `readOnly` on a registry entry means "an operator may not edit this" — it
   * has never meant "nothing may write it". The two keys that carry the flag,
   * `ops.lastBackupAt` and `ops.adminPasswordIsDefault`, are *observations*:
   * facts the system discovers and the portal reads. Without this door they
   * would be entries that describe a state nobody can record.
   *
   * The audit row still gets written, and names the system rather than a
   * person. An unattributed change to a setting is exactly what an Owner wants
   * to be able to rule out.
   *
   * It validates against the schema like any other write. A system that
   * bypassed validation would be the one caller able to put a value in the
   * store that every reader then chokes on.
   */
  async setSystem<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
    const definition = definitionOf(key);
    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) {
      throw new InvalidSettingError(
        key,
        parsed.error.issues.map((issue) => issue.message).join('; '),
      );
    }

    const current = await this.store.get(key);
    // Nothing to do, and nothing to record. This runs at every boot, and an
    // audit row per restart would bury the changes that mattered.
    if (current && deepEquals(current.value, parsed.data)) return;

    await this.store.set(key, parsed.data, SYSTEM_ACTOR.id);
    this.#cache.set(key, { value: parsed.data, readAt: Date.now() });
    await this.events?.publish('operations.SettingChanged', { key });
    await this.recordAttempt(SYSTEM_ACTOR, key, parsed.data, 'applied_by_system');
  }

  /** The read side of the patch: the registry with whatever is currently set. */
  async describe(): Promise<
    Array<{
      key: string;
      value: unknown;
      default: unknown;
      description: string;
      readOnly: boolean;
      control: SettingControl;
    }>
  > {
    const stored = await this.store.getMany([...SETTING_KEYS]);
    const byKey = new Map(stored.map((row) => [row.key, row.value]));

    return describeRegistry().map((entry) => ({
      ...entry,
      value: byKey.has(entry.key) ? byKey.get(entry.key) : entry.default,
    }));
  }

  /**
   * Dropped when `operations.SettingChanged` arrives, in whichever role
   * received it. Without this the other process serves the old value until its
   * own entry expires.
   */
  invalidate(key: string): void {
    this.#cache.delete(key);
  }

  invalidateAll(): void {
    this.#cache.clear();
  }

  private async recordAttempt(
    actor: Principal,
    key: string,
    value: unknown,
    outcome: string,
    detail?: string,
  ): Promise<void> {
    await this.audit.record({
      actor,
      action: 'settings.patch',
      target: { type: 'setting', id: key },
      at: new Date(),
      meta: detail === undefined ? { outcome, value } : { outcome, value, detail },
    });
  }
}

/**
 * Who the audit row names for a write the platform made itself.
 *
 * A service principal, because that is what it is: no member asked for it. The
 * id is stable so the trail can be filtered on it.
 */
export const SYSTEM_ACTOR = {
  kind: 'service',
  id: 'system',
  name: 'botvy',
  scopes: [],
} as const satisfies Principal;

/** Two settings values are the same value. `!==` on an array is always true. */
function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEquals(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => deepEquals(left[key], right[key]))
    );
  }
  return false;
}
