import { Injectable } from '@nestjs/common';
import type { InMemoryUnitOfWork } from '../../../shared/persistence/memory/in-memory-unit-of-work.js';
import type { DomainEvent } from '../../../shared/cqrs/domain-event.js';
import {
  Preferences,
  type PreferencesState,
} from '../domain/preferences.aggregate.js';
import { Profile, type ProfileState } from '../domain/profile.aggregate.js';
import {
  PhotoStore,
  PreferencesRepository,
  ProfileRepository,
} from '../domain/profile.repository.js';

/**
 * The adapters every handler spec binds.
 *
 * They pull events on save exactly as the Mongo ones do, because that is what
 * makes a handler spec's assertion about a raised event mean anything: an
 * in-memory adapter that left the events on the aggregate would let a handler
 * pass here and publish nothing in production.
 */
@Injectable()
export class InMemoryProfileRepository extends ProfileRepository {
  readonly rows = new Map<string, ProfileState>();
  readonly events: DomainEvent[] = [];

  /**
   * How many times the store has been asked, counted so a spec can hold the
   * batched read to its promise.
   *
   * It is here rather than in a bespoke counting fake because the thing worth
   * asserting is a property of *this* adapter — that `schedulesFor` issues one
   * read per collection and not one per member — and a separate fake would let
   * the real adapter grow a loop nobody notices. The tick runs over every
   * member on a five-minute pulse; the difference between one query and five
   * hundred is the difference between the phase's ten-second goal and a job
   * that outlives its own interval.
   */
  reads = 0;

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async find(userId: string): Promise<Profile | null> {
    const row = this.rows.get(userId);
    return row ? Profile.rehydrate(structuredClone(row)) : null;
  }

  /**
   * Absent ids are skipped, exactly as the `$in` skips them. The count of
   * *store reads* is one — `reads` below is what a spec asserts against to
   * prove the query batched rather than looped, so it has to be incremented
   * here and nowhere else.
   */
  async findMany(userIds: string[]): Promise<Profile[]> {
    this.reads += 1;
    const found: Profile[] = [];
    for (const userId of userIds) {
      const row = this.rows.get(userId);
      if (row) found.push(Profile.rehydrate(structuredClone(row)));
    }
    return found;
  }

  async save(profile: Profile): Promise<void> {
    this.#raise(profile.pullEvents());
    this.rows.set(profile.userId, {
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
    });
  }

  async remove(userId: string): Promise<boolean> {
    return this.rows.delete(userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

@Injectable()
export class InMemoryPreferencesRepository extends PreferencesRepository {
  readonly rows = new Map<string, PreferencesState>();
  readonly events: DomainEvent[] = [];

  /** See `InMemoryProfileRepository.reads`. */
  reads = 0;

  constructor(private readonly uow: InMemoryUnitOfWork) {
    super();
    this.uow.enlistState(this.rows, this.events);
  }

  async find(userId: string): Promise<Preferences | null> {
    const row = this.rows.get(userId);
    return row ? Preferences.rehydrate(structuredClone(row)) : null;
  }

  /** Same as the profile one, and counted the same way. */
  async findMany(userIds: string[]): Promise<Preferences[]> {
    this.reads += 1;
    const found: Preferences[] = [];
    for (const userId of userIds) {
      const row = this.rows.get(userId);
      if (row) found.push(Preferences.rehydrate(structuredClone(row)));
    }
    return found;
  }

  async save(preferences: Preferences): Promise<void> {
    this.#raise(preferences.pullEvents());
    this.rows.set(preferences.userId, {
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
    });
  }

  async remove(userId: string): Promise<boolean> {
    return this.rows.delete(userId);
  }

  #raise(events: DomainEvent[]): void {
    this.uow.collect(events);
    this.events.push(...events);
  }
}

@Injectable()
export class InMemoryPhotoStore extends PhotoStore {
  readonly files = new Map<string, Buffer>();
  #next = 0;

  async put(userId: string, bytes: Buffer): Promise<string> {
    this.#next += 1;
    const path = `${userId}/avatar-${this.#next}.webp`;
    this.files.set(path, bytes);
    return path;
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async read(path: string): Promise<Buffer | null> {
    return this.files.get(path) ?? null;
  }
}
