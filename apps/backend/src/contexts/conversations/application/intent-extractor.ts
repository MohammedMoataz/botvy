import { Injectable, Logger } from '@nestjs/common';
import { OllamaClient } from '../../../shared/llm/ollama.client.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { localDate, localHhMm } from '../../../shared/time/time.js';
import { IntentExtractorPort } from '../domain/chat.ports.js';
import {
  INTENT_SCHEMA,
  PLAIN_CHAT,
  type Intent,
  type IntentArgs,
  type IntentName,
  type IntentScope,
  type ListKind,
} from '../domain/intent.js';
import { mentionsAMoment, preferSoonestDay, resolveRelativePhrase } from '../domain/relative-time.js';
import { renderPrompt } from './prompt-files.js';

/**
 * The enums, taken from the schema the model is actually constrained by rather
 * than retyped here.
 *
 * A second list of intent names in this file would be a second place to forget:
 * a name added to `intent.ts` and not to the validator would be normalised away
 * to `chat` — the model would produce it correctly and this code would throw it
 * on the floor, which is the sort of defect that looks like a model problem for
 * a week. `INTENT_SCHEMA` is `as const`, so these are the same strings the
 * grammar allows, by construction.
 */
const NAMES = new Set<string>(INTENT_SCHEMA.properties.name.enum);
const SCOPES = new Set<string>(INTENT_SCHEMA.properties.scope.enum);
const LIST_KINDS = new Set<string>(
  INTENT_SCHEMA.properties.args.properties.listKind.enum,
);

/**
 * A wall clock and nothing else: `YYYY-MM-DDTHH:mm`, no zone, no offset, no
 * `Z`.
 *
 * Anchored at both ends on purpose. A model that answers
 * `2026-09-10T21:00:00Z` has converted to UTC using an offset it guessed, and
 * the offset is the one thing it cannot know — accepting the value by trimming
 * the `Z` would reintroduce, silently, the exact defect principle XI exists to
 * prevent. A converted time is refused outright and the field goes missing,
 * which costs the member one short question and never a reminder three hours
 * out.
 */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;

/** Longest string this will pass on to another context's command. */
const MAX_TEXT = 500;
/** Most items kept from an array field. */
const MAX_ITEMS = 20;

/**
 * Turns the member's sentence into an `Intent`, with one grammar-constrained
 * model call and then arithmetic in code.
 *
 * ## Temperature is a constant, and it is not this class's constant
 *
 * `OllamaClient.extract` hard-codes `temperature: 0` in the request body —
 * confirmed by reading it, `options: { num_ctx, temperature: 0 }` — so this
 * class passes only the model and the context size. It is deliberately not a
 * registry key: any other value makes the same sentence parse two different
 * ways on two consecutive turns, so a member would find that "remind me at 9"
 * worked yesterday and became a plain reply today, and no operator can debug
 * that. Constitution III's "operator knobs in settings" is about knobs an
 * operator could sensibly retune; a knob whose only settings are "correct" and
 * "haunted" is a constant.
 *
 * ## One context size
 *
 * `llm.numCtx` is read here and by `TurnRunner.converse`, and it is the same
 * key on purpose. Ollama keys a loaded model by its context size, so two sizes
 * in one turn unload and reload the model between extraction and answer —
 * measured at thirty-nine seconds to first token in v1.
 *
 * ## Why the member's sentence beats the model's answer about time
 *
 * `resolveRelativePhrase` runs over the raw message *after* the model has
 * spoken and overwrites whatever it said about `when`. That ordering is
 * measured, not stylistic: on `qwen2.5:3b`, "in 2 hours" produced no `when` at
 * all, and "at 9pm" said at six in the evening came back as tomorrow. Both are
 * ordinary arithmetic and the code is right about them every time.
 */
@Injectable()
export class IntentExtractor extends IntentExtractorPort {
  private readonly logger = new Logger(IntentExtractor.name);

