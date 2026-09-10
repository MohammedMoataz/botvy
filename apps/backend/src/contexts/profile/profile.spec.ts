import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { InMemoryAuditAdapter } from '../../shared/audit/in-memory-audit.adapter.js';
import { Profile } from './domain/profile.aggregate.js';
import { BootstrapOnRegisteredHandler } from './features/bootstrap-on-registered/bootstrap-on-registered.handler.js';
import { ProfileQueryHandler } from './features/profile-query/profile.query.js';
import { PurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import {
  InvalidPreference,
  UnknownPreference,
  UpdatePreferencesHandler,
} from './features/update-preferences/update-preferences.handler.js';
import {
  InvalidMetric,
  InvalidTimezone,
  PhotoRejected,
  ProfileNotFound,
  UpdateProfileHandler,
} from './features/update-profile/update-profile.handler.js';
import {
  InMemoryPhotoStore,
  InMemoryPreferencesRepository,
  InMemoryProfileRepository,
} from './infrastructure/in-memory-profile.repositories.js';

import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';

let uow: InMemoryUnitOfWork;

const NOW = new Date('2026-09-09T10:00:00.000Z');
const OWNER = { kind: 'user', id: 'admin-1', role: 'admin' } as const;

function registered(
  userId: string,
  payload: Record<string, unknown> = {},
): DomainEvent {
  return {
    eventId: newId(),
    name: 'identity.UserRegistered',
    context: 'identity',
    aggregate: { type: 'user', id: userId },
    userId,
    occurredAt: NOW,
    payload: {
      email: `${userId}@example.test`,
      locale: null,
      timezone: null,
      ...payload,
    },
    schemaVersion: 1,
  };
}

function deleted(userId: string): DomainEvent {
  return {
    ...registered(userId),
    eventId: newId(),
    name: 'identity.UserDeleted',
    payload: {},
  };
}

describe('bootstrap on registered', () => {
  let profiles: InMemoryProfileRepository;
  let preferences: InMemoryPreferencesRepository;
  let settings: SettingsService;
  let handler: BootstrapOnRegisteredHandler;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    profiles = new InMemoryProfileRepository(uow);
    preferences = new InMemoryPreferencesRepository(uow);
    settings = new SettingsService(
      new InMemorySettingsStore(),
      new InMemoryAuditAdapter(),
    );
    handler = new BootstrapOnRegisteredHandler(
      uow,
      profiles,
      preferences,
      settings,
    );
  });

  it('creates a profile and preferences from the registry defaults', async () => {
    await handler.handle(registered('user-1'));

    const profile = await profiles.find('user-1');
    const prefs = await preferences.find('user-1');
    expect(profile?.timezone).toBe('Africa/Cairo');
    expect(prefs?.morningBriefingTime).toBe('08:00');
    expect(prefs?.weekStartsOn).toBe('monday');
  });

  /**
   * At-least-once delivery. Two deliveries must produce one pair, and the
   * second must not reset a member who has already chosen — a re-delivery three
   * weeks later would otherwise hand them today's defaults.
   */
  it('collapses two deliveries into one pair', async () => {
    await handler.handle(registered('user-1'));
    const second = await handler.handle(registered('user-1'));

    expect(second).toBe('already-there');
    expect(profiles.rows.size).toBe(1);
    expect(preferences.rows.size).toBe(1);
  });

  it('does not overwrite a preference the member has since changed', async () => {
    await handler.handle(registered('user-1'));
    const prefs = await preferences.find('user-1');
    prefs?.patch({ morningBriefingTime: '06:30' });
    if (prefs) await uow.run(() => preferences.save(prefs));

    await handler.handle(registered('user-1'));

    expect((await preferences.find('user-1'))?.morningBriefingTime).toBe(
      '06:30',
    );
  });

  /** A member who told us their time zone should not be given the host's. */
  it('prefers what registration supplied over the default', async () => {
    await handler.handle(
      registered('user-1', { timezone: 'Europe/Berlin', locale: 'ar' }),
    );

    const profile = await profiles.find('user-1');
    expect(profile?.timezone).toBe('Europe/Berlin');
    expect(profile?.locale).toBe('ar');
  });

  /**
   * The whole reason the defaults live in the registry: changing one moves the
   * starting point for whoever joins next and leaves everyone else alone.
   */
  it('follows a changed default for the next registration only', async () => {
    await handler.handle(registered('early-member'));
    await settings.set('defaults.morningBriefingTime', '07:15', OWNER);

    await handler.handle(registered('later-member'));

    expect((await preferences.find('early-member'))?.morningBriefingTime).toBe(
      '08:00',
    );
    expect((await preferences.find('later-member'))?.morningBriefingTime).toBe(
      '07:15',
    );
  });

  /** The list must be the member's own, not a reference into the settings cache. */
  it('gives each member their own copy of the list defaults', async () => {
    await handler.handle(registered('user-1'));
    await handler.handle(registered('user-2'));

    const first = await preferences.find('user-1');
    first?.patch({ leadTimes: ['15m'] });
    if (first) await uow.run(() => preferences.save(first));

    expect((await preferences.find('user-2'))?.leadTimes).toEqual(['1h', '0m']);
  });

  it('repairs a half-bootstrapped member rather than skipping them', async () => {
    await handler.handle(registered('user-1'));
    await preferences.remove('user-1');

    await handler.handle(registered('user-1'));

    expect(await preferences.find('user-1')).not.toBeNull();
  });

  it('does nothing for an event with no member on it', async () => {
    const orphan = { ...registered('user-1'), userId: null };

    await expect(handler.handle(orphan)).resolves.toBe('already-there');
    expect(profiles.rows.size).toBe(0);
  });
});

