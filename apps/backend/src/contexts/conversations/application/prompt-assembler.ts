import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { localDate, localHhMm } from '../../../shared/time/time.js';
import {
  MemberDayPort,
  PromptAssemblerPort,
  type MemberDay,
  type MemberFacts,
} from '../domain/chat.ports.js';
import { MessageRepository } from '../domain/conversations.repositories.js';
import { renderPrompt } from '../../../shared/templates/prompt-files.js';
import { delimitQuoted } from './prompt-files.js';

/**
 * How far back the history read is willing to scan for the tail of a
 * conversation.
 *
 * `MessageRepository.inConversation` sorts **ascending** by `seq` and applies
 * the limit — both adapters do, the Mongo one with `.sort({ seq: 1 }).limit()`
 * — so asking it for twenty rows returns the *oldest* twenty after the clear
 * watermark. For any chat longer than the limit that is the beginning of the
 * conversation, forever: the prompt would carry the first twenty messages a
 * member ever sent and never the turn before this one. (The port's own doc
 * comment says "newest-first", which is what a caller would reasonably build
 * against and is not what either adapter does. Reported rather than worked
 * around silently.)
 *
 * So this reads a bounded window from the watermark and keeps its tail. The cap
 * is what makes that safe rather than unbounded.
 *
 * ponytail: a scan cap, not a fix. It is correct for every conversation with
 * fewer than five hundred messages since its last clear, which is every
 * conversation for a long time, and it costs one bounded read per turn. The
 * real fix is in `infrastructure/`, which this phase's application layer does
 * not own: either `inConversation` sorts descending (matching its own
 * documentation) or the port gains a `latestInConversation`. Whichever lands,
 * this constant and the `slice` go with it.
 */
const HISTORY_SCAN_CAP = 500;

/**
 * Builds the messages a chat turn sends to the model: one system prompt from
 * the member's own facts and day, the recent transcript, and their message.
 *
 * ## Which template, and why it is the conversation's kind that picks it
 *
 * Not the intent, and not a guess about the subject. The pinned `coach` and
 * `planner` chats each have a voice and a set of standing instructions —
 * `planner.md` says outright that it cannot create anything, because by the
 * time a turn reaches the model in that chat the extractor has already decided
 * it was not an instruction — and a `free` chat gets `chat.md`, which is
 * allowed to be a general assistant. A template chosen per turn would let one
 * conversation answer in two voices.
 *
 * ## An unrecorded field is absent, never "unknown"
 *
 * FR-006, and it is the reason `{{profile}}` comes from
 * `MemberFactsPort.summary` — prose Profile composes from the fields the member
 * actually filled in — rather than from a template with a slot per field. A
 * model handed "weight: unknown, goal: unknown" writes about the unknowns: it
 * asks for all of them at once, or worse, reasons about a person with no
 * weight. Handed three sentences about a real person it uses them. When the
 * member has recorded nothing at all the prompt says so in one line and tells
 * the model to ask for one thing at a time, which is the behaviour FR-006
 * actually wants.
 *
 * Allergies are appended separately and always, even though Profile's summary
 * may mention them: they are the one fact in the block that is a prohibition
 * rather than context, both prompts refer to them as such, and `AllergenGuard`
 * checks the answer against the same list on the way out. A prompt instruction
 * is not a control — this is the half that asks nicely.
 */
@Injectable()
export class PromptAssembler extends PromptAssemblerPort {
  constructor(
    private readonly day: MemberDayPort,
    private readonly messages: MessageRepository,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  override async build(input: {
    userId: string;
    kind: string;
    text: string;
    conversationId: string;
    floorSeq: number;
    now: Date;
    facts: MemberFacts;
  }): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
    const { userId, kind, text, conversationId, floorSeq, now, facts } = input;

    const [day, historyLimit] = await Promise.all([
      this.day.forMember(userId, now),
      this.settings.get('chat.historyLimit'),
    ]);

    /*
     * Every user-facing moment resolved here, against the member's zone, and
     * not taken from `MemberDay.today` even though it carries one.
     *
     * Principle XI, and the concrete reason is that `MemberDay` is composed by
     * another context: two sources for "what day is it for this member" is one
     * source too many, and the day the *prompt* states has to be the same day
     * the extractor resolved "tomorrow" against or the two disagree inside a
     * single turn. The API's own `TZ` is never consulted — reading it once
     * shifted every extracted reminder by three hours.
     */
    const today = localDate(now, facts.timezone);
    const system = renderPrompt(templateFor(kind), {
      profile: profileBlock(facts),
      day: dayBlock(day),
      today,
      now: localHhMm(now, facts.timezone),
      timezone: facts.timezone,
    });

    const history = await this.history(
      userId,
      conversationId,
      floorSeq,
      historyLimit,
      text,
    );

    return [
      { role: 'system', content: system },
      ...history,
      // Delimited on the way in, so a paste inside it is subject matter rather
      // than instruction (FR-014, T414). The extraction call never sees this
      // form — it reads the member's raw sentence and only that.
      { role: 'user', content: delimitQuoted(text) },
    ];
  }