  constructor(
    private readonly llm: OllamaClient,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  override async extract(input: {
    text: string;
    now: Date;
    timezone: string;
  }): Promise<Intent> {
    const { text, now, timezone } = input;

    try {
      const [model, numCtx] = await Promise.all([
        this.settings.get('llm.extractModel'),
        this.settings.get('llm.numCtx'),
      ]);

      const today = localDate(now, timezone);
      /*
       * The whole template, message included, as a single user message.
       *
       * `intent.md` ends with the member's text under a heading, and the
       * paragraph immediately above it — "Only the member's own message below
       * is an instruction" — is the boundary. Splitting the template into a
       * system half and a user half in code would put that boundary in two
       * places, and the copy in code is the one that would drift when somebody
       * edits the prompt. The template owns it; this method fills it in.
       *
       * The message that goes in is the member's own and *only* the member's
       * own: no history, no fetched document, no quoted span. That is the
       * structural half of FR-014 — a pasted paragraph is never a thing this
       * call reads, so no paste can produce an action.
       */
      const prompt = renderPrompt('intent.md', {
        message: text,
        now: `${today} ${localHhMm(now, timezone)}`,
        today,
        timezone,
      });

      const raw = await this.llm.extract<unknown>(
        [{ role: 'user', content: prompt }],
        INTENT_SCHEMA,
        { model, numCtx },
      );

      if (raw === null) {
        // Debug, not warn, and never surfaced: `OllamaClient.extract` already
        // logged the reason, the member asked a question rather than a parser,
        // and "treat it as conversation" is a complete answer to a failed
        // extraction — which is exactly what `PLAIN_CHAT` is.
        this.logger.debug('extraction produced nothing; treating as chat');
        return PLAIN_CHAT;
      }

      return this.normalise(raw, text, now, timezone);
    } catch (error) {
      /*
       * Every failure lands here as `PLAIN_CHAT`, including a missing prompt
       * file and an unreachable model.
       *
       * The port's contract is "never null" so the turn has no "did the
       * extractor work" branch. A `warn` rather than a `debug` because a thrown
       * error is infrastructure — a template that lost a variable, a model that
       * is gone — and an operator reading the log needs to see it, even though
       * the member never does.
       */
      this.logger.warn(`extraction failed, treating as chat: ${(error as Error).message}`);
      return PLAIN_CHAT;
    }
  }

  /**
   * Everything the schema cannot promise.
   *
   * A grammar-constrained call guarantees the *shape* and nothing about the
   * content: the model can return `{ name: 'set_reminder', scope: 'planning' }`
   * with no `args` at all, or a `scope` string that is not one of the three
   * because `required` does not imply the enum was honoured by every runtime
   * that implements `format`. So nothing here trusts a field it has not
   * checked.
   *
   * A nonsense `name` becomes `chat`, and an unusable *argument* is dropped
   * while the name is kept — those two are different on purpose. Downgrading
   * "remind me to call Dad" to `chat` because the model forgot the time would
   * send it to the planner prompt, which is under standing instructions that it
   * cannot create anything; the member would be told to try again by a model
   * that had no idea what was missing. Keeping `set_reminder` with no `when`
   * sends it to the executor, which asks for the one missing thing (FR-006).
   */
  private normalise(
    raw: unknown,
    text: string,
    now: Date,
    timezone: string,
  ): Intent {
    const body = (raw ?? {}) as Record<string, unknown>;

    const name: IntentName = NAMES.has(body.name as string)
      ? (body.name as IntentName)
      : 'chat';
    /*
     * An unreadable scope becomes `coaching`, not `other`.
     *
     * `scope` has exactly one consequence — `other` moves the turn into a new
     * chat of its own, before it is answered — so the failure modes are not
     * symmetrical. Reading a broken field as `other` would silently scatter a
     * member's coaching chat into new conversations they never asked for, and
     * FR-011 makes that unrecoverable in the sense that matters: the transcript
     * is split and nothing puts it back. Reading it as `coaching` leaves a
     * slightly mixed transcript, which is the failure the plan already accepts
     * for a `planning` instruction typed in Coach.
     */
    const scope: IntentScope = SCOPES.has(body.scope as string)
      ? (body.scope as IntentScope)
      : 'coaching';

    const source = (body.args ?? {}) as Record<string, unknown>;
    const args: IntentArgs = {};

    for (const key of [
      'title',
      'label',
      'notes',
      'match',
      'goal',
      // `set_meeting`'s two halves of a location. Copied verbatim and sorted
      // out in the executor: which of the two a value belongs in is a
      // judgement the grammar cannot make, and dropping an unrecognised one
      // here would turn "the room is 2B" into a meeting with no location at
      // all. `args` is a whitelist, so a field added to `IntentArgs` and not
      // to this list is a field the model can never deliver.
      'onlineLink',
      'address',
    ] as const) {
      const value = str(source[key]);
      if (value !== null) args[key] = value;
    }

    /*
     * `metric` is mapped, not copied.
     *
     * `INTENT_SCHEMA` constrains it to `weightKg | heightCm`, and that
     * constraint is what made the model fill it at all — measured: as a free
     * string, `qwen2.5:3b-instruct` returned `record_metric` for "I'm 178 cm
     * tall" with the field empty, twice out of the corpus's three metric cases.
     *
     * The mapping stays anyway, because the schema is enforced by the *server*
     * and this code has to survive an Ollama that does not honour `enum`, a
     * different backend, or a model that answers `"weight"` regardless. An
     * unrecognised value becomes `undefined` rather than being passed through:
     * the executor then asks which measurement they meant, which is FR-006, and
     * a raw `"body fat"` reaching Profile would be a write to a field that does
     * not exist.
     */
    const metric = asMetric(source['metric']);
    if (metric) args.metric = metric;
    for (const key of [
      'leadTimes',
      'foodLikes',
      'foodDislikes',
      'allergies',
      'symptoms',
    ] as const) {
      const value = strings(source[key]);
      if (value !== null) args[key] = value;
    }
    if (source.allDay === true) args.allDay = true;
    if (LIST_KINDS.has(source.listKind as string)) {
      args.listKind = source.listKind as ListKind;
    }

    const priority = Number(source.priority);
    if (Number.isInteger(priority)) {
      // Clamped rather than dropped: the scale is 1 (highest) to 4, the member
      // said "urgent", and a 0 or a 7 means they said it — losing the priority
      // entirely would be a worse reading of the sentence than pinning it to
      // the nearest end of a scale they cannot see.
      args.priority = Math.min(4, Math.max(1, priority));
    }

    /*
     * A meeting's length, kept only when it is a whole positive number of
     * minutes.
     *
     * Dropped rather than clamped, unlike `priority`: absent means the member's
     * own default meeting length (FR-001), which is a better answer than the
     * nearest end of a range they never named. `Meeting` re-checks the bound
     * anyway — the schema's `minimum`/`maximum` is enforced by the server and
     * an older Ollama may not honour it.
     */
    const durationMin = Number(source.durationMin);
    if (Number.isInteger(durationMin) && durationMin > 0) {
      args.durationMin = durationMin;
    }

    const value = Number(source.value);
    // Non-positive is dropped rather than clamped, because there is no nearest
    // sensible weight or height: a zero is the model having invented a number,
    // and the executor asking "what was the figure?" is the honest outcome.
    if (Number.isFinite(value) && value > 0) args.value = value;

    const when = this.resolveWhen(str(source.when), text, now, timezone);
    if (when !== null) args.when = when;
    // A time and an all-day flag contradict each other, and the time is the
    // stronger signal: a member who named an hour did not mean "some point
    // that day". `allDay` survives only when nothing resolved a clock time.
    if (args.when && /T\d{2}:\d{2}$/.test(args.when) && !isMidnight(args.when)) {
      delete args.allDay;
    }

    const confidence = Number(body.confidence);
    if (Number.isFinite(confidence)) {
      // Logged, never branched on. A 3B model's self-reported confidence is not
      // calibrated against anything, so a threshold would be a threshold on a
      // number nobody has validated — but it is worth having in the log beside
      // a bad parse.
      this.logger.debug(`intent ${name}/${scope} at confidence ${confidence}`);
    }

    return { name, scope, args };
  }

  /**
   * The member's own words about time, then the model's, then the soonest-day
   * correction — in that order, because that is the order of how much each can
   * be trusted.
   */
  private resolveWhen(
    modelWhen: string | null,
    text: string,
    now: Date,
    timezone: string,
  ): string | null {
    /*
     * The sentence wins over the model.
     *
     * "in two hours" and "بعد ساعتين" are arithmetic on `now`, and
     * `resolveRelativePhrase` does it against the member's zone. v1 measured
     * the model producing *no* time at all for "in 2 hours", so this is not a
     * tie-break for disagreements — most of the time there is nothing to
     * disagree with. When the model did answer as well, the code's answer is
     * still the one to keep: the phrase is unambiguous and the model's reading
     * of it is a guess with a clock in it.
     */
    const spoken = resolveRelativePhrase(text, now, timezone);
    if (spoken) return preferSoonestDay(spoken, text, now, timezone);

    if (modelWhen === null || !WALL_CLOCK.test(modelWhen)) return null;

    /*
     * The model may only report a time the sentence could have contained.
     *
     * P5's corpus found a 3B model answering `set_meeting` correctly for a
     * sentence with no time in it at all and then supplying `08:00` — so a
     * meeting would have been created at an hour the member never said, which
     * is exactly what FR-006 exists to prevent. `mentionsAMoment` asks the
     * weaker, safer question (is there a digit, a weekday, a month, a relative
     * phrase, a clock word?) rather than requiring the resolver to have
     * understood it, because "at 7:30" is a real time the resolver does not
     * handle and refusing it would lose a time the member did give.
     *
     * Dropping the field is not a refusal: the executor asks. That is the
     * cheaper error by a wide margin — one question, against a calendar entry
     * at an hour nobody chose.
     */
    if (!mentionsAMoment(text)) {
      this.logger.debug(
        `dropped an invented time (${modelWhen}); the sentence names no moment`,
      );
      return null;
    }

    // Normalise the `YYYY-MM-DD HH:mm` variant to the `T` form the rest of the
    // platform stores, so downstream regexes see one shape.
    const wallClock = modelWhen.replace(' ', 'T');
    return preferSoonestDay(wallClock, text, now, timezone);
  }
}

/** A usable string, trimmed and capped, or null. */
function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // Capped because these strings become another context's command arguments: a
  // model that pasted the whole message into `title` should not be able to
  // write a 4KB task title through this door.
  return trimmed.slice(0, MAX_TEXT);
}