describe('update profile', () => {
  let profiles: InMemoryProfileRepository;
  let photos: InMemoryPhotoStore;
  let handler: UpdateProfileHandler;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    profiles = new InMemoryProfileRepository(uow);
    photos = new InMemoryPhotoStore();
    handler = new UpdateProfileHandler(uow, profiles, photos);
    await profiles.save(
      Profile.create({
        userId: 'user-1',
        displayName: null,
        photoPath: null,
        timezone: 'Africa/Cairo',
        locale: 'en',
        metrics: [],
        foodLikes: [],
        foodDislikes: [],
        allergies: [],
        symptoms: [],
        onboardingCompletedAt: null,
        createdAt: NOW,
      }),
    );
  });

  const names = () => profiles.events.map((event) => event.name);
  const changedIn = () =>
    profiles.events.flatMap(
      (event) => (event.payload as { changed: string[] }).changed,
    );

  /** Consumers key off the field name: a time-zone change reschedules
   * everything the member has, and a locale change reschedules nothing. */
  it('names only the fields that moved', async () => {
    const result = await handler.handle('user-1', {
      timezone: 'Europe/Berlin',
    });

    expect(result.changed).toEqual(['timezone']);
    expect(names()).toEqual(['profile.ProfileUpdated']);
  });

  it('raises nothing for a patch that changes nothing', async () => {
    await handler.handle('user-1', { timezone: 'Africa/Cairo', locale: 'en' });

    expect(names()).toEqual([]);
  });

  /**
   * One form, one event. Raising per part rescheduled the member's day twice
   * and re-checked their meals twice for a single save.
   */
  it('raises one event for a patch that changes several things', async () => {
    await handler.handle('user-1', {
      timezone: 'Europe/Berlin',
      allergies: ['peanuts'],
      displayName: 'Owner',
    });

    expect(names()).toEqual(['profile.ProfileUpdated']);
    expect(changedIn().sort()).toEqual([
      'allergies',
      'displayName',
      'timezone',
    ]);
  });

  it('refuses a time zone Intl does not recognise', async () => {
    await expect(
      handler.handle('user-1', { timezone: 'Cairo' }),
    ).rejects.toBeInstanceOf(InvalidTimezone);
  });

  it('refuses a patch for a member with no profile', async () => {
    await profiles.remove('user-1');

    await expect(
      handler.handle('user-1', { locale: 'ar' }),
    ).rejects.toBeInstanceOf(ProfileNotFound);
  });

  /**
   * The list is matched against when meal suggestions are withheld, so an entry
   * stored as `Peanuts ` and looked up as `peanuts` is an allergy that does not
   * get withheld.
   */
  it('normalises allergies, and treats a re-ordering as no change', async () => {
    await handler.handle('user-1', {
      allergies: ['  Peanuts ', 'SHELLFISH', 'peanuts'],
    });

    expect((await profiles.find('user-1'))?.allergies).toEqual([
      'peanuts',
      'shellfish',
    ]);

    profiles.events.length = 0;
    await handler.handle('user-1', { allergies: ['peanuts', 'shellfish'] });
    expect(names()).toEqual([]);
  });

  it('records a body metric and derives BMI from the latest readings', async () => {
    await handler.recordMetric('user-1', { recordedAt: NOW, heightCm: 180 });
    await handler.recordMetric('user-1', {
      recordedAt: new Date(NOW.getTime() + 86_400_000),
      weightKg: 81,
    });

    const profile = await profiles.find('user-1');
    expect(profile?.latestWeightKg).toBe(81);
    expect(profile?.bmi).toBe(25);
  });

  it('refuses a metric with no measurement in it', async () => {
    await expect(
      handler.recordMetric('user-1', { recordedAt: NOW, note: 'felt fine' }),
    ).rejects.toBeInstanceOf(InvalidMetric);
  });

  it('has no BMI until both a height and a weight exist', async () => {
    await handler.recordMetric('user-1', { recordedAt: NOW, weightKg: 81 });

    expect((await profiles.find('user-1'))?.bmi).toBeUndefined();
  });

  it('stores a photo and points the profile at it', async () => {
    const result = await handler.setPhoto(
      'user-1',
      Buffer.from('image-bytes'),
      'image/png',
    );

    expect((await profiles.find('user-1'))?.photoPath).toBe(result.photoPath);
  });

  /** Deleted after the new path is saved: the other order loses the member
   * their photo if the process dies in between. */
  it('removes the previous photo once the new one is recorded', async () => {
    const first = await handler.setPhoto(
      'user-1',
      Buffer.from('one'),
      'image/png',
    );
    await handler.setPhoto('user-1', Buffer.from('two'), 'image/png');

    expect(await photos.read(first.photoPath)).toBeNull();
  });

  it('refuses a photo that is too large', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024);

    await expect(
      handler.setPhoto('user-1', big, 'image/png'),
    ).rejects.toBeInstanceOf(PhotoRejected);
  });

  it('refuses a type that is not an accepted image', async () => {
    await expect(
      handler.setPhoto('user-1', Buffer.from('%PDF'), 'application/pdf'),
    ).rejects.toBeInstanceOf(PhotoRejected);
  });
});

