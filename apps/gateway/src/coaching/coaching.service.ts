import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  allergyViolations,
  checkinStillOpen,
  completionRatio,
  currentStreak,
  isRestDay,
  localDate,
  mayOverwrite,
  muscleGroupsToAvoid,
} from './adherence.js';
import { DEFAULT_TIMEZONE } from '../common/time.js';
import { SettingsService } from '../settings/settings.service.js';

export interface CoachingContext {
  streak: number;
  completionRatio: number;
  today: string;
  isRestDay: boolean;
  avoidMuscleGroups: string[];
}

@Injectable()
export class CoachingService {
  private readonly logger = new Logger(CoachingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  getProfile(userId: string) {
    return this.prisma.coachingProfile.findUnique({ where: { userId } });
  }

  /**
   * The one timezone every user-facing time is resolved against — reminders
   * included, not just coaching. A user who has never opened coaching still
   * gets a profile row the first time the phone reports its zone.
   */
  async userTimezone(userId: string): Promise<string> {
    const profile = await this.prisma.coachingProfile.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    return profile?.timezone ?? DEFAULT_TIMEZONE;
  }

  /**
   * Merges extracted fields into the profile. Only keys actually present
   * are written, so a partial extraction never clears fields the model
   * simply did not mention.
   */
  async upsertProfile(userId: string, patch: Record<string, unknown>) {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined && v !== null),
    );
    return this.prisma.coachingProfile.upsert({
      where: { userId },
      create: { userId, ...clean },
      update: clean,
    });
  }

  /** Streak, adherence and scheduling facts to inject into the coaching prompt. */
  async context(userId: string, now: Date = new Date()): Promise<CoachingContext> {
    const profile = await this.prisma.coachingProfile.findUnique({ where: { userId } });
    const timezone = profile?.timezone ?? DEFAULT_TIMEZONE;
    const today = localDate(now, timezone);

    const [checkins, recentWorkouts] = await Promise.all([
      this.prisma.checkIn.findMany({
        where: { userId },
        orderBy: { checkinDate: 'desc' },
        take: 30,
      }),
      this.prisma.workoutRecord.findMany({
        where: { userId },
        orderBy: { workoutDate: 'desc' },
        take: 7,
      }),
    ]);

    return {
      streak: currentStreak(checkins, today),
      completionRatio: completionRatio(checkins, today),
      today,
      isRestDay: isRestDay(today, profile?.trainingDays ?? []),
      avoidMuscleGroups: muscleGroupsToAvoid(recentWorkouts, today),
    };
  }

  /** True when a reply should be interpreted as an answer to the nightly check-in. */
  async isAwaitingCheckin(userId: string, now: Date = new Date()): Promise<boolean> {
    const profile = await this.prisma.coachingProfile.findUnique({ where: { userId } });
    if (!profile?.awaitingCheckin) return false;
    const windowHours = await this.settings.get('coaching.checkinWindowHours');
    return checkinStillOpen(profile.awaitingSince, now, windowHours * 3_600_000);
  }

  /** Records the day's outcome. Idempotent per user per local date. */
  async recordCheckin(
    userId: string,
    adhered: boolean,
    rawReply: string,
    now: Date = new Date(),
  ) {
    const profile = await this.prisma.coachingProfile.findUnique({ where: { userId } });
    const checkinDate = localDate(now, profile?.timezone ?? DEFAULT_TIMEZONE);

    const [record] = await this.prisma.$transaction([
      this.prisma.checkIn.upsert({
        where: { userId_checkinDate: { userId, checkinDate } },
        create: { userId, checkinDate, adhered, rawReply },
        update: { adhered, rawReply },
      }),
      this.prisma.coachingProfile.update({
        where: { userId },
        data: { awaitingCheckin: false, awaitingSince: null },
      }),
    ]);
    return record;
  }

  /**
   * Stores a workout for a date, refusing to let a generated plan replace a
   * session the user reported actually doing.
   */
  async recordWorkout(
    userId: string,
    input: {
      workoutDate: string;
      source: 'reported' | 'planned';
      exercises?: string[];
      muscleGroups?: string[];
      notes?: string;
    },
  ) {
    const existing = await this.prisma.workoutRecord.findUnique({
      where: { userId_workoutDate: { userId, workoutDate: input.workoutDate } },
    });

    if (!mayOverwrite(existing?.source ?? null, input.source)) {
      this.logger.log(
        `keeping reported workout for ${userId} on ${input.workoutDate}; refused to overwrite with a plan`,
      );
      return existing;
    }

    return this.prisma.workoutRecord.upsert({
      where: { userId_workoutDate: { userId, workoutDate: input.workoutDate } },
      create: { userId, ...input },
      update: input,
    });
  }

  /**
   * Gate a generated plan before delivery. A plan containing a declared
   * allergen is withheld — the predecessor appended a warning and sent it
   * anyway, which is the behaviour this exists to prevent.
   */
  async planIsSafe(userId: string, planText: string): Promise<{ safe: boolean; violations: string[] }> {
    const profile = await this.prisma.coachingProfile.findUnique({ where: { userId } });
    const violations = allergyViolations(planText, profile?.allergies ?? []);
    return { safe: violations.length === 0, violations };
  }

  /** Users who have opted in — the population the nightly cycle operates over. */
  optedInUsers() {
    return this.prisma.coachingProfile.findMany({
      where: { optedIn: true },
      include: { user: { include: { devices: true } } },
    });
  }

  markAwaitingCheckin(userId: string, now: Date = new Date()) {
    return this.prisma.coachingProfile.update({
      where: { userId },
      data: { awaitingCheckin: true, awaitingSince: now },
    });
  }
}