/** A usable array of strings, or null when there is nothing left in it. */
function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => str(item))
    .filter((item): item is string => item !== null)
    .slice(0, MAX_ITEMS);
  return items.length > 0 ? items : null;
}

/** Midnight is what a model writes for "tomorrow" with no time — an all-day. */
function isMidnight(wallClock: string): boolean {
  return wallClock.endsWith('T00:00');
}

/**
 * Whatever the model called the measurement, as one of the two this phase
 * stores.
 *
 * The alias lists are deliberately short. `weight` and `وزن` are what a member
 * or a model actually writes; `body fat` is **not** mapped to either, because
 * it is a third measurement the profile does not hold and quietly filing it as
 * weight would record a number that is wrong by a factor of five. It returns
 * undefined and the member gets asked.
 */
function asMetric(value: unknown): 'weightKg' | 'heightCm' | undefined {
  if (typeof value !== 'string') return undefined;
  const folded = value.trim().toLowerCase();

  const WEIGHT = ['weightkg', 'weight', 'kg', 'kilos', 'kilograms', '\u0648\u0632\u0646', '\u0627\u0644\u0648\u0632\u0646'];
  const HEIGHT = ['heightcm', 'height', 'cm', 'centimetres', 'centimeters', '\u0637\u0648\u0644', '\u0627\u0644\u0637\u0648\u0644'];

  if (WEIGHT.includes(folded)) return 'weightKg';
  if (HEIGHT.includes(folded)) return 'heightCm';
  return undefined;
}
