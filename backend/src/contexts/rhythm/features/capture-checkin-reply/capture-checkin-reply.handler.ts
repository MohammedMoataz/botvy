import { Injectable } from '@nestjs/common';
import {
  classifyCheckin,
  extractMood,
  type CheckinVerdict,
} from '../../domain/checkin-classifier.js';
import { RhythmStateRepository } from '../../domain/rhythm.repositories.js';
import { RecordCheckinHandler } from '../record-checkin/record-checkin.handler.js';
import { TickHandler } from '../tick/tick.handler.js';

export interface CaptureCheckinReplyInput {
  userId: string;
  /**
   * The kind of conversation the sentence was typed in, as the caller already
   * knows it.
   *
   * A `string` and a *parameter*, not a conversation id this handler looks up,
   * and that is constitution IX rather than convenience. Answering "is this the
   * member's coach chat" from in here would mean a `features/` file importing
   * the Conversations context — which `no-restricted-imports` refuses outright,
   * and rightly: the caller is P4's chat gateway, which is already holding the
   * conversation it has just routed a message for, so the lookup would be a
   * second read of a row the caller has in hand and a dependency edge between
   * two contexts to pay for it. If the check ever has to be made independently
   * of the caller, the shape is a `ConversationKindPort` declared in this
   * context's `domain/` and bound in its own `infrastructure/` — never an
   * import.
   */
  conversationKind: string;
  text: string;
}

export type CaptureRefusal =
  /** Typed somewhere other than the coach chat. SC-004. */
  | 'not_coach'
  /** No question is outstanding, so a sentence is just a sentence. */
  | 'not_awaiting'
  /** The question was asked too long ago; the window has been closed. */
  | 'expired'
  /** A real reply that does not say yes or no. The caller answers it normally. */
  | 'unclear';

export type CaptureCheckinReplyResult =
  | {
      captured: true;
      verdict: CheckinVerdict;
      date: string;
      mood: number | null;
      streak: number;
    }
  | { captured: false; reason: CaptureRefusal };

/**
 * A sentence in the coach chat, read as an answer to tonight's check-in — or not.
 *
 * The command P4's chat gateway calls before it takes an ordinary turn. It is a
 * rhythm command specced here rather than a branch inside that gateway because
 * the rule it enforces is about the rhythm's state rather than about chat, and
 * because all four of its exits have to be provable now: the gateway arrives a
 * phase later and will be written against whatever this returns.
 *
 * ## Three guards, all required, none redundant
 *
 * Each is a different way a member loses their streak to a false positive, and
 * dropping any one of them is a defect the other two do not cover:
 *
 * 1. **The member's own `coach` conversation.** SC-004 is "zero check-ins
 *    recorded from messages outside the coach conversation", and the words that
 *    count are ordinary English and Arabic: `no`, `not`, `rest`, `done`, `did`,
 *    `تمام`, `ما`. A member typing "no, move it to Friday" in their planner
 *    chat, or "did that already" in any free chat P4 adds, would otherwise be
 *    recorded as answering a question that chat never asked — and `no` zeroes a
 *    nine-day run.
 * 2. **`awaitingCheckin` is set.** The flag is one per member, written by the
 *    end-of-day touch. Without it, "not now" typed into the coach chat at two
 *    in the afternoon is a missed day.
 * 3. **The window is still open.** `settings.rhythm.checkinWindowHours`,
 *    measured from `awaitingSince`, because a flag with no timestamp is how a
 *    reply typed three days later gets recorded against tonight — filed under
 *    today's date, which is not the day it is about.
 *
 * The window check is delegated to `TickHandler.expireStaleCheckin`, which the
 * comment on it names this caller for: it reads the setting, applies the same
 * arithmetic and *closes* the stale window as it finds it. A second copy of "is
 * twelve hours up" here is how the tick's housekeeping and this guard come to
 * disagree about which replies count.
 *
 * ## `unclear` falls through rather than guessing
 *
 * The classifier decides most replies without a model call and returns
 * `unclear` for anything genuinely ambiguous. That is reported as a refusal
 * with the window left **open**, so the caller answers the member normally and
 * their next sentence can still be the answer. Recording a guessed verdict
 * costs the member their streak; asking again costs a sentence. Which is also
 * why the window is not closed on an unclear reply — that would be the quiet
 * version of the same mistake.
 *
 * Negation wins inside the classifier, for the recorded reason: "yeah, I didn't
 * manage it" is a miss.
 */
@Injectable()
export class CaptureCheckinReplyHandler {
  constructor(
    private readonly states: RhythmStateRepository,
    private readonly tick: TickHandler,
    private readonly record: RecordCheckinHandler,
  ) {}

  async handle(
    input: CaptureCheckinReplyInput,
    now: Date = new Date(),
  ): Promise<CaptureCheckinReplyResult> {
    if (input.conversationKind !== 'coach') {
      return { captured: false, reason: 'not_coach' };
    }

    const state = await this.states.find(input.userId);
    if (!state?.awaitingCheckin) {
      return { captured: false, reason: 'not_awaiting' };
    }

    if (await this.tick.expireStaleCheckin(state, now)) {
      return { captured: false, reason: 'expired' };
    }

    const verdict = classifyCheckin(input.text);
    if (verdict === 'unclear') {
      return { captured: false, reason: 'unclear' };
    }

    // The date is left to `record-checkin`, which resolves the member's own
    // local today. Resolving it here would put a second copy of that decision
    // in the codebase, and the two would differ around midnight — which is
    // exactly when a check-in reply arrives.
    const recorded = await this.record.handle(
      {
        userId: input.userId,
        adhered: verdict === 'adhered',
        // `undefined` rather than the classifier's `null`: `null` means "clear
        // it" to the aggregate, so a member who set a mood of 40 on the card
        // and then typed a bare "yes" would have that mood erased by their own
        // second answer.
        mood: extractMood(input.text) ?? undefined,
        source: 'chat',
      },
      now,
    );

    return {
      captured: true,
      verdict,
      date: recorded.date,
      mood: recorded.mood,
      streak: recorded.streak,
    };
  }
}