describe('update preferences', () => {
  let preferences: InMemoryPreferencesRepository;
  let handler: UpdatePreferencesHandler;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    preferences = new InMemoryPreferencesRepository(uow);
    handler = new UpdatePreferencesHandler(uow, preferences);
    await new BootstrapOnRegisteredHandler(
      uow,
      new InMemoryProfileRepository(uow),
      preferences,
      new SettingsService(
        new InMemorySettingsStore(),
        new InMemoryAuditAdapter(),
      ),
    ).handle(registered('user-1'));
    preferences.events.length = 0;
  });

  it('patches a subset and names only what moved', async () => {
    const result = await handler.handle('user-1', { endOfDayTime: '23:00' });

    expect(result.changed).toEqual(['endOfDayTime']);
    expect(preferences.events.map((event) => event.name)).toEqual([
      'profile.PreferencesChanged',
    ]);
  });

  it('leaves the untouched fields alone', async () => {
    await handler.handle('user-1', { endOfDayTime: '23:00' });

    const prefs = await preferences.find('user-1');
    expect(prefs?.morningBriefingTime).toBe('08:00');
    expect(prefs?.mealMode).toBe('llm');
  });

  /**
   * Validated against the registry's own schema for the matching default, so
   * the rule an operator has to satisfy and the rule a member has to satisfy
   * are one rule.
   */
  it('refuses a wall-clock time that is not one', async () => {
    const refused = await handler
      .handle('user-1', { endOfDayTime: '25:00' })
      .catch((error: Error) => error);

    expect(refused).toBeInstanceOf(InvalidPreference);
    expect((refused as InvalidPreference).field).toBe('endOfDayTime');
  });

  it('refuses a value outside an enum', async () => {
    await expect(
      handler.handle('user-1', { weekStartsOn: 'tuesday' }),
    ).rejects.toBeInstanceOf(InvalidPreference);
  });

  it('refuses a malformed quiet-hours object', async () => {
    await expect(
      handler.handle('user-1', { quietHours: { from: '22:00' } }),
    ).rejects.toBeInstanceOf(InvalidPreference);
  });

  /**
   * A client sending `morningBriefTime` for `morningBriefingTime` would
   * otherwise get a 200 and no change, with no way to tell that from success.
   */
  it('refuses an unknown field rather than ignoring it', async () => {
    await expect(
      handler.handle('user-1', { morningBriefTime: '07:00' }),
    ).rejects.toBeInstanceOf(UnknownPreference);
  });

  it('raises nothing when the patch matches what is already stored', async () => {
    await handler.handle('user-1', { morningBriefingTime: '08:00' });

    expect(preferences.events).toEqual([]);
  });

  /** `leadTimes` and `quietHours` are not scalars: comparing them by reference
   * would report a change on every save and reschedule the whole day. */
  it('compares the structured fields by value', async () => {
    await handler.handle('user-1', {
      leadTimes: ['1h', '0m'],
      quietHours: { from: '22:00', to: '07:00' },
    });

    expect(preferences.events).toEqual([]);
  });

  it('does raise when a structured field genuinely differs', async () => {
    const result = await handler.handle('user-1', { leadTimes: ['30m'] });

    expect(result.changed).toEqual(['leadTimes']);
  });
});

