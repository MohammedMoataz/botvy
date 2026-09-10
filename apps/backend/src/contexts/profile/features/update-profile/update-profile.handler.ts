import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../../shared/persistence/ports/unit-of-work.js';
import { isValidTimezone } from '../../../../shared/time/time.js';
import type { BodyMetric } from '../../domain/profile.aggregate.js';
import {
  PhotoStore,
  ProfileRepository,
} from '../../domain/profile.repository.js';

export class ProfileNotFound extends Error {
  constructor() {
    super('this account has no profile yet');
  }
}

export class InvalidTimezone extends Error {
  constructor(zone: string) {
    super(`${zone} is not an IANA time zone such as Africa/Cairo`);
  }
}

export class InvalidMetric extends Error {}

export class PhotoRejected extends Error {}

export interface UpdateProfileCommand {
  displayName?: string | null;
  timezone?: string;
  locale?: string;
  onboardingCompletedAt?: Date | null;
  foodLikes?: string[];
  foodDislikes?: string[];
  allergies?: string[];
  symptoms?: string[];
}

/** What a photo may be. Anything larger or otherwise typed is refused. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Everything a member changes about themselves.
 *
 * One handler for the details, the food and allergy lists and the photo,
 * because they are one aggregate and one event — three handlers would be three
 * saves and three `ProfileUpdated` events for what a client sends as one form.
 *
 * The time zone is validated here rather than in the aggregate. It is the one
 * field whose validity depends on the platform's own ICU data, and a domain
 * object that reaches for `Intl` to check an argument has stopped being a
 * domain object.
 */
@Injectable()
export class UpdateProfileHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly profiles: ProfileRepository,
    private readonly photos: PhotoStore,
  ) {}

  async handle(
    userId: string,
    command: UpdateProfileCommand,
  ): Promise<{ changed: string[] }> {
    if (command.timezone !== undefined && !isValidTimezone(command.timezone)) {
      throw new InvalidTimezone(command.timezone);
    }

    const profile = await this.profiles.find(userId);
    if (!profile) throw new ProfileNotFound();

    // One call, one event. The aggregate diffs every part of the patch and
    // announces once — a form that changes a time zone and an allergy together
    // must not reschedule the member's day twice.
    const changed = profile.update({
      displayName: command.displayName,
      timezone: command.timezone,
      locale: command.locale,
      onboardingCompletedAt: command.onboardingCompletedAt,
      foodLikes: command.foodLikes,
      foodDislikes: command.foodDislikes,
      allergies: command.allergies,
      symptoms: command.symptoms,
    });

    // A patch that changed nothing is not saved and raises nothing: an idle
    // save from a client should not wake five contexts.
    if (changed.length > 0)
      await this.uow.run(() => this.profiles.save(profile));
    return { changed };
  }

  async recordMetric(userId: string, metric: BodyMetric): Promise<void> {
    if (
      metric.weightKg === undefined &&
      metric.heightCm === undefined &&
      metric.bodyFatPct === undefined
    ) {
      // A reading with no reading in it. Storing it would put a row in the
      // history that the chart cannot plot and the member cannot explain.
      throw new InvalidMetric('a body metric needs at least one measurement');
    }

    const profile = await this.profiles.find(userId);
    if (!profile) throw new ProfileNotFound();

    profile.recordMetric(metric);
    await this.uow.run(() => this.profiles.save(profile));
  }

  /**
   * Replaces the member's photo.
   *
   * The old file is deleted after the new path is saved, not before: a crash
   * between the two leaves an orphaned file, which costs disk, where the other
   * order leaves a profile pointing at a file that is gone, which costs the
   * member their photo.
   */
  async setPhoto(
    userId: string,
    bytes: Buffer,
    mimeType: string,
  ): Promise<{ photoPath: string }> {
    if (bytes.length > MAX_PHOTO_BYTES) {
      throw new PhotoRejected(
        `a photo may be at most ${MAX_PHOTO_BYTES / (1024 * 1024)} MB`,
      );
    }
    if (
      !ACCEPTED_PHOTO_TYPES.includes(
        mimeType as (typeof ACCEPTED_PHOTO_TYPES)[number],
      )
    ) {
      throw new PhotoRejected(`${mimeType} is not an accepted image type`);
    }

    const profile = await this.profiles.find(userId);
    if (!profile) throw new ProfileNotFound();

    const previous = profile.photoPath;
    const photoPath = await this.photos.put(userId, bytes);

    await this.uow.run(async () => {
      profile.update({ photoPath });
      await this.profiles.save(profile);

      // After the commit. The comment above says the old file goes second
      // because an orphaned file costs disk where the other order costs the
      // member their photo; a rolled-back transaction is that same argument
      // with a worse ending, since the row would still point at the old path.
      if (previous && previous !== photoPath) {
        this.uow.onCommit(() =>
          this.photos.remove(previous).catch(() => undefined),
        );
      }
    });

    return { photoPath };
  }
}
