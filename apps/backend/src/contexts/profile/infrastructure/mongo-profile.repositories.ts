import { Injectable } from '@nestjs/common';
import type { Model } from 'mongoose';
import {
  MongoRepositoryBase,
  type OutboxInsert,
} from '../../../shared/persistence/mongo/mongo-repository.base.js';
import { MongoUnitOfWork } from '../../../shared/persistence/mongo/mongo-unit-of-work.js';
import type { Mapper } from '../../../shared/persistence/ports/mapper.js';
import {
  Preferences,
  type PreferencesState,
} from '../domain/preferences.aggregate.js';
import { Profile, type ProfileState } from '../domain/profile.aggregate.js';
import {
  PreferencesRepository,
  ProfileRepository,
} from '../domain/profile.repository.js';

export interface ProfileDoc extends ProfileState {
  _id: string;
  schemaVersion: number;
}

export interface PreferencesDoc extends PreferencesState {
  _id: string;
  schemaVersion: number;
}

const profileMapper: Mapper<Profile, ProfileDoc> = {
  toDomain(doc) {
    return Profile.rehydrate({
      userId: doc.userId,
      displayName: doc.displayName ?? null,
      photoPath: doc.photoPath ?? null,
      timezone: doc.timezone,
      locale: doc.locale,
      metrics: doc.metrics ?? [],
      foodLikes: doc.foodLikes ?? [],
      foodDislikes: doc.foodDislikes ?? [],
      allergies: doc.allergies ?? [],
      symptoms: doc.symptoms ?? [],
      onboardingCompletedAt: doc.onboardingCompletedAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
  toPersistence(profile) {
    return {
      _id: profile.userId,
      userId: profile.userId,
      displayName: profile.displayName,
      photoPath: profile.photoPath,
      timezone: profile.timezone,
      locale: profile.locale,
      metrics: profile.metrics,
      foodLikes: profile.foodLikes,
      foodDislikes: profile.foodDislikes,
      allergies: profile.allergies,
      symptoms: profile.symptoms,
      onboardingCompletedAt: profile.onboardingCompletedAt,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      schemaVersion: profile.schemaVersion,
    };
  },
};

const preferencesMapper: Mapper<Preferences, PreferencesDoc> = {
  toDomain(doc) {
    return Preferences.rehydrate({
      userId: doc.userId,
      planTomorrowTime: doc.planTomorrowTime,
      endOfDayTime: doc.endOfDayTime,
      morningBriefingTime: doc.morningBriefingTime,
      nextPracticeCutoff: doc.nextPracticeCutoff,
      leadTimes: doc.leadTimes ?? [],
      quietHours: doc.quietHours,
      weekStartsOn: doc.weekStartsOn,
      checkinEnabled: doc.checkinEnabled,
      meetingDurationMin: doc.meetingDurationMin,
      mealMode: doc.mealMode,
      aiSuggestions: doc.aiSuggestions,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  },
  toPersistence(preferences) {
    return {
      _id: preferences.userId,
      userId: preferences.userId,
      planTomorrowTime: preferences.planTomorrowTime,
      endOfDayTime: preferences.endOfDayTime,
      morningBriefingTime: preferences.morningBriefingTime,
      nextPracticeCutoff: preferences.nextPracticeCutoff,
      leadTimes: preferences.leadTimes,
      quietHours: preferences.quietHours,
      weekStartsOn: preferences.weekStartsOn,
      checkinEnabled: preferences.checkinEnabled,
      meetingDurationMin: preferences.meetingDurationMin,
      mealMode: preferences.mealMode,
      aiSuggestions: preferences.aiSuggestions,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
      schemaVersion: preferences.schemaVersion,
    };
  },
};

/**
 * Both repositories delegate to `MongoRepositoryBase`, which is what puts the
 * event in the `outbox` collection in the same session as the document. A save
 * that wrote the row and published afterwards would lose the event whenever the
 * process died in between — and by then the change is already committed.
 *
 * `find` takes a `userId` and passes it as both the id and the owner, because
 * for these two aggregates they are the same value. That is not a shortcut: it
 * is what keeps the base's ownership filter doing its job rather than being
 * bypassed by a lookup that only knows an id.
 */
@Injectable()
export class MongoProfileRepository extends ProfileRepository {
  readonly #inner: InnerProfileRepository;

  constructor(
    private readonly model: Model<ProfileDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerProfileRepository(model, outbox);
  }

  async find(userId: string): Promise<Profile | null> {
    return this.#inner.findById(userId, userId);
  }

  /**
   * One query for the whole batch.
   *
   * It goes to the model directly rather than through the base, because the
   * base's surface is one document at a time — `findById` filters on `_id` and
   * `userId` together, which is exactly right for a single lookup and has no
   * batched form. The filter here is `_id: { $in }` and not `userId: { $in }`
   * even though the two fields carry the same value: `_id` is the collection's
   * own index and always present, whereas an index on `userId` is something a
   * migration has to have declared. Same rows, one that cannot be
   * accidentally un-indexed.
   *
   * The session is joined so a batched read inside a transaction sees that
   * transaction's own writes, the same as every other read in this file.
   * `MongoUnitOfWork.currentSession()` returns null outside one, and `.session(null)`
   * is how the driver spells "no session".
   */
  async findMany(userIds: string[]): Promise<Profile[]> {
    if (userIds.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: userIds } })
      .session(MongoUnitOfWork.currentSession())
      .lean<ProfileDoc[]>()
      .exec();
    return docs.map((doc) => profileMapper.toDomain(doc));
  }

  async save(profile: Profile): Promise<void> {
    await this.#inner.save(profile);
  }

  async remove(userId: string): Promise<boolean> {
    const existing = await this.find(userId);
    if (!existing) return false;
    await this.#inner.remove(existing);
    return true;
  }
}

class InnerProfileRepository extends MongoRepositoryBase<Profile, ProfileDoc> {
  protected readonly mapper = profileMapper;

  constructor(
    protected readonly model: Model<ProfileDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}

@Injectable()
export class MongoPreferencesRepository extends PreferencesRepository {
  readonly #inner: InnerPreferencesRepository;

  constructor(
    private readonly model: Model<PreferencesDoc>,
    outbox: Model<OutboxInsert>,
  ) {
    super();
    this.#inner = new InnerPreferencesRepository(model, outbox);
  }

  async find(userId: string): Promise<Preferences | null> {
    return this.#inner.findById(userId, userId);
  }

  /** Same batched read, same reasoning as the profile one above. */
  async findMany(userIds: string[]): Promise<Preferences[]> {
    if (userIds.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: userIds } })
      .session(MongoUnitOfWork.currentSession())
      .lean<PreferencesDoc[]>()
      .exec();
    return docs.map((doc) => preferencesMapper.toDomain(doc));
  }

  async save(preferences: Preferences): Promise<void> {
    await this.#inner.save(preferences);
  }

  async remove(userId: string): Promise<boolean> {
    const existing = await this.find(userId);
    if (!existing) return false;
    await this.#inner.remove(existing);
    return true;
  }
}

class InnerPreferencesRepository extends MongoRepositoryBase<
  Preferences,
  PreferencesDoc
> {
  protected readonly mapper = preferencesMapper;

  constructor(
    protected readonly model: Model<PreferencesDoc>,
    protected readonly outbox: Model<OutboxInsert>,
  ) {
    super();
  }
}
