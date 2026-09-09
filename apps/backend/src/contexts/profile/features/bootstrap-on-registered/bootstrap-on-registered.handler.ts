import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { Preferences } from '../../domain/preferences.aggregate.js';
import { Profile } from '../../domain/profile.aggregate.js';
import { PreferencesRepository, ProfileRepository } from '../../domain/profile.repository.js';

interface UserRegisteredPayload {
  email?: string;
  locale?: string | null;
  timezone?: string | null;
}

/**
 * Gives a new member a profile and preferences.
 *
 * Reacts to `identity.UserRegistered` rather than being called by the register
 * handler. Identity is on PostgreSQL and this context is on MongoDB, so there is
 * no transaction that could span both — the event goes through
 * `identity_outbox` in the same transaction as the account, and the relay
 * delivers it here at least once.
 *
 * Which means idempotency is not optional. Two deliveries must produce one pair,
 * and the second must not overwrite a member who has already changed something:
 * a re-delivery three weeks later would otherwise reset their morning briefing
 * to whatever the registry says today.
 *
 * Every default is read from the registry. Not one literal in this file — a
 * hard-coded default here is a default the Owner cannot change, which is what
 * principle XII calls a bug outright. What registration supplied wins over the
 * registry, because a member who told us their time zone should not be given
 * the installation's.
 */
@Injectable()
export class BootstrapOnRegisteredHandler {
  private readonly logger = new Logger(BootstrapOnRegisteredHandler.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: ProfileRepository,
    private readonly preferences: PreferencesRepository,
    private readonly settings: SettingsService,
  ) {}

  async handle(event: DomainEvent): Promise<'created' | 'already-there'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(`${event.name} ${event.eventId} carries no userId; nothing to bootstrap`);
      return 'already-there';
    }

    const payload = (event.payload ?? {}) as UserRegisteredPayload;

    // Both documents and both of their events in one transaction. A crash
    // between them leaves a member with a profile and no preferences, and the
    // handler is idempotent on the *pair* being present, so the second delivery
    // would take the `already-there` exit and never finish the job.
    return this.uow.run(() => this.create(userId, payload, event.occurredAt));
  }

  private async create(
    userId: string,
    payload: UserRegisteredPayload,
    at: Date,
  ): Promise<'created' | 'already-there'> {
    const [existingProfile, existingPreferences] = await Promise.all([
      this.profiles.find(userId),
      this.preferences.find(userId),
    ]);
    if (existingProfile && existingPreferences) return 'already-there';

    if (!existingProfile) {
      const [timezone, locale] = await Promise.all([
        this.settings.get('defaults.timezone'),
        this.settings.get('defaults.locale'),
      ]);

      await this.profiles.save(
        Profile.create({
          userId,
          displayName: null,
          photoPath: null,
          // What the member told us at registration wins over the default.
          timezone: payload.timezone ?? timezone,
          locale: payload.locale ?? locale,
          metrics: [],
          foodLikes: [],
          foodDislikes: [],
          allergies: [],
          symptoms: [],
          onboardingCompletedAt: null,
          createdAt: at,
        }),
      );
    }

    if (!existingPreferences) {
      // Named rather than destructured from `Promise.all`, because that widens
      // the registry's literal unions — `weekStartsOn` becomes `string` and the
      // aggregate rightly refuses it.
      const defaults = {
        planTomorrowTime: await this.settings.get('defaults.planTomorrowTime'),
        endOfDayTime: await this.settings.get('defaults.endOfDayTime'),
        morningBriefingTime: await this.settings.get('defaults.morningBriefingTime'),
        nextPracticeCutoff: await this.settings.get('defaults.nextPracticeCutoff'),
        leadTimes: await this.settings.get('defaults.leadTimes'),
        quietHours: await this.settings.get('defaults.quietHours'),
        weekStartsOn: await this.settings.get('defaults.weekStartsOn'),
        checkinEnabled: await this.settings.get('defaults.checkinEnabled'),
        meetingDurationMin: await this.settings.get('defaults.meetingDurationMin'),
        mealMode: await this.settings.get('defaults.mealMode'),
        aiSuggestions: await this.settings.get('defaults.aiSuggestions'),
      };

      await this.preferences.save(
        Preferences.create({
          userId,
          ...defaults,
          // Copied, not shared: these two come out of the settings cache, and
          // a member mutating their own list must not edit the default every
          // later registration is seeded from.
          leadTimes: [...defaults.leadTimes],
          quietHours: { ...defaults.quietHours },
          createdAt: at,
        }),
      );
    }

    this.logger.log(`bootstrapped profile and preferences for ${userId}`);
    return 'created';
  }
}