describe('profile query', () => {
  let profiles: InMemoryProfileRepository;
  let preferences: InMemoryPreferencesRepository;
  let query: ProfileQueryHandler;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    profiles = new InMemoryProfileRepository(uow);
    preferences = new InMemoryPreferencesRepository(uow);
    query = new ProfileQueryHandler(profiles, preferences);
    await new BootstrapOnRegisteredHandler(
      uow,
      profiles,
      preferences,
      new SettingsService(
        new InMemorySettingsStore(),
        new InMemoryAuditAdapter(),
      ),
    ).handle(registered('user-1'));
  });

  /**
   * A member who has told us nothing about their diet reads as *absent*, not
   * as "no likes and no dislikes" — the coach prompt renders a present empty
   * array as a claim rather than a gap.
   */
  it('omits the fields the member has not filled in', async () => {
    const view = await query.profile('user-1');

    expect(view).not.toHaveProperty('displayName');
    expect(view).not.toHaveProperty('allergies');
    expect(view).not.toHaveProperty('bmi');
    expect(view?.timezone).toBe('Africa/Cairo');
  });

  it('includes them once they are set', async () => {
    const profile = await profiles.find('user-1');
    profile?.update({ displayName: 'Owner', allergies: ['peanuts'] });
    if (profile) await uow.run(() => profiles.save(profile));

    const view = await query.profile('user-1');

    expect(view?.displayName).toBe('Owner');
    expect(view?.allergies).toEqual(['peanuts']);
  });

  it('answers null for a member with no profile', async () => {
    expect(await query.profile('nobody')).toBeNull();
  });

  it('returns the preferences as stored', async () => {
    const view = await query.preferencesFor('user-1');

    expect(view?.endOfDayTime).toBe('22:00');
    expect(view?.quietHours).toEqual({ from: '22:00', to: '07:00' });
  });

  /** The one line that keeps a suggestion from harming someone. */
  it('always spells out allergies in the prompt summary', async () => {
    const profile = await profiles.find('user-1');
    profile?.update({ allergies: ['peanuts', 'shellfish'] });
    if (profile) await uow.run(() => profiles.save(profile));

    expect(await query.summary('user-1')).toContain(
      'Allergies: peanuts, shellfish',
    );
  });

  it('leaves out of the summary what the member never said', async () => {
    const summary = await query.summary('user-1');

    expect(summary).toContain('Time zone: Africa/Cairo');
    expect(summary).not.toContain('Allergies');
    expect(summary).not.toContain('Weight');
  });
});

describe('purge on deleted', () => {
  let profiles: InMemoryProfileRepository;
  let preferences: InMemoryPreferencesRepository;
  let photos: InMemoryPhotoStore;
  let handler: PurgeOnDeletedHandler;

  beforeEach(async () => {
    uow = new InMemoryUnitOfWork();
    profiles = new InMemoryProfileRepository(uow);
    preferences = new InMemoryPreferencesRepository(uow);
    photos = new InMemoryPhotoStore();
    handler = new PurgeOnDeletedHandler(uow, profiles, preferences, photos);
    await new BootstrapOnRegisteredHandler(
      uow,
      profiles,
      preferences,
      new SettingsService(
        new InMemorySettingsStore(),
        new InMemoryAuditAdapter(),
      ),
    ).handle(registered('user-1'));
  });

  it('removes the profile and the preferences', async () => {
    expect(await handler.handle(deleted('user-1'))).toBe('purged');

    expect(await profiles.find('user-1')).toBeNull();
    expect(await preferences.find('user-1')).toBeNull();
  });

  /**
   * The path is read before the profile is removed. The other order loses it
   * and leaves the file on the media volume for ever — and unlike a stray
   * database row, nothing else would ever find it.
   */
  it('deletes the photo bytes as well as the row', async () => {
    const photoPath = await photos.put('user-1', Buffer.from('bytes'));
    const profile = await profiles.find('user-1');
    profile?.update({ photoPath });
    if (profile) await uow.run(() => profiles.save(profile));

    await handler.handle(deleted('user-1'));

    expect(await photos.read(photoPath)).toBeNull();
  });

  /** At-least-once delivery: the second must be a no-op, not an error. */
  it('collapses two deliveries into one purge', async () => {
    await handler.handle(deleted('user-1'));

    expect(await handler.handle(deleted('user-1'))).toBe('nothing-to-do');
  });

  it('leaves another member alone', async () => {
    await new BootstrapOnRegisteredHandler(
      uow,
      profiles,
      preferences,
      new SettingsService(
        new InMemorySettingsStore(),
        new InMemoryAuditAdapter(),
      ),
    ).handle(registered('user-2'));

    await handler.handle(deleted('user-1'));

    expect(await profiles.find('user-2')).not.toBeNull();
  });
});
