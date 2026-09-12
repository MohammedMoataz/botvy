import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { ProfileQueryHandler } from '../../profile/features/profile-query/profile.query.js';
import { SessionsInRangeQueryHandler } from '../../training/features/sessions/sessions-in-range.query.js';
import {
  DayTrainingPort,
  MealModePort,
  MemberFoodsPort,
  type DayTraining,
} from '../domain/nutrition.ports.js';

/**
 * Where this context is allowed to know another exists.
 *
 * `infrastructure/` is the one layer constitution IX exempts, because binding a
 * local port to somebody else's *published* surface is exactly its job. Both
 * bindings here go to a `*.query.ts` handler — the published surface — and not
 * to a feature service or a collection, which is the violation even in the
 * permitted direction. `nutrition` was added to `oxlint.json`'s cross-context
 * pattern list in this phase, and the rule was probed by writing a file that
 * should fail and watching it do so.
 */

/**
 * What the member eats and cannot eat.
 *
 * `foodsFor` and never `summary`. Profile publishes both: the prose summary is
 * what a coach prompt reads, and the **lists** are what the allergen gate reads
 * — matching allergen words against a sentence is the fragile thing that ends
 * with a member being handed an allergen, and `foodsFor`'s own comment carries
 * the argument.
 *
 * There is no settings fallback here and that is deliberate, which makes this
 * the one cross-context adapter in the codebase that does *not* follow the
 * `ProfileNextPracticeCutoff` shape. A member with no profile row yet has
 * declared no allergies — which is the same answer as a member who has declared
 * none — and there is no installation-wide default for somebody's allergies that
 * would be anything but a guess. `foodsFor` already answers with empty lists for
 * a missing profile, so the branch would have nothing to do.
 */
@Injectable()
export class ProfileMemberFoods extends MemberFoodsPort {
  constructor(private readonly profiles: ProfileQueryHandler) {
    super();
  }

  async foodsFor(userId: string): Promise<{
    allergies: string[];
    likedFoods: string[];
    dislikedFoods: string[];
  }> {
    return this.profiles.foodsFor(userId);
  }
}

/**
 * Whether the member trains on this date.
 *
 * `everythingOnDate` rather than `onDate`, because the question is *did this
 * member train today* and `onDate` filters to `planned` — a session finished at
 * seven in the morning is exactly the one the day's food should suit, and the
 * planned-only read hides it. A member who trained at dawn would otherwise be
 * fed a rest day. Training grew the second method in this phase for this caller.
 *
 * ## Which statuses count as training
 *
 * `planned` and `completed`. A **cancelled** or **skipped** session is a day the
 * member did not train, whatever the calendar said in advance, and telling the
 * drafter otherwise would suggest a hard day's food for a day spent on the sofa.
 * This is the one place the two readings of "whatever became of it" differ:
 * Training's method returns every status because the *calendar* wants them all,
 * and this adapter is what decides what a training day means to food.
 *
 * ## The first session of the day, not a summary of all of them
 *
 * A member with a morning swim and an evening gym session gets the swim named.
 * The drafter needs a sense of the day rather than an inventory, the rows come
 * back soonest first, and the alternative — joining every session into one
 * `trainingFocus` string — makes a longer prompt that says less. What a second
 * session actually changes about ordinary food is nothing this product is in a
 * position to claim.
 */
@Injectable()
export class TrainingDayTraining extends DayTrainingPort {
  constructor(private readonly sessions: SessionsInRangeQueryHandler) {
    super();
  }

  async trainingOn(userId: string, date: string): Promise<DayTraining | null> {
    const rows = await this.sessions.everythingOnDate(userId, date);
    const trained = rows.find(
      (session) => session.status === 'planned' || session.status === 'completed',
    );
    return trained ? { sport: trained.sport, title: trained.title } : null;
  }
}

/**
 * Which way this member wants their days chosen.
 *
 * The registry default is the fallback rather than a hard-coded `'llm'`: a
 * member whose preferences row the registration bootstrap has not written yet
 * can plausibly reach a briefing in the seconds between the two, and a
 * hard-coded default is a bug by constitution XII. Unlike the allergen lists
 * above, there *is* an honest installation-wide answer to this question — the
 * operator's own default — which is why this adapter has the fallback and that
 * one does not.
 */
@Injectable()
export class ProfileMealMode extends MealModePort {
  constructor(
    private readonly profiles: ProfileQueryHandler,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  async modeFor(userId: string): Promise<'library' | 'llm'> {
    const preferences = await this.profiles.preferencesFor(userId);
    return (
      preferences?.mealMode ?? (await this.settings.get('defaults.mealMode'))
    );
  }
}
