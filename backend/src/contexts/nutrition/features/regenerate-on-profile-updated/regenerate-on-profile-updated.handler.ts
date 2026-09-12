import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/cqrs/domain-event.js';
import { RegenerateTodayHandler } from '../regenerate-today/regenerate-today.handler.js';

/**
 * The profile fields that change what a member may or should be given to eat.
 *
 * `allergies` is the one that matters and the other two are here because FR-013
 * names them: a member who adds a food they dislike has said something about
 * today's lunch as well as tomorrow's.
 *
 * Spelled the way `profile.ProfileUpdated` spells them. A field renamed on one
 * side and not the other silently stops matching, which is a regeneration that
 * quietly never happens — so the spec asserts these names against the profile's
 * own update handler rather than against this set.
 */
const FOOD_FIELDS = new Set(['allergies', 'foodLikes', 'foodDislikes']);

interface ProfileUpdatedPayload {
  changed?: string[];
}

/**
 * A new allergy at noon must not leave almonds on the card all afternoon
 * (FR-013).
 *
 * ## It does nothing unless food changed
 *
 * `profile.ProfileUpdated` carries `changed[]` and fires for a display name, a
 * photo, a time zone. Rebuilding a day's meals because somebody changed their
 * avatar would be a language-model call per photo upload, and in library mode a
 * silently reshuffled lunch.
 *
 * ## Only today
 *
 * Not the week. A future day has not been built yet — `ensure` chooses it on
 * the evening it is first asked for, by which time the new allergy is simply
 * part of the member's profile — and a past day is settled (FR-011). So the one
 * day that exists, is not settled, and was chosen under the old answer is today.
 *
 * ## Idempotent on `eventId`, and that is a real cost rather than tidiness
 *
 * The relay delivers at least once. In suggestion mode a second delivery is a
 * second model call — a GPU second and a token count for an answer already
 * given — and, because a model asked twice answers differently, a member
 * watching their card would see lunch change for no reason they could see.
 *
 * The guard lives on the **day's own row**, not in a separate store, for the
 * reason `usage_log` keys on `eventId` at its index: the check and the write
 * are then the same row, with no window between them and nothing to expire
 * independently of the thing it guards.
 */
@Injectable()
export class RegenerateOnProfileUpdatedHandler {
  private readonly logger = new Logger(RegenerateOnProfileUpdatedHandler.name);

  constructor(private readonly days: RegenerateTodayHandler) {}

  async handle(
    event: DomainEvent,
  ): Promise<'regenerated' | 'not-food' | 'replayed'> {
    const userId = event.userId;
    if (!userId) {
      this.logger.warn(
        `${event.name} ${event.eventId} carries no userId; nothing to rebuild`,
      );
      return 'not-food';
    }

    const changed = (event.payload as ProfileUpdatedPayload)?.changed ?? [];
    if (!changed.some((field) => FOOD_FIELDS.has(field))) return 'not-food';

    const today = await this.days.todayFor(userId, event.occurredAt);
    const half = await this.days.regenerate(
      userId,
      today,
      event.occurredAt,
      event.eventId,
    );

    if (!half.rebuilt) return 'replayed';

    this.logger.log(
      `rebuilt ${userId}'s meals for ${half.date} after ${changed.join(', ')} changed`,
    );
    return 'regenerated';
  }
}
