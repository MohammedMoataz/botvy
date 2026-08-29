import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { CoachingService } from './coaching.service.js';

export interface NightlyResult {
  considered: number;
  sent: number;
  skippedRestDay: number;
  withheldUnsafe: number;
}

/**
 * Drives the nightly coaching cycle. n8n triggers these on a schedule; all
 * selection and delivery happens here, so n8n stays credential- and
 * data-light (constitution II).
 *
 * Deliberately ONE cycle, unlike the predecessor which sent two nightly
 * messages — tomorrow's program right after the check-in reply, and today's
 * again an hour later.
 */
@Injectable()
export class NightlyService {
  private readonly logger = new Logger(NightlyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly coaching: CoachingService,
  ) {}

  /** Asks every opted-in user whether they adhered today. */
  async askCheckins(now: Date = new Date()): Promise<NightlyResult> {
    const profiles = await this.coaching.optedInUsers();
    let sent = 0;

    for (const profile of profiles) {
      const tokens = profile.user.devices
        .map((d) => d.fcmToken)
        .filter((t): t is string => !!t);

      await this.coaching.markAwaitingCheckin(profile.userId, now);

      if (tokens.length === 0) continue;
      const result = await this.push.send(tokens, {
        title: 'Evening check-in',
        body: 'Did you train and eat as planned today?',
        data: { type: 'checkin' },
      });
      sent += result.delivered;
    }

    return { considered: profiles.length, sent, skippedRestDay: 0, withheldUnsafe: 0 };
  }

  /**
   * Pushes tomorrow's program to every opted-in user, skipping rest days and
   * withholding any plan that violates a declared allergy.
   *
   * `generate` is injected rather than called directly so the scheduling,
   * safety and persistence rules are testable without a model.
   */
  async pushPrograms(
    generate: (input: {
      userId: string;
      avoidMuscleGroups: string[];
      profile: unknown;
    }) => Promise<{ text: string; exercises: string[]; muscleGroups: string[] } | null>,
    now: Date = new Date(),
  ): Promise<NightlyResult> {
    const profiles = await this.coaching.optedInUsers();
    let sent = 0;
    let skippedRestDay = 0;
    let withheldUnsafe = 0;

    for (const profile of profiles) {
      const context = await this.coaching.context(profile.userId, now);
      const tokens = profile.user.devices
        .map((d) => d.fcmToken)
        .filter((t): t is string => !!t);

      if (context.isRestDay) {
        skippedRestDay += 1;
        if (tokens.length > 0) {
          await this.push.send(tokens, {
            title: 'Rest day',
            body: 'No training scheduled today — rest up.',
            data: { type: 'rest_day' },
          });
        }
        continue;
      }

      const program = await generate({
        userId: profile.userId,
        avoidMuscleGroups: context.avoidMuscleGroups,
        profile,
      });
      if (!program) continue;

      const safety = await this.coaching.planIsSafe(profile.userId, program.text);
      if (!safety.safe) {
        // Withheld, not delivered with a warning attached.
        withheldUnsafe += 1;
        this.logger.warn(
          `withheld program for ${profile.userId}: contains declared allergen(s) ${safety.violations.join(', ')}`,
        );
        continue;
      }

      await this.coaching.recordWorkout(profile.userId, {
        // context.today, not a freshly computed date: the rest-day decision
        // above was made against that same day. Recomputing here would let a
        // run straddling local midnight check one date and store another.
        workoutDate: context.today,
        source: 'planned',
        exercises: program.exercises,
        muscleGroups: program.muscleGroups,
      });

      if (tokens.length > 0) {
        const result = await this.push.send(tokens, {
          title: "Today's program",
          body: program.text.slice(0, 240),
          data: { type: 'program' },
        });
        sent += result.delivered;
      }
    }

    return { considered: profiles.length, sent, skippedRestDay, withheldUnsafe };
  }
}
