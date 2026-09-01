import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { DEFAULT_TIMEZONE, localDate } from '../common/time.js';
import { CoachingService } from './coaching.service.js';

export interface NightlyResult {
  considered: number;
  sent: number;
  skippedRestDay: number;
  withheldUnsafe: number;
}

/**
 * Injected rather than called directly so the scheduling, safety and
 * persistence rules stay testable without a model.
 */
export type ProgramFn = (input: {
  userId: string;
  avoidMuscleGroups: string[];
  profile: unknown;
}) => Promise<{ text: string; exercises: string[]; muscleGroups: string[] } | null>;

export interface TickResult {
  considered: number;
  checkinsSent: number;
  programsSent: number;
}

/** Local wall-clock time as HH:mm, for comparing against a user's setting. */
function localHhMm(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
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
    private readonly settings: SettingsService,
  ) {}

  /** Notification wording in the user's language, falling back to English. */
  private async copyFor(language: string | null | undefined) {
    const copy = await this.settings.get('push.copy');
    const lang = language ?? 'en';
    return (key: string, fallback: string): string => {
      const entry = (copy as Record<string, Record<string, string>>)[key];
      return entry?.[lang] ?? entry?.en ?? fallback;
    };
  }

  /** Asks one user whether they adhered today. Returns pushes delivered. */
  private async checkinOne(
    profile: { userId: string; language?: string | null; user: { devices: { fcmToken: string | null }[] } },
    now: Date,
  ): Promise<number> {
    const tokens = profile.user.devices.map((d) => d.fcmToken).filter((t): t is string => !!t);

    await this.coaching.markAwaitingCheckin(profile.userId, now);

    if (tokens.length === 0) return 0;
    const t = await this.copyFor(profile.language);
    const result = await this.push.send(tokens, {
      title: t('checkinTitle', 'Evening check-in'),
      body: t('checkinBody', 'Did you train and eat as planned today?'),
      data: { type: 'checkin' },
    });
    return result.delivered;
  }

  /** Asks every opted-in user whether they adhered today. */
  async askCheckins(now: Date = new Date()): Promise<NightlyResult> {
    const profiles = await this.coaching.optedInUsers();
    let sent = 0;
    for (const profile of profiles) sent += await this.checkinOne(profile, now);
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
    generate: ProgramFn,
    now: Date = new Date(),
  ): Promise<NightlyResult> {
    const profiles = await this.coaching.optedInUsers();
    let sent = 0;
    let skippedRestDay = 0;
    let withheldUnsafe = 0;

    for (const profile of profiles) {
      const one = await this.programOne(profile, generate, now);
      sent += one.sent;
      skippedRestDay += one.skippedRestDay;
      withheldUnsafe += one.withheldUnsafe;
    }

    return { considered: profiles.length, sent, skippedRestDay, withheldUnsafe };
  }

  /** The program cycle for a single user. */
  private async programOne(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile: any,
    generate: ProgramFn,
    now: Date,
  ): Promise<{ sent: number; skippedRestDay: number; withheldUnsafe: number }> {
    const none = { sent: 0, skippedRestDay: 0, withheldUnsafe: 0 };
    const context = await this.coaching.context(profile.userId, now);
    const tokens = profile.user.devices
      .map((d: { fcmToken: string | null }) => d.fcmToken)
      .filter((t: string | null): t is string => !!t);
    const t = await this.copyFor(profile.language);

    if (context.isRestDay) {
      if (tokens.length > 0) {
        await this.push.send(tokens, {
          title: t('restTitle', 'Rest day'),
          body: t('restBody', 'No training scheduled today — rest up.'),
          data: { type: 'rest_day' },
        });
      }
      return { ...none, skippedRestDay: 1 };
    }

    const program = await generate({
      userId: profile.userId,
      avoidMuscleGroups: context.avoidMuscleGroups,
      profile,
    });
    if (!program) return none;

    const safety = await this.coaching.planIsSafe(profile.userId, program.text);
    if (!safety.safe) {
      // Withheld, not delivered with a warning attached.
      this.logger.warn(
        `withheld program for ${profile.userId}: contains declared allergen(s) ${safety.violations.join(', ')}`,
      );
      return { ...none, withheldUnsafe: 1 };
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

    if (tokens.length === 0) return none;
    const result = await this.push.send(tokens, {
      title: t('programTitle', "Today's program"),
      body: program.text.slice(0, 240),
      data: { type: 'program' },
    });
    return { ...none, sent: result.delivered };
  }

  /**
   * Runs every few minutes and decides, per user, whether their own local
   * check-in or program time has arrived.
   *
   * This replaces two server-wide cron triggers, which could only ever fire at
   * one clock time for everybody — a 21:00 that meant 21:00 in n8n's timezone
   * and something else for the user. The date columns make it idempotent: the
   * date is claimed before anything is sent, so a tick that runs every five
   * minutes still asks once, and a gateway that was down at 21:00 catches up
   * when it returns rather than skipping the day.
   */
  async tick(generate: ProgramFn, now: Date = new Date()): Promise<TickResult> {
    const profiles = await this.coaching.optedInUsers();
    const [defaultCheckin, defaultProgram, defaultTz] = await Promise.all([
      this.settings.get('coaching.checkinTime'),
      this.settings.get('coaching.programTime'),
      this.settings.get('defaults.timezone'),
    ]);

    let checkinsSent = 0;
    let programsSent = 0;

    for (const profile of profiles) {
      const timezone = profile.timezone ?? defaultTz ?? DEFAULT_TIMEZONE;
      const today = localDate(now, timezone);
      const nowHhMm = localHhMm(now, timezone);

      const checkinAt = profile.checkinTime ?? defaultCheckin;
      if (nowHhMm >= checkinAt && profile.lastCheckinSentDate !== today) {
        await this.prisma.coachingProfile.update({
          where: { userId: profile.userId },
          data: { lastCheckinSentDate: today },
        });
        checkinsSent += await this.checkinOne(profile, now);
      }

      const programAt = profile.programTime ?? defaultProgram;
      if (nowHhMm >= programAt && profile.lastProgramSentDate !== today) {
        await this.prisma.coachingProfile.update({
          where: { userId: profile.userId },
          data: { lastProgramSentDate: today },
        });
        programsSent += (await this.programOne(profile, generate, now)).sent;
      }
    }

    await this.prisma.setting.upsert({
      where: { key: 'ops.lastCoachingTickAt' },
      create: { key: 'ops.lastCoachingTickAt', value: { at: now.toISOString() } },
      update: { value: { at: now.toISOString() } },
    });

    return { considered: profiles.length, checkinsSent, programsSent };
  }
}
