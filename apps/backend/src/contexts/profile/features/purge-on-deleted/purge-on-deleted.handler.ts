import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import {
  PhotoStore,
  PreferencesRepository,
  ProfileRepository,
} from '../../domain/profile.repository.js';

/**
 * Removes everything this context holds about a deleted member.
 *
 * Reacts to `identity.UserDeleted`. Identity soft-deletes its own row so the id
 * keeps resolving; this side deletes outright, because a profile is the
 * member's own data and "deleted" has to mean gone.
 *
 * Idempotent, and it has to be: the relay delivers at least once, so two
 * deliveries must collapse to one purge and the second must be a no-op rather
 * than an error.
 *
 * The photo path is read from the profile *before* the profile is removed. The
 * other order loses the path and leaves the file on the media volume for ever
 * — and unlike a stray database row, nothing else would ever find it.
 */
@Injectable()
export class PurgeOnDeletedHandler {
  private readonly logger = new Logger(PurgeOnDeletedHandler.name);

  constructor(
    private readonly profiles: ProfileRepository,
    private readonly preferences: PreferencesRepository,
    private readonly photos: PhotoStore,
  ) {}

  async handle(event: DomainEvent): Promise<'purged' | 'nothing-to-do'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(`${event.name} ${event.eventId} carries no userId; nothing to purge`);
      return 'nothing-to-do';
    }

    const profile = await this.profiles.find(userId);
    const photoPath = profile?.photoPath ?? null;

    const [profileRemoved, preferencesRemoved] = await Promise.all([
      this.profiles.remove(userId),
      this.preferences.remove(userId),
    ]);

    if (photoPath) await this.photos.remove(photoPath);

    if (!profileRemoved && !preferencesRemoved) return 'nothing-to-do';

    this.logger.log(`purged profile data for ${userId}`);
    return 'purged';
  }
}
