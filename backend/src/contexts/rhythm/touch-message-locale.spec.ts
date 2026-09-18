import { describe, expect, it } from 'vitest';
import {
  DailyPlan,
  type DailyPlanState,
} from './domain/daily-plan.aggregate.js';
import {
  endOfDayMessage,
  morningBriefingMessage,
  planPromptMessage,
  touchNotificationTitle,
} from './domain/touch-message.js';

/**
 * The three daily touches, in the member's own language (E-012).
 *
 * They are composed on the server and **stored**, so they are stored in
 * whichever language composed them — which is why this is a spec about the
 * sentences rather than about a render-time table. Until this change every one
 * of them was English, three times a day, in the middle of an otherwise Arabic
 * interface.
 *
 * The Arabic assertions carry the weight. Agreement is the part a translation
 * table cannot express and the part a naive `{count}` template gets wrong every
 * time, so the two counted nouns these sentences contain — a meeting's minutes
 * and a task's carry-over count — are pinned at 1, 2, 3 and 11, which are the
 * four forms Arabic actually has.
 */

const CAIRO = 'Africa/Cairo';
const DATE = '2026-03-05';

function planOf(overrides: Partial<DailyPlanState> = {}): DailyPlan {
  const at = new Date('2026-03-04T19:00:00Z');
  return DailyPlan.rehydrate({
    userId: 'member-1',
    date: DATE,
    status: 'draft',
    autoConfirmed: false,
    tasks: [],
    meetings: [],
    training: null,
    workoutLine: null,
    mealLine: null,
    mealReason: null,
    promptedAt: null,
    confirmedAt: null,
    summarisedAt: null,
    briefedAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });
}

/** A task due at 20:00 Cairo, carried over `deferCount` times. */
function task(deferCount: number) {
  return {
    id: 'task-1',
    title: 'مراجعة العقد',
    priority: 2,
    dueAt: new Date('2026-03-05T18:00:00Z'),
    deferCount,
  };
}

function meeting(durationMin: number) {
  return {
    meetingId: 'meeting-1',
    title: 'اجتماع الفريق',
    startAt: new Date('2026-03-05T07:00:00Z'),
    durationMin,
  };
}

describe('the evening prompt', () => {
  it('is English for a member who has chosen no language', () => {
    const said = planPromptMessage(planOf(), CAIRO);
    expect(said).toContain('What should tomorrow look like?');
    expect(said).toContain(
      'Confirm, edit it, or ignore this and I will set it at the end of the day.',
    );
  });

  it('is English for a locale there is no table for', () => {
    expect(planPromptMessage(planOf(), CAIRO, 'fr')).toContain(
      'What should tomorrow look like?',
    );
  });

  it('is Arabic for an Arabic-reading member, opening and closing', () => {
    const said = planPromptMessage(planOf(), CAIRO, 'ar');
    expect(said).toContain('كيف تريد أن يكون غدك؟');
    expect(said).toContain('أكِّد، أو عدِّل، أو تجاهل وسأثبّته في آخر اليوم.');
    expect(said).not.toContain('What should tomorrow look like?');
  });

  it('says an empty day plainly in Arabic too', () => {
    const said = planPromptMessage(planOf(), CAIRO, 'ar');
    expect(said).toContain('لا شيء مجدول بعد — لا مهام ولا تدريب.');
  });

  it('names the hour with الساعة rather than "at"', () => {
    const said = planPromptMessage(
      planOf({ tasks: [task(0)] }),
      CAIRO,
      'ar',
    );
    expect(said).toContain('هذا ما لديّ:');
    // 18:00Z is 20:00 in Cairo — the member's clock, not the server's.
    expect(said).toContain('الساعة 20:00');
    expect(said).not.toContain(' at ');
  });
});

/**
 * The four Arabic forms, on the two things these sentences count.
 *
 * `مرة واحدة` at one and the dual `مرتين` at two carry no digit at all; three
 * to ten take the digit with the plural; eleven takes the digit with the
 * singular back. A template that appended a plural to a number would get three
 * of the four wrong.
 */