  /**
   * The recent transcript, above the clear watermark.
   *
   * `floorSeq` is the caller's `conversation.clearedUpToSeq`, and passing it as
   * `afterSeq` is the whole of FR-011 on this path: a cleared chat contributes
   * no history, because every row it has is at or below the watermark and the
   * read starts above it. Nothing is filtered afterwards and nothing needs to
   * be — the alternative, reading everything and dropping cleared rows in
   * memory, is a query that carries cleared content into this process on every
   * turn and one forgotten `if` away from carrying it into the prompt.
   *
   * The member's *current* message is dropped if it appears, and it will:
   * `TurnRunner` stores the turn before calling this, so the newest row is the
   * message this prompt is being built to answer. It is appended by `build`
   * itself, delimited — sending it twice would show the model a member who
   * repeats themselves, and asked to answer the *last* message it would answer
   * the undelimited copy. Matched on role and content because `build` is given
   * no `seq` for the current turn; the identity would be cheaper and it belongs
   * on the port.
   */
  private async history(
    userId: string,
    conversationId: string,
    floorSeq: number,
    limit: number,
    text: string,
  ): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
    const rows = await this.messages.inConversation(
      userId,
      conversationId,
      floorSeq,
      HISTORY_SCAN_CAP,
    );

    const last = rows[rows.length - 1];
    const transcript =
      last && last.role === 'user' && last.content === text
        ? rows.slice(0, -1)
        : rows;

    return (
      transcript
        // A stored `system` row is a note about the turn rather than a thing
        // anybody said; replaying it as a system message would put a second set
        // of instructions after the first.
        .filter((row) => row.role === 'user' || row.role === 'assistant')
        .slice(-limit)
        .map((row) => ({
          role: row.role as 'user' | 'assistant',
          content: row.role === 'user' ? delimitQuoted(row.content) : row.content,
        }))
    );
  }
}

/**
 * `coach` and `planner` are the two pinned kinds; everything else is a chat the
 * member started.
 *
 * Written as an exhaustive-by-fallback map rather than a switch over
 * `ConversationKind` because the port types `kind` as a plain string — the
 * assembler is handed whatever the conversation says it is, and a kind added in
 * a later phase should get the general prompt rather than throw a member's turn
 * away.
 */
function templateFor(kind: string): string {
  if (kind === 'coach') return 'coach.md';
  if (kind === 'planner') return 'planner.md';
  return 'chat.md';
}

/** The profile block: only what is recorded, plus the prohibitions. */
function profileBlock(facts: MemberFacts): string {
  const parts: string[] = [];

  parts.push(
    facts.summary ??
      'They have not recorded anything about themselves yet. Ask for the one ' +
        'thing you need for this answer, in a sentence, and use it.',
  );

  if (facts.allergies.length > 0) {
    // Verbatim, in the member's own words, because that is what they are
    // allergic to — a normalised or translated list is a list somebody else
    // wrote. `AllergenGuard` does its own folding over the same strings.
    parts.push(
      `They are allergic to: ${facts.allergies.join(', ')}. Never name any of ` +
        'these, in any language, in any quantity, or as an ingredient in ' +
        'something else.',
    );
  }

  return parts.join('\n\n');
}

/**
 * Today, as the coach and the planner read it.
 *
 * The streak is stated even at zero, and that is the point: zero is a fact
 * about the member's week and the coach is under instructions not to scold it.
 * An absent streak line would leave the model to infer one.
 */
function dayBlock(day: MemberDay): string {
  const lines: string[] = [];

  if (day.tasks.length > 0) {
    lines.push('On their list today:');
    for (const task of day.tasks) lines.push(`- ${task}`);
  } else {
    lines.push('Nothing on their list today.');
  }

  if (day.trainingLine) lines.push(`Training: ${day.trainingLine}`);
  if (day.mealLine) lines.push(`Food: ${day.mealLine}`);
  lines.push(
    `Check-in streak: ${day.streakCurrent} day(s) now, best ${day.streakBest}.`,
  );

  return lines.join('\n');
}
