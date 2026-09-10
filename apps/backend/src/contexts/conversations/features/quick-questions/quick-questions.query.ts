import { Injectable } from '@nestjs/common';
import type { ConversationKind } from '../../domain/conversation.aggregate.js';
import {
  QuickQuestionRepository,
  type QuickQuestion,
  type QuickQuestionMood,
} from '../../domain/quick-question.repository.js';
import { LatestCheckinPort } from '../../domain/chat.ports.js';

/** What a chip looks like on screen. */
export interface QuickQuestionView {
  id: string;
  scope: string;
  /** Already resolved to the member's locale. */
  text: string;
  mood: QuickQuestionMood;
  /** True for the member's own, so the client can offer to remove it. */
  isMine: boolean;
}

/**
 * The tappable questions a chat offers, in the order they should appear.
 *
 * ## They move with the member's mood, and that is the whole feature
 *
 * FR-010: after a low check-in the coach offers gentler options. So the last
 * check-in's mood is read — through `LatestCheckinPort`, which is bound to
 * Rhythm's own `checkins` query and **never** to Rhythm's collection — and the
 * questions whose `mood` matches it are sorted to the front.
 *
 * Sorted to the front rather than filtered to only themselves, deliberately. A
 * member having a bad day should be *offered* the lighter option first, not
 * prevented from asking about their programme; hiding the ordinary questions
 * would be the app deciding what they are allowed to want.
 *
 * ## A missing check-in is not a low mood
 *
 * A member who has never answered one, or who answered with a verdict and no
 * mood, gets the plain order. That is why the port returns `null` rather than a
 * default number: `?? 50` would put every new member into the "ok" bucket by
 * accident, and `?? 0` would greet them all with a lighter day.
 */
@Injectable()
export class QuickQuestionsQueryHandler {
  constructor(
    private readonly questions: QuickQuestionRepository,
    private readonly checkins: LatestCheckinPort,
  ) {}

  async handle(
    userId: string,
    scope: ConversationKind,
    locale = 'en',
  ): Promise<QuickQuestionView[]> {
    const [rows, mood] = await Promise.all([
      this.questions.forMember(userId, scope),
      this.checkins.latestMood(userId),
    ]);

    const bucket = bucketFor(mood);
    return sortForMood(rows, bucket).map((row) => ({
      id: row.id,
      scope: row.scope,
      // Arabic when the member reads Arabic, and English otherwise. Both are
      // stored on every row, because the seeded set is shown to everybody and a
      // chip that fell back to English on an Arabic screen is exactly the
      // defect `enhancements/E-012` describes for the coach's own sentences.
      text: locale.startsWith('ar') ? row.text.ar : row.text.en,
      mood: row.mood,
      isMine: row.userId !== null,
    }));
  }
}

/**
 * Which bucket a mood falls in, or null when there is no mood to read.
 *
 * The boundary is 40 out of 100, and it is a constant rather than a setting for
 * the reason the extraction temperature is: an operator moving it would change
 * which questions a member is offered with no way to see the effect, and the
 * only honest way to tune it is to change the questions themselves — which the
 * seed and the Owner's own additions already allow.
 */
export function bucketFor(mood: number | null): QuickQuestionMood | null {
  if (mood === null) return null;
  return mood < 40 ? 'low' : 'ok';
}

/**
 * `any` keeps its place; the matching bucket is lifted above it; the other
 * bucket sinks below.
 *
 * A stable sort over one key rather than a rebuild of the list, so the
 * `order` the Owner set inside each group survives — the seed leaves gaps in
 * `order` precisely so a later question can sit between two, and a sort that
 * ignored it would throw that away.
 */
export function sortForMood(
  rows: QuickQuestion[],
  bucket: QuickQuestionMood | null,
): QuickQuestion[] {
  if (!bucket) return [...rows];
  const rank = (row: QuickQuestion): number => {
    if (row.mood === bucket) return 0;
    if (row.mood === 'any') return 1;
    return 2;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}