describe('Arabic number agreement in a touch', () => {
  function carriedClause(deferCount: number): string {
    return planPromptMessage(
      planOf({ tasks: [task(deferCount)] }),
      CAIRO,
      'ar',
    );
  }

  it('says مرة واحدة for a task carried over once', () => {
    expect(carriedClause(1)).toContain('(مؤجّلة مرة واحدة)');
  });

  it('uses the dual for twice, with no digit', () => {
    expect(carriedClause(2)).toContain('(مؤجّلة مرتين)');
    // The digit must not be there: "2 مرات" is the mistake this exists to stop,
    // and the line carries other digits (the priority, the clock) that are not.
    expect(carriedClause(2)).not.toContain('مؤجّلة 2');
  });

  it('takes the plural at three', () => {
    expect(carriedClause(3)).toContain('(مؤجّلة 3 مرات)');
  });

  it('returns to the singular at eleven', () => {
    expect(carriedClause(11)).toContain('(مؤجّلة 11 مرةً)');
  });

  function meetingLine(durationMin: number): string {
    return planPromptMessage(
      planOf({ tasks: [task(0)], meetings: [meeting(durationMin)] }),
      CAIRO,
      'ar',
    );
  }

  it('counts a meeting’s minutes with the same four forms', () => {
    expect(meetingLine(1)).toContain('(دقيقة)');
    expect(meetingLine(2)).toContain('(دقيقتين)');
    expect(meetingLine(3)).toContain('(3 دقائق)');
    expect(meetingLine(11)).toContain('(11 دقيقةً)');
    // And the ordinary case, which is on the far side of ten.
    expect(meetingLine(30)).toContain('(30 دقيقةً)');
  });

  it('heads the meetings list in Arabic', () => {
    expect(meetingLine(30)).toContain('المواعيد:');
    expect(meetingLine(30)).not.toContain('Meetings:');
  });
});

describe('the end-of-day summary', () => {
  it('says what tomorrow holds in Arabic, including no training', () => {
    const said = endOfDayMessage(
      planOf({ status: 'confirmed', tasks: [task(0)] }),
      CAIRO,
      false,
      'ar',
    );
    expect(said).toContain('غدًا جاهز.');
    expect(said).toContain('أهم الأولويات:');
    expect(said).toContain('لا تدريب غدًا.');
  });

  it('asks the check-in question in Arabic when it is asked at all', () => {
    const said = endOfDayMessage(planOf(), CAIRO, true, 'ar');
    expect(said).toContain('كيف كان يومك؟ هل التزمت بالخطة، وكيف تشعر من 100؟');
  });

  it('says so in Arabic when it set the plan from the draft', () => {
    const said = endOfDayMessage(
      planOf({ status: 'confirmed', autoConfirmed: true }),
      CAIRO,
      false,
      'ar',
    );
    expect(said).toContain('لم تردّ، فثبّتُّه من المسودة.');
  });

  it('is unchanged in English', () => {
    const said = endOfDayMessage(planOf(), CAIRO, true);
    expect(said).toContain("Tomorrow's set.");
    expect(said).toContain(
      'How did today go? Did you follow the plan, and how are you feeling out of 100?',
    );
  });
});

describe('the morning briefing', () => {
  it('greets in Arabic and names the training slot', () => {
    const said = morningBriefingMessage(
      planOf({
        tasks: [task(0)],
        training: {
          sessionId: 'session-1',
          title: 'تمرين الجزء العلوي',
          sport: 'gym',
          startAt: new Date('2026-03-05T16:00:00Z'),
        },
      }),
      CAIRO,
      'ar',
    );
    expect(said).toContain('صباح الخير. اليوم:');
    expect(said).toContain('التدريب: تمرين الجزء العلوي (gym) الساعة 18:00');
  });

  it('says a clear day in Arabic', () => {
    expect(morningBriefingMessage(planOf(), CAIRO, 'ar')).toContain(
      'لا مهام ولا تدريب. يوم خالٍ.',
    );
  });
});

/**
 * Nutrition's three codes, rendered where the sentence is composed.
 *
 * The *code* is what `daily_plans.mealReason` stores, precisely so a client can
 * render it itself; these are the words this file puts on it when it writes a
 * message row, and there is no reason for them to be the one English clause
 * left in an Arabic transcript.
 */
describe('the meal half', () => {
  const codes: Array<[string, string]> = [
    ['allergen', 'لم أجد اقتراحًا يخلو مما لديك حساسية منه.'],
    ['empty_library', 'قائمة وجباتك فارغة. أضِف بعضها وسأستخدمها.'],
    ['model_unavailable', 'لم أستطع الوصول إلى النموذج.'],
    ['something_new', 'لم أستطع تجهيز قائمة.'],
  ];

  for (const [code, sentence] of codes) {
    it(`says why in Arabic when the reason is ${code}`, () => {
      const said = planPromptMessage(
        planOf({ mealReason: code }),
        CAIRO,
        'ar',
      );
      expect(said).toContain('الوجبات: لا شيء —');
      expect(said).toContain(sentence);
    });
  }

  it('labels a real meal line in Arabic', () => {
    const said = planPromptMessage(
      planOf({ mealLine: 'فول، دجاج مشوي' }),
      CAIRO,
      'ar',
    );
    expect(said).toContain('الوجبات: فول، دجاج مشوي');
  });
});

describe('the notification banner', () => {
  it('follows the same locale as the message under it', () => {
    expect(touchNotificationTitle('plan')).toBe('Plan tomorrow');
    expect(touchNotificationTitle('plan', 'ar')).toBe('خطّط للغد');
    expect(touchNotificationTitle('end_of_day', 'ar')).toBe('خطة الغد جاهزة');
    expect(touchNotificationTitle('morning', 'ar')).toBe('يومك');
  });
});
