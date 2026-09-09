import { describe, expect, it } from 'vitest';
import {
  SETTINGS_REGISTRY,
  SETTING_KEYS,
  definitionOf,
  describeRegistry,
  isSettingKey,
  type SettingKey,
} from './settings.registry.js';

describe('settings registry', () => {
  it('registers every key with a schema, a default and a description', () => {
    for (const key of SETTING_KEYS) {
      const definition = definitionOf(key);
      expect(definition.schema, `${key} has no schema`).toBeDefined();
      expect(definition.description.length, `${key} has no description`).toBeGreaterThan(10);
    }
  });

  it("accepts each key's own default, so an unset key is always readable", () => {
    for (const key of SETTING_KEYS) {
      const definition = definitionOf(key);
      const parsed = definition.schema.safeParse(definition.default);
      expect(parsed.success, `${key}'s default does not satisfy its own schema`).toBe(true);
    }
  });

  /**
   * The rule this test exists for. Refusing writes by key prefix froze
   * `ops.staleAfterMinutes`, which is exactly the number an operator retunes.
   * The flag is the authority; the prefix means nothing.
   */
  it('marks only the two system-written keys read-only', () => {
    const readOnly = SETTING_KEYS.filter((key) => definitionOf(key).readOnly === true);

    expect(readOnly.sort()).toEqual(['ops.adminPasswordIsDefault', 'ops.lastBackupAt']);
  });

  it('leaves ops.staleAfterMinutes editable despite sharing the prefix', () => {
    expect(definitionOf('ops.staleAfterMinutes').readOnly).toBeUndefined();
    expect(definitionOf('ops.staleAfterMinutes').default).toBe(15);
  });

  it('rejects a value of the wrong shape rather than storing it', () => {
    expect(SETTINGS_REGISTRY['rhythm.draftTopN'].schema.safeParse(0).success).toBe(false);
    expect(SETTINGS_REGISTRY['rhythm.draftTopN'].schema.safeParse(5).success).toBe(true);
    expect(SETTINGS_REGISTRY['defaults.planTomorrowTime'].schema.safeParse('9pm').success).toBe(
      false,
    );
    expect(SETTINGS_REGISTRY['defaults.planTomorrowTime'].schema.safeParse('21:00').success).toBe(
      true,
    );
    expect(SETTINGS_REGISTRY['defaults.timezone'].schema.safeParse('Cairo').success).toBe(false);
    expect(SETTINGS_REGISTRY['defaults.timezone'].schema.safeParse('Africa/Cairo').success).toBe(
      true,
    );
  });

  /**
   * The registry is the whole platform's, not P0's. A later phase reading a key
   * that was never registered would be reading a hard-coded default.
   */
  it('carries the keys the later phases read, not only the ones P0 reads', () => {
    const laterPhaseKeys: SettingKey[] = [
      'defaults.quietHours',
      'defaults.weekStartsOn',
      'defaults.checkinEnabled',
      'defaults.locale',
      'defaults.meetingDurationMin',
      'rhythm.draftTopN',
      'chat.dailyQuotaTokens',
      'knowledge.maxLinksPerDay',
      'knowledge.stuckAfterMinutes',
      'nutrition.mealsPerDay',
      'auth.registrationOpen',
      'backup.retentionDays',
      'backup.staleHours',
    ];

    for (const key of laterPhaseKeys) {
      expect(isSettingKey(key), `${key} is missing from the registry`).toBe(true);
    }
  });

  it('rejects a key nobody registered', () => {
    expect(isSettingKey('defaults.somethingInvented')).toBe(false);
  });

  it('describes itself for the admin screen, flag included', () => {
    const described = describeRegistry();

    expect(described).toHaveLength(SETTING_KEYS.length);
    const lastBackup = described.find((row) => row.key === 'ops.lastBackupAt');
    expect(lastBackup?.readOnly).toBe(true);
    const staleAfter = described.find((row) => row.key === 'ops.staleAfterMinutes');
    expect(staleAfter?.readOnly).toBe(false);
  });
});
